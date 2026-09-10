import type { Enums } from '@/lib/database.types';

export type FolderColor = Enums<'folder_color'>;

/**
 * The colour a folder can be, as a token reference rather than a value. The database enum is the
 * source of truth for which names exist; this maps each one to what it looks like. See
 * docs/design.md for why no literal appears here.
 */
export const FOLDER_COLORS: Readonly<Record<FolderColor, { swatch: string; label: string }>> = {
  gray: { swatch: 'var(--color-gray-900)', label: 'Gray' },
  brand: { swatch: 'var(--color-brand-600)', label: 'Green' },
  blue: { swatch: 'var(--color-blue-900)', label: 'Blue' },
  indigo: { swatch: 'var(--color-indigo-900)', label: 'Indigo' },
  purple: { swatch: 'var(--color-purple-900)', label: 'Purple' },
  pink: { swatch: 'var(--color-pink-900)', label: 'Pink' },
  crimson: { swatch: 'var(--color-crimson-900)', label: 'Crimson' },
  orange: { swatch: 'var(--color-orange-900)', label: 'Orange' },
  amber: { swatch: 'var(--color-amber-900)', label: 'Amber' },
  green: { swatch: 'var(--color-green-900)', label: 'Grass' },
} as const;

/** In the order the picker offers them. Gray leads, because it is the default. */
export const FOLDER_COLOR_ORDER: readonly FolderColor[] = [
  'gray',
  'brand',
  'blue',
  'indigo',
  'purple',
  'pink',
  'crimson',
  'orange',
  'amber',
  'green',
];

/** A stored colour the enum no longer has reads as the default rather than rendering nothing. */
export function swatchFor(color: string): string {
  return FOLDER_COLORS[color as FolderColor]?.swatch ?? FOLDER_COLORS.gray.swatch;
}
