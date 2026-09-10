'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { ActionState } from '@/lib/actions/state';
import type { ConnectionSummary } from '@/lib/connections/view-model';

export type ConnectionAction = (connectionId: string) => Promise<ActionState<undefined>>;

export function ConnectionActions({
  connection,
  onResync,
  onDisconnect,
}: {
  connection: ConnectionSummary;
  onResync: ConnectionAction;
  onDisconnect: ConnectionAction;
}) {
  const [isPending, startTransition] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  const [isConfirmOpen, setConfirmOpen] = useState(false);

  const run = (action: ConnectionAction, onDone?: () => void) => {
    setFailure(null);
    startTransition(async () => {
      const result = await action(connection.id);
      if (result.status === 'error') setFailure(result.message);
      else onDone?.();
    });
  };

  const { recovery } = connection.status;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        {recovery.kind === 'reconnect' ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/connections/${connection.provider}`}>{recovery.label}</Link>
          </Button>
        ) : null}

        {recovery.kind === 'resync' ? (
          <Button variant="outline" size="sm" disabled={isPending} onClick={() => run(onResync)}>
            {recovery.label}
          </Button>
        ) : null}

        <Dialog open={isConfirmOpen} onOpenChange={setConfirmOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm">
              Disconnect
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Disconnect {connection.account}?</DialogTitle>
              <DialogDescription>
                Magpi stops reading this account. Documents already imported stay in their spaces
                and stay searchable.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>
                Keep it
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={isPending}
                onClick={() => run(onDisconnect, () => setConfirmOpen(false))}
              >
                Disconnect
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {failure ? (
        <p role="alert" className="text-xs text-destructive-600">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
