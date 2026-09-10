import { assertEquals } from '@std/assert';

import { buildScopeSelection, selectedIdsOf, storedSelectionOf } from './scope_selection.ts';

const CHANNELS = [
  { id: 'C01', name: '#aurora' },
  { id: 'C02', name: '#beacon' },
];

const ENGINEERING = '11111111-1111-4111-8111-111111111111';
const FINANCE = '22222222-2222-4222-8222-222222222222';

Deno.test('a column the picker has never populated reads as nothing routed', () => {
  // jsonb defaults to {}, and a connection in that state still syncs, reading nothing.
  assertEquals(selectedIdsOf({}), { ids: [] });
  assertEquals(selectedIdsOf(null), { ids: [] });
  assertEquals(storedSelectionOf({}), null);
});

Deno.test('the driver is handed exactly the units that have somewhere to land', () => {
  const stored = buildScopeSelection('channel', CHANNELS, { C02: ENGINEERING });
  assertEquals(selectedIdsOf(stored), { ids: ['C02'] });
});

Deno.test('one account can send two units to two different spaces', () => {
  const stored = buildScopeSelection('channel', CHANNELS, {
    C01: ENGINEERING,
    C02: FINANCE,
  });

  assertEquals(stored.routes, { C01: ENGINEERING, C02: FINANCE });
  assertEquals(selectedIdsOf(stored).ids.sort(), ['C01', 'C02']);
});

Deno.test('the picker keeps what is on offer alongside where each unit goes', () => {
  const stored = buildScopeSelection('channel', CHANNELS, { C01: ENGINEERING });
  assertEquals(stored.kind, 'channel');
  assertEquals(stored.available, [{ id: 'C01', name: '#aurora' }, { id: 'C02', name: '#beacon' }]);
  assertEquals(stored.routes, { C01: ENGINEERING });
});

Deno.test('a route to a unit the provider no longer offers is dropped', () => {
  // An archived channel is not something the connection can read.
  const stored = buildScopeSelection('channel', CHANNELS, {
    C01: ENGINEERING,
    C99: FINANCE,
  });
  assertEquals(stored.routes, { C01: ENGINEERING });
});

Deno.test('a selection of the wrong shape reads as nothing routed rather than raising', () => {
  assertEquals(selectedIdsOf({ ids: ['C01'] }), { ids: [] });
  assertEquals(selectedIdsOf({ kind: 'channel', available: [], routes: 'C01' }), { ids: [] });
  assertEquals(selectedIdsOf({ kind: 'inbox', available: [], routes: {} }), { ids: [] });
  // A route has to name a space, so an id that is not a uuid takes the whole column with it.
  assertEquals(selectedIdsOf({ kind: 'channel', available: [], routes: { C01: 'nope' } }), {
    ids: [],
  });
});

Deno.test('routing nothing is a real answer, not a missing one', () => {
  const stored = buildScopeSelection('folder', [{ id: 'F1', name: 'Runbooks' }], {});
  assertEquals(stored.routes, {});
  assertEquals(storedSelectionOf(stored)?.available.length, 1);
});

Deno.test('a stored option carries an id and a name and nothing else', () => {
  // The column is jsonb, so the read drops any option field the picker does not render.
  const stored = storedSelectionOf({
    kind: 'channel',
    available: [{ id: 'C01', name: '#aurora', url: 'https://slack.example/C01' }],
    routes: { C01: ENGINEERING },
  });

  assertEquals(stored?.available, [{ id: 'C01', name: '#aurora' }]);
});
