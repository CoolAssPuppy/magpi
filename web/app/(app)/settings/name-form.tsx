'use client';

import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleState, type ActionState } from '@/lib/actions/state';

type SettingsAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** One labelled text field and a save button, shared by three settings rows. */
export function NameForm({
  action,
  fieldName,
  label,
  defaultValue,
  placeholder,
  submitLabel,
  pendingLabel,
  savedLabel,
}: {
  action: SettingsAction;
  fieldName: string;
  label: string;
  defaultValue: string;
  placeholder: string;
  submitLabel: string;
  pendingLabel: string;
  savedLabel: string;
}) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(action, idleState);
  const inputId = `name-form-${fieldName}`;

  return (
    <form action={submit} className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-60 flex-col gap-1.5">
        <Label htmlFor={inputId}>{label}</Label>
        <Input
          id={inputId}
          name={fieldName}
          defaultValue={defaultValue}
          placeholder={placeholder}
          required
          maxLength={120}
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>

      {state.status === 'error' ? (
        <p role="alert" className="text-sm text-destructive-600">
          {state.message}
        </p>
      ) : null}
      {state.status === 'success' ? (
        <p className="text-sm text-tertiary-foreground">{savedLabel}</p>
      ) : null}
    </form>
  );
}
