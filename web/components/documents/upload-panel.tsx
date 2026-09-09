'use client';

import { useEffect, useRef, useState } from 'react';

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

/**
 * The space selector and the dropzone are on one screen because choosing the
 * space is the permission decision. Splitting them into two steps is how a
 * document ends up in the wrong place.
 */
export function UploadPanel({ spaces }: { spaces: readonly SpaceOption[] }) {
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  // A ref rather than state: nothing renders from it, and recording a name is
  // how the effect avoids enqueuing the same upload twice, not something the
  // screen reacts to.
  const recorded = useRef(new Set<string>());

  const upload = useSupabaseUpload({
    bucketName: 'documents',
    // The first path segment is the permission decision. The storage policy
    // reads it back and checks it against the caller's visible spaces.
    path: spaceId,
    allowedMimeTypes: [...ACCEPTED_MIME_TYPES],
    maxFileSize: MAX_UPLOAD_BYTES,
    maxFiles: 10,
  });

  const { successes, files } = upload;

  useEffect(() => {
    const pending = successes.filter((name) => !recorded.current.has(name));
    if (pending.length === 0) return;

    for (const name of pending) {
      recorded.current.add(name);
      const file = files.find((candidate) => candidate.name === name);
      const mimeType = acceptedTypeFor(file?.type ?? '', name);
      if (!mimeType) {
        setError(`${name} is not a kind of file that can be read.`);
        continue;
      }

      void enqueueUploadedDocument({ spaceId, objectName: name, title: name, mimeType }).then(
        (state) => {
          if (state.status === 'error') setError(state.message);
        },
      );
    }
  }, [successes, files, spaceId]);

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

      <Dropzone {...upload}>
        <DropzoneEmptyState />
        <DropzoneContent />
      </Dropzone>
    </div>
  );
}
