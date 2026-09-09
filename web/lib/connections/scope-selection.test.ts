import { describe, expect, it } from 'vitest';

import {
  applySelection,
  describeScopeSelection,
  parseScopeSelection,
  type ScopeSelection,
} from './scope-selection';

const getPopulatedSelection = (overrides?: Partial<Record<string, unknown>>) => ({
  kind: 'channel',
  available: [
    { id: 'C1', name: 'general' },
    { id: 'C2', name: 'engineering' },
    { id: 'C3', name: 'design' },
  ],
  selected: ['C1'],
  ...overrides,
});

const parsed = (value: unknown): ScopeSelection => {
  const result = parseScopeSelection(value);
  if (!result.ok) throw new Error(result.error);
  return result.data;
};

describe('scope selection parsing', () => {
  it('reads the column default as a selection the provider has not populated yet', () => {
    expect(parsed({})).toEqual({ kind: 'unset' });
  });

  it('reads a populated selection', () => {
    const selection = parsed(getPopulatedSelection());

    expect(selection).toEqual({
      kind: 'set',
      selectionKind: 'channel',
      available: [
        { id: 'C1', name: 'general', url: null },
        { id: 'C2', name: 'engineering', url: null },
        { id: 'C3', name: 'design', url: null },
      ],
      selected: ['C1'],
    });
  });

  it('keeps the link to a source when the provider gives one', () => {
    const selection = parsed(
      getPopulatedSelection({
        available: [{ id: 'F1', name: 'Roadmap', url: 'https://drive.example/f/1' }],
        selected: [],
        kind: 'folder',
      }),
    );

    expect(selection).toEqual({
      kind: 'set',
      selectionKind: 'folder',
      available: [{ id: 'F1', name: 'Roadmap', url: 'https://drive.example/f/1' }],
      selected: [],
    });
  });

  it('refuses a selection kind the schema does not define', () => {
    const result = parseScopeSelection(getPopulatedSelection({ kind: 'mailbox' }));

    expect(result.ok).toBe(false);
  });

  it('refuses an available list that is not a list of items', () => {
    const result = parseScopeSelection(getPopulatedSelection({ available: ['general'] }));

    expect(result.ok).toBe(false);
  });
});

describe('changing a selection', () => {
  it('accepts a selection drawn from what the provider offered', () => {
    const result = applySelection(parsed(getPopulatedSelection()), ['C2', 'C3']);

    expect(result).toEqual({ ok: true, data: ['C2', 'C3'] });
  });

  it('refuses an id the provider never offered, so a forged form cannot widen the scope', () => {
    const result = applySelection(parsed(getPopulatedSelection()), ['C2', 'C9']);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('C9');
  });

  it('refuses any change while the provider has not said what is available', () => {
    const result = applySelection({ kind: 'unset' }, ['C1']);

    expect(result.ok).toBe(false);
  });

  it('accepts an empty selection, which is how a user pauses a source without disconnecting', () => {
    expect(applySelection(parsed(getPopulatedSelection()), [])).toEqual({ ok: true, data: [] });
  });
});

describe('describing a selection', () => {
  it('counts what is selected against what is available', () => {
    expect(describeScopeSelection(parsed(getPopulatedSelection()))).toBe('1 of 3 channels');
  });

  it('says nothing is selected rather than showing a zero', () => {
    const selection = parsed(getPopulatedSelection({ selected: [] }));

    expect(describeScopeSelection(selection)).toBe('No channels selected');
  });

  it('names a whole workspace rather than counting it', () => {
    const selection = parsed(
      getPopulatedSelection({
        kind: 'workspace',
        available: [{ id: 'W1', name: 'Acme' }],
        selected: ['W1'],
      }),
    );

    expect(describeScopeSelection(selection)).toBe('The whole workspace');
  });

  it('says the provider has not answered yet when the selection is unset', () => {
    expect(describeScopeSelection({ kind: 'unset' })).toBe('Nothing chosen yet');
  });
});
