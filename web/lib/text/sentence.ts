/**
 * Joins text an edge function wrote onto a prefix this side owns.
 *
 * The rule this exists to serve, worked out across four columns in one evening:
 * what the writer of a message needs from its renderer is whether anything goes
 * in front of it. Everything else follows. Joined onto a prefix the renderer
 * owns, the message is a clause and terminating it belongs to the renderer.
 * Rendered standalone, it arrives whole.
 *
 * Idempotent on purpose, which is what makes a mixed column safe rather than
 * lucky. `dream_runs.error` and `ingest_jobs.error` each carry both shapes: a
 * lowercase clause when a budget was exceeded, a finished sentence when a driver
 * refused or the platform interrupted the run. Both read correctly after a full
 * stop, and neither is rewritten twice.
 */
export function asSentence(message: string): string {
  const trimmed = message.trim();
  const opened = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return opened.endsWith('.') ? opened : `${opened}.`;
}
