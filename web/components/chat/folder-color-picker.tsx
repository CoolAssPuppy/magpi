'use client';

import { Check } from 'lucide-react';

import {
  FOLDER_COLORS,
  FOLDER_COLOR_ORDER,
  swatchFor,
  type FolderColor,
} from '@/lib/chat/folder-colors';
import { cn } from '@/lib/utils';

type FolderColorPickerProps = {
  readonly value: FolderColor;
  readonly onChange: (color: FolderColor) => void;
};

/** The colours a folder can wear. The chosen one carries a tick and says so to a screen reader. */
export function FolderColorPicker({ value, onChange }: FolderColorPickerProps) {
  return (
    <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-1.5">
      {FOLDER_COLOR_ORDER.map((color) => {
        const isChosen = color === value;

        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={isChosen}
            aria-label={FOLDER_COLORS[color].label}
            onClick={() => onChange(color)}
            className={cn(
              'flex size-7 items-center justify-center rounded-full border transition-colors motion-reduce:transition-none',
              isChosen ? 'border-foreground' : 'border-transparent hover:border-border',
            )}
          >
            <span
              className="flex size-5 items-center justify-center rounded-full text-background"
              style={{ backgroundColor: swatchFor(color) }}
            >
              {isChosen ? <Check className="size-3" aria-hidden="true" /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
