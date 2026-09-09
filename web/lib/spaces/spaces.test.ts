import { describe, expect, it } from 'vitest';

import { describeKind, sortSpaces, type SpaceKind } from './spaces';

const space = (overrides: Partial<{ id: string; name: string; kind: SpaceKind }> = {}) => ({
  id: 'space-1',
  name: 'Personal',
  kind: 'personal' as SpaceKind,
  ...overrides,
});

describe('space ordering', () => {
  it('puts personal first, then the org space, then teams', () => {
    const ordered = sortSpaces([
      space({ id: 'a', name: 'Growth', kind: 'team' }),
      space({ id: 'b', name: 'Everyone', kind: 'org' }),
      space({ id: 'c', name: 'Personal', kind: 'personal' }),
    ]);

    expect(ordered.map((s) => s.id)).toEqual(['c', 'b', 'a']);
  });

  it('orders teams alphabetically so the selector never reshuffles', () => {
    const ordered = sortSpaces([
      space({ id: 'a', name: 'Zebra', kind: 'team' }),
      space({ id: 'b', name: 'Apples', kind: 'team' }),
    ]);

    expect(ordered.map((s) => s.name)).toEqual(['Apples', 'Zebra']);
  });

  it('leaves the input array alone', () => {
    const input = [space({ id: 'a', kind: 'team' }), space({ id: 'b', kind: 'personal' })];
    sortSpaces(input);
    expect(input.map((s) => s.id)).toEqual(['a', 'b']);
  });
});

describe('space descriptions', () => {
  it('says who can see each kind of space in the user\'s own terms', () => {
    expect(describeKind('personal')).toBe('Only you');
    expect(describeKind('team')).toBe('The people you add');
    expect(describeKind('org')).toBe('Everyone in the organization');
  });
});
