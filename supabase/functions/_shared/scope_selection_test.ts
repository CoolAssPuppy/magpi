import { assertEquals } from '@std/assert';

import { buildScopeSelection, selectedIdsOf, storedSelectionOf } from './scope_selection.ts';

const CHANNELS = [
  { id: 'C01', name: '#aurora' },
  { id: 'C02', name: '#beacon' },
];

Deno.test('a column the picker has never populated reads as no selection', () => {
  // jsonb defaults to {}, and a connection in that state still syncs.
  assertEquals(selectedIdsOf({}), { ids: [] });
  assertEquals(selectedIdsOf(null), { ids: [] });
  assertEquals(storedSelectionOf({}), null);
});

Deno.test('a stored selection hands the driver the ids it picked', () => {
  const stored = buildScopeSelection('channel', CHANNELS, ['C02']);
  assertEquals(selectedIdsOf(stored), { ids: ['C02'] });
});

Deno.test('the picker keeps what is on offer alongside what was chosen', () => {
  const stored = buildScopeSelection('channel', CHANNELS, ['C01']);
  assertEquals(stored.kind, 'channel');
  assertEquals(stored.available, [{ id: 'C01', name: '#aurora' }, { id: 'C02', name: '#beacon' }]);
  assertEquals(stored.selected, ['C01']);
});

Deno.test('a choice the provider no longer offers is dropped', () => {
  // An archived channel is not something the connection can read.
  assertEquals(buildScopeSelection('channel', CHANNELS, ['C01', 'C99']).selected, ['C01']);
});

Deno.test('a selection of the wrong shape reads as none rather than raising', () => {
  assertEquals(selectedIdsOf({ ids: ['C01'] }), { ids: [] });
  assertEquals(selectedIdsOf({ kind: 'channel', available: [], selected: 'C01' }), { ids: [] });
  assertEquals(selectedIdsOf({ kind: 'inbox', available: [], selected: [] }), { ids: [] });
});

Deno.test('an empty selection is a real answer, not a missing one', () => {
  const stored = buildScopeSelection(
    'folder',
    [{ id: 'F1', name: 'Runbooks' }],
    [],
  );
  assertEquals(stored.selected, []);
  assertEquals(storedSelectionOf(stored)?.available.length, 1);
});

Deno.test('a stored option carries an id and a name and nothing else', () => {
  // The column is jsonb, so the read drops any option field the picker does not render.
  const stored = storedSelectionOf({
    kind: 'channel',
    available: [{ id: 'C01', name: '#aurora', url: 'https://slack.example/C01' }],
    selected: ['C01'],
  });

  assertEquals(stored?.available, [{ id: 'C01', name: '#aurora' }]);
});
