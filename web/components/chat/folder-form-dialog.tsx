'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FolderColor } from '@/lib/chat/folder-colors';

import { FolderColorPicker } from './folder-color-picker';

export type FolderDraft = {
  readonly name: string;
  readonly color: FolderColor;
};

type FolderFormDialogProps = {
  readonly open: boolean;
  readonly heading: string;
  readonly submitLabel: string;
  readonly initial: FolderDraft;
  readonly failure: string | null;
  readonly pending: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (draft: FolderDraft) => void;
};

/** The name and colour of a folder, for making one and for changing one. */
export function FolderFormDialog({ open, onOpenChange, ...form }: FolderFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <FolderForm {...form} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

type FolderFormProps = Omit<FolderFormDialogProps, 'open' | 'onOpenChange'> & {
  readonly onCancel: () => void;
};

// Mounted fresh on each open, so the draft starts from what is stored.
function FolderForm({
  heading,
  submitLabel,
  initial,
  failure,
  pending,
  onCancel,
  onSubmit,
}: FolderFormProps) {
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState<FolderColor>(initial.color);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{heading}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        <Label htmlFor="folder-name">Name</Label>
        <Input
          id="folder-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Color</span>
        <FolderColorPicker value={color} onChange={setColor} />
      </div>

      {failure ? (
        <p role="alert" className="text-sm text-destructive-600">
          {failure}
        </p>
      ) : null}

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onSubmit({ name, color })} disabled={pending || name.trim() === ''}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </>
  );
}
