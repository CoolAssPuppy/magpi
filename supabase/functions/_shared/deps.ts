// The injected clients a unit of work is handed, so nothing reaches for a
// global. A job body takes these and can therefore be tested without a server,
// which is what makes moving off Edge Functions a wrapper change.

export interface HttpDeps {
  fetch: typeof fetch;
}

export interface ClockDeps {
  /** Wall clock, so a test can pin the instant a cursor is compared against. */
  now(): Date;
}

export const liveHttp: HttpDeps = {
  fetch: (input: string | URL | Request, init?: RequestInit) => fetch(input, init),
};

export const liveClock: ClockDeps = { now: () => new Date() };

/** A clock that does not move, for tests that assert a timestamp. */
export function fixedClock(instant: Date): ClockDeps {
  return { now: () => new Date(instant.getTime()) };
}
