import { describe, expect, it } from 'vitest';

import {
  describeEmptySelection,
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
        { id: 'C1', name: 'general' },
        { id: 'C2', name: 'engineering' },
        { id: 'C3', name: 'design' },
      ],
      selected: ['C1'],
    });
  });

  it('refuses a selection kind the schema does not define', () => {
    const result = parseScopeSelection(getPopulatedSelection({ kind: 'mailbox' }));

    expect(result.ok).toBe(false);
  });

  it('refuses a stored scope that is not an object at all', () => {
    expect(parseScopeSelection(null).ok).toBe(false);
    expect(parseScopeSelection(['general']).ok).toBe(false);
    expect(parseScopeSelection('general').ok).toBe(false);
  });

  it('refuses an available list that is not a list of items', () => {
    const result = parseScopeSelection(getPopulatedSelection({ available: ['general'] }));

    expect(result.ok).toBe(false);
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

describe('what an empty selection means', () => {
  it('says a channel source reads nothing, because that is what Slack does', () => {
    expect(describeEmptySelection('channel')).toBe(
      'With no channels selected, Recall reads nothing from this source.',
    );
  });

  it('says a folder source reads everything, because that is what Drive does', () => {
    expect(describeEmptySelection('folder')).toBe(
      'With no folders selected, Recall reads everything this account can see.',
    );
  });

  it('has nothing to add for a source that reads a whole workspace either way', () => {
    expect(describeEmptySelection('workspace')).toBeNull();
  });
});
