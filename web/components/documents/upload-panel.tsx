'use client';

import { useEffect, useState } from 'react';

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
import type { SpaceOption } from '@/lib/spaces/spaces';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * The space selector and the dropzone are on one screen because choosing the
 * space is the permission decision. Splitting them into two steps is how a
 * document ends up in the wrong place.
 */
export function UploadPanel({ spaces }: { spaces: readonly SpaceOption[] }) {
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<readonly string[]>([]);

  const upload = useSupabaseUpload({
    bucketName: 'documents',
    // The first path segment is the permission decision. The storage policy
    // reads it back and checks it against the caller's visible spaces.
    path: spaceId,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
    maxFileSize: MAX_FILE_SIZE,
    maxFiles: 10,
  });

  const { successes, files } = upload;

  useEffect(() => {
    const pending = successes.filter((name) => !recorded.includes(name));
    if (pending.length === 0) return;

    setRecorded((previous) => [...previous, ...pending]);

    for (const name of pending) {
      const file = files.find((candidate) => candidate.name === name);
      void enqueueUploadedDocument({
        spaceId,
        storagePath: `${spaceId}/${name}`,
        title: name,
        mimeType: file?.type || 'application/octet-stream',
      }).then((state) => {
        if (state.status === 'error') setError(state.message);
      });
    }
  }, [successes, files, recorded, spaceId]);

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
