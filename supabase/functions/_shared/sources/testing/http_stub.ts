// The one HTTP stub every driver test uses. Every response comes from a recorded fixture on disk.

import { fixedClock } from '../../deps.ts';
import type { SourceDeps } from '../contract.ts';

export interface StubCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

export interface StubRoute {
  /** Answers this route when the predicate matches the outgoing request. */
  when(call: StubCall): boolean;
  /** Fixture body, already loaded. */
  body?: unknown;
  /** Non-JSON body, for the cases a driver has to survive. */
  text?: string;
  status?: number;
}

export interface SourceStub extends SourceDeps {
  calls: StubCall[];
}

/** The instant every driver fixture was recorded against. */
export const FIXTURE_NOW = new Date('2026-09-09T12:00:00.000Z');

/** Reads one recorded response from the fixtures beside the drivers. */
export async function loadFixture(provider: string, name: string): Promise<unknown> {
  const path = new URL(`../fixtures/${provider}/${name}.json`, import.meta.url);
  return JSON.parse(await Deno.readTextFile(path));
}

/** A fetch that answers from the first matching route. An unmatched request is an empty 599. */
export function stubSource(routes: StubRoute[], now: Date = FIXTURE_NOW): SourceStub {
  const calls: StubCall[] = [];

  return {
    calls,
    now: fixedClock(now).now,
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      const call: StubCall = {
        url: String(input instanceof Request ? input.url : input),
        method: (init?.method ?? 'GET').toUpperCase(),
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: init?.body === undefined ? null : String(init.body),
      };
      calls.push(call);

      const route = routes.find((candidate) => candidate.when(call));
      if (!route) {
        return await Promise.resolve(new Response('', { status: 599 }));
      }
      if (route.text !== undefined) {
        return await Promise.resolve(new Response(route.text, { status: route.status ?? 200 }));
      }
      return await Promise.resolve(
        new Response(JSON.stringify(route.body ?? {}), {
          status: route.status ?? 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    },
  };
}

/** A stub that answers every request with one status and body. */
export function stubAnswering(status: number, body: unknown = {}): SourceStub {
  return stubSource([{ when: () => true, status, body }]);
}
