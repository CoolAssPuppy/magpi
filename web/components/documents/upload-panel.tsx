'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { enqueueUploadedDocument } from '@/app/(app)/documents/actions';
import { FormError } from '@/components/auth/form-error';
import { Dropzone, DropzoneContent, DropzoneEmptyState } from '@/components/dropzone';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSupabaseUpload } from '@/hooks/use-supabase-upload';
import { ACCEPTED_MIME_TYPES, acceptedTypeFor, MAX_UPLOAD_BYTES } from '@/lib/documents/uploads';
import type { SpaceOption } from '@/lib/spaces/spaces';

/** The space selector and the dropzone on one screen, since the space is the permission. */
export function UploadPanel({ spaces }: { spaces: readonly SpaceOption[] }) {
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  // Objects already enqueued, keyed by full path so the same name in two spaces counts twice.
  const recorded = useRef(new Set<string>());
  // The space the objects now going up were written under.
  const uploadedInto = useRef(spaceId);

  const upload = useSupabaseUpload({
    bucketName: 'documents',
    // The storage policy reads this first path segment back against the caller's spaces.
    path: spaceId,
    allowedMimeTypes: [...ACCEPTED_MIME_TYPES],
    maxFileSize: MAX_UPLOAD_BYTES,
    maxFiles: 10,
  });

  const { successes, files, onUpload } = upload;

  const startUpload = useCallback(async () => {
    uploadedInto.current = spaceId;
    await onUpload();
  }, [onUpload, spaceId]);

  useEffect(() => {
    const space = uploadedInto.current;
    const pending = successes.filter((name) => !recorded.current.has(`${space}/${name}`));
    if (pending.length === 0) return;

    for (const name of pending) {
      recorded.current.add(`${space}/${name}`);
      const file = files.find((candidate) => candidate.name === name);
      const mimeType = acceptedTypeFor(file?.type ?? '', name);
      if (!mimeType) {
        setError(`${name} is not a kind of file that can be read.`);
        continue;
      }

      void enqueueUploadedDocument({
        spaceId: space,
        objectName: name,
        title: name,
        mimeType,
      }).then((state) => {
        if (state.status === 'error') setError(state.message);
      });
    }
  }, [successes, files]);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <FormError message={error} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="space">Put these in</Label>
        <Select value={spaceId} onValueChange={setSpaceId}>
          <SelectTrigger id="space" className="w-full">
            <SelectValue placeholder="Choose a space" />
          </SelectTrigger>
          <SelectContent>
            {spaces.map((space) => (
              <SelectItem key={space.id} value={space.id}>
                {space.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Dropzone {...upload} onUpload={startUpload}>
        <DropzoneEmptyState />
        <DropzoneContent />
      </Dropzone>
    </div>
  );
}
