import { assert, assertEquals } from '@std/assert';

import { apiErrorFrom } from '../testing/assertions.ts';
import type { SourceCredentials, SourceDeps, SourceDriver } from './contract.ts';
import { SourceError } from './contract.ts';
import { driverFor, hasDriver, SOURCE_PROVIDERS } from './index.ts';
import { FIXTURE_NOW, stubSource } from './testing/http_stub.ts';

/**
 * A token must never reach a message.
 *
 * Every SourceError message ends up in connections.status_detail, which a user
 * reads on the connections page, and in the function log. A driver that
 * interpolated the credential it was handed would put a live secret in both.
 * The drivers are written not to; this is what keeps it that way when one of
 * them is edited.
 */

const SECRET = 'xoxp-hUnTr2-do-not-leak-me-9f3a';
const SECRET_FRAGMENT = 'hUnTr2';

function credentials(): SourceCredentials {
  return {
    accessToken: SECRET,
    // Ids reach a query string on three of the four drivers, so one carrying
    // the token proves the query is not being echoed into an error either.
    scopeSelection: { ids: ['C0LEAK', SECRET] },
  };
}

/** Answers every request the way a provider does on a bad day. */
function depsAnswering(status: number): SourceDeps {
  return stubSource(
    [
      {
        when: () => true,
        status,
        // A provider's own error body routinely quotes the request back.
        body: { error: SECRET, ok: false, message: `token ${SECRET} was rejected` },
      },
    ],
    FIXTURE_NOW,
  );
}

function depsThatReject(): SourceDeps {
  return {
    now: () => FIXTURE_NOW,
    // A fetch rejection carries the request URL in its cause, and a token can
    // ride in a query string.
    fetch: () => Promise.reject(new Error(`connect failed to https://x/?token=${SECRET}`)),
  };
}

const REFRESH_INPUT = {
  refreshToken: SECRET,
  clientId: 'client-id',
  clientSecret: SECRET,
  tokenUrl: 'https://provider.example/token',
};

interface DriverCall {
  name: string;
  run(driver: SourceDriver, deps: SourceDeps): Promise<unknown>;
}

const CALLS: DriverCall[] = [
  {
    name: 'listChanges',
    run: (driver, deps) => driver.listChanges(credentials(), deps, { cursor: null }),
  },
  {
    name: 'listChanges resuming',
    // Slack's cursor is a per-channel map, so it needs one that parses.
    run: (driver, deps) =>
      driver.listChanges(credentials(), deps, {
        cursor: driver.provider === 'slack'
          ? '{"C0LEAK":"1757419200.000100"}'
          : '2026-09-01T00:00:00.000Z',
      }),
  },
  {
    name: 'fetchDocument',
    run: (driver, deps) => driver.fetchDocument(credentials(), deps, 'C0LEAK:1757419200.000100'),
  },
  {
    name: 'listScopeOptions',
    run: (driver, deps) => driver.listScopeOptions(credentials(), deps),
  },
  { name: 'refresh', run: (driver, deps) => driver.refresh(deps, REFRESH_INPUT) },
];

/**
 * Everything a failure could carry, not just the message: a stack or a cause
 * holding the request URL leaks just as well. A RefreshOutcome is included
 * because `failed` carries a detail string straight onto the connection.
 */
async function surfaceOf(call: DriverCall, driver: SourceDriver, deps: SourceDeps): Promise<string> {
  try {
    return JSON.stringify(await call.run(driver, deps));
  } catch (error) {
    if (!(error instanceof Error)) return String(error);
    const cause = String((error as { cause?: unknown }).cause ?? '');
    return `${error.name} ${error.message} ${error.stack ?? ''} ${cause}`;
  }
}

for (const provider of SOURCE_PROVIDERS) {
  for (const call of CALLS) {
    for (const status of [401, 403, 429, 500]) {
      Deno.test(`${provider}.${call.name} never leaks the token on a ${status}`, async () => {
        const surface = await surfaceOf(call, driverFor(provider), depsAnswering(status));
        assert(!surface.includes(SECRET), `${provider}.${call.name} leaked the whole token`);
        assert(!surface.includes(SECRET_FRAGMENT), `${provider}.${call.name} leaked part of it`);
      });
    }

    Deno.test(`${provider}.${call.name} never leaks the token on a transport failure`, async () => {
      const surface = await surfaceOf(call, driverFor(provider), depsThatReject());
      assert(!surface.includes(SECRET_FRAGMENT), `${provider}.${call.name} leaked part of it`);
    });
  }

  Deno.test(`${provider} asks for a reconnect when its credential is refused`, async () => {
    const driver = driverFor(provider);
    try {
      await driver.listScopeOptions(credentials(), depsAnswering(401));
      throw new Error(`${provider} did not raise on a 401`);
    } catch (error) {
      assert(error instanceof SourceError, `${provider} raised something else`);
      assertEquals(error.needsReconnect, true, `${provider} did not ask for a reconnect`);
    }
  });

  Deno.test(`${provider} does not ask for a needless reconnect on a server fault`, async () => {
    const driver = driverFor(provider);
    try {
      await driver.listScopeOptions(credentials(), depsAnswering(500));
      throw new Error(`${provider} did not raise on a 500`);
    } catch (error) {
      assert(error instanceof SourceError, `${provider} raised something else`);
      assertEquals(error.needsReconnect, false, `${provider} asked for a needless reconnect`);
    }
  });
}

Deno.test('every registered provider resolves to exactly one driver', () => {
  for (const provider of SOURCE_PROVIDERS) {
    assertEquals(driverFor(provider).provider, provider);
    assertEquals(hasDriver(provider), true);
  }
  assertEquals(new Set(SOURCE_PROVIDERS).size, SOURCE_PROVIDERS.length);
});

Deno.test('a provider row with no driver behind it says so', () => {
  assertEquals(hasDriver('dropbox'), false);
  assertEquals(apiErrorFrom(() => driverFor('dropbox')).code, 'unknown_provider');
});
