'use client';

import { useId, useState, useTransition } from 'react';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { ActionState } from '@/lib/actions/state';

export type SpaceChoice = { readonly id: string; readonly name: string };

/** Pick the space and go. The space is the permission decision, so it is asked for here. */
export function ConnectButton({
  providerSlug,
  displayName,
  spaces,
  hasConnection,
  onBegin,
}: {
  providerSlug: string;
  displayName: string;
  spaces: readonly SpaceChoice[];
  hasConnection: boolean;
  onBegin: (providerSlug: string, spaceId: string) => Promise<ActionState<undefined>>;
}) {
  const spaceFieldId = useId();
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? '');
  const [failure, setFailure] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (spaces.length === 0) return null;

  const begin = () => {
    setFailure(null);
    startTransition(async () => {
      const result = await onBegin(providerSlug, spaceId);
      if (result.status === 'error') setFailure(result.message);
    });
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-end justify-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={spaceFieldId} className="text-xs text-tertiary-foreground">
            Into
          </Label>
          <Select value={spaceId} onValueChange={setSpaceId}>
            <SelectTrigger id={spaceFieldId} className="h-8 w-40 text-xs">
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

        <Button
          variant="outline"
          size="sm"
          className="w-28"
          disabled={isPending}
          aria-label={hasConnection ? `Add another ${displayName}` : `Connect ${displayName}`}
          onClick={begin}
        >
          {hasConnection ? 'Add another' : 'Connect'}
        </Button>
      </div>

      {failure ? (
        <p role="alert" className="text-sm text-destructive-600">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
