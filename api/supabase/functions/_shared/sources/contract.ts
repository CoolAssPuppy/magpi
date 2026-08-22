// What a provider client hands back, and nothing more.
//
// Every shape here is already in the badge's terms: minutes rather than
// timestamps, four levels rather than a duration, a short list rather than a
// page cursor. Reshaping happens in the client, so a page builder is a
// composition rather than a translation, and swapping a provider for another
// that answers the same question is one file.
//
// Strings are not truncated here. The envelope does that once, by key, so a
// client cannot forget to.

export interface CalendarEvent {
  title: string;
  /** Local HH:MM, already in the wearer's timezone. */
  start: string;
  end: string;
  location: string | null;
  conferencing: string | null;
  minutesUntil: number;
  allDay: boolean;
}

export interface DayShape {
  /** DAY_BLOCKS levels of 0 to 3, one per hour from DAY_START_HOUR. */
  blocks: number[];
  currentHour: number;
  freeMinutes: number;
  meetingCount: number;
}

export type DeploymentState = "READY" | "BUILDING" | "ERROR" | "QUEUED" | "CANCELED";

export interface Deployment {
  name: string;
  state: DeploymentState;
  commit: string | null;
  ageMs: number;
}

export interface Counter {
  label: string;
  value: number;
  /** Change since the last cached read. Zero when there is nothing to compare. */
  delta: number;
  recent: string | null;
}

export interface NumberReading {
  label: string;
  value: number;
  unit: string | null;
  /** Oldest first, at most SPARK_POINTS. */
  spark: number[];
  deltaPct: number | null;
  updated: string;
}

/** Credentials a client is handed. The gateway decrypts; a client never does. */
export interface ProviderCredentials {
  accessToken: string;
  /** Host, project id, insight id, and anything else that is not a secret. */
  meta: Record<string, unknown>;
}

export interface FetchDeps {
  fetch: typeof fetch;
  now: Date;
  /** IANA name, so a client can turn a timestamp into the wearer's clock. */
  timeZone: string;
}

/**
 * Raised by a client when the provider refused it.
 *
 * The message reaches the badge, so it says what the wearer can do about it
 * rather than what the HTTP status was.
 */
export class SourceError extends Error {
  readonly provider: string;
  /** True when reconnecting is the fix, which the connections page shows. */
  readonly needsReconnect: boolean;

  constructor(provider: string, message: string, needsReconnect = false) {
    super(message);
    this.name = "SourceError";
    this.provider = provider;
    this.needsReconnect = needsReconnect;
  }
}
