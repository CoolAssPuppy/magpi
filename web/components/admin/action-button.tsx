'use client';

import { useActionState } from 'react';

import { Button, type ButtonProps } from '@/components/ui/button';
import { idleState, type ActionState } from '@/lib/actions/state';

export type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** One server action as its own form, so a row that fails shows the error beside itself. */
export function ActionButton({
  action,
  fieldName,
  fieldValue,
  label,
  pendingLabel,
  variant = 'ghost',
  disabled = false,
}: {
  action: FormAction;
  fieldName?: string;
  fieldValue?: string;
  label: string;
  pendingLabel: string;
  variant?: ButtonProps['variant'];
  disabled?: boolean;
}) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(action, idleState);

  return (
    <form action={submit} className="flex flex-wrap items-center justify-end gap-2">
      {fieldName && fieldValue ? <input type="hidden" name={fieldName} value={fieldValue} /> : null}
      {state.status === 'error' ? (
        <span className="text-xs text-destructive-600">{state.message}</span>
      ) : null}
      <Button type="submit" variant={variant} size="sm" disabled={disabled || pending}>
        {pending ? pendingLabel : label}
      </Button>
    </form>
  );
}
