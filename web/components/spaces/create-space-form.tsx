'use client';

import { useActionState } from 'react';

import { createTeamSpace } from '@/app/(app)/spaces/actions';
import { FormError } from '@/components/auth/form-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleState, type ActionState } from '@/lib/actions/state';

async function submit(_previous: ActionState<{ id: string }>, formData: FormData) {
  return createTeamSpace(formData);
}

export function CreateSpaceForm() {
  const [state, formAction, isPending] = useActionState(submit, idleState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <FormError message={state.status === 'error' ? state.message : null} />

      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="name">New team space</Label>
          <Input id="name" name="name" placeholder="Growth" required maxLength={120} />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Creating' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
