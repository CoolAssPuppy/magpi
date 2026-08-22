// Google Calendar and Gmail, reduced to what three badge pages need.
//
// Calendar is asked for expanded single events in start order, so recurrence
// never has to be worked out here. Gmail is asked for metadata only: the badge
// shows a subject line and a number, and a message body has no route to it.

import { DAY_BLOCKS, DAY_START_HOUR } from "../badge-constants.ts";
import type { CalendarEvent, DayShape, FetchDeps, ProviderCredentials } from "./contract.ts";
import {
  asArray,
  asCount,
  asRecord,
  asString,
  firstLine,
  HOUR_MS,
  localClock,
  localDayStart,
  localParts,
  MINUTE_MS,
  parseInstant,
  requestJson,
  zonedInstant,
} from "./common.ts";

const PROVIDER = "google";
const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1";

const RECONNECT = "reconnect google on the connections page";
const UNAVAILABLE = "google is not answering, this page will retry";

const NO_TITLE = "(no title)";
/** An all-day event has no clock time, so it fills the wearer's whole day. */
const ALL_DAY_START = "00:00";
const ALL_DAY_END = "23:59";

// -- Calendar ----------------------------------------------------------------

interface ParsedEvent {
  title: string;
  startMs: number;
  endMs: number;
  allDay: boolean;
  location: string | null;
  conferencing: string | null;
}

const CONFERENCE_LABELS: ReadonlyArray<readonly [RegExp, string]> = [
  [/meet\.google|hangout|google\s*meet/i, "MEET"],
  [/zoom/i, "ZOOM"],
  [/teams\.microsoft|microsoft\s*teams/i, "TEAMS"],
  [/webex/i, "WEBEX"],
];

function conferenceLabel(item: Record<string, unknown>): string | null {
  const conference = asRecord(item.conferenceData);
  const solution = asString(asRecord(conference.conferenceSolution).name);
  const entries = asArray(conference.entryPoints)
    .map((entry) => asString(asRecord(entry).uri))
    .join(" ");
  const haystack = `${solution} ${entries} ${asString(item.hangoutLink)}`;

  for (const [pattern, label] of CONFERENCE_LABELS) {
    if (pattern.test(haystack)) return label;
  }

  // A solution nobody here has heard of still has a name worth one word of.
  const word = solution.trim().split(/\s+/)[0];
  return word.length > 0 ? word.toUpperCase() : null;
}

/** A `start` or `end` bound, which is either a timestamp or a bare date. */
function boundInstant(bound: Record<string, unknown>, timeZone: string): number | null {
  const timed = parseInstant(bound.dateTime);
  if (timed !== null) return timed;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asString(bound.date));
  if (!match) return null;
  return zonedInstant(Number(match[1]), Number(match[2]), Number(match[3]), 0, timeZone).getTime();
}

function parseEvent(raw: unknown, timeZone: string): ParsedEvent | null {
  const item = asRecord(raw);
  const start = asRecord(item.start);
  const startMs = boundInstant(start, timeZone);
  if (startMs === null) return null;

  const endMs = boundInstant(asRecord(item.end), timeZone) ?? startMs;
  return {
    title: firstLine(item.summary) ?? NO_TITLE,
    startMs,
    endMs,
    allDay: asString(start.dateTime).length === 0 && asString(start.date).length > 0,
    location: firstLine(item.location),
    conferencing: conferenceLabel(item),
  };
}

async function listEvents(
  creds: ProviderCredentials,
  deps: FetchDeps,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<ParsedEvent[]> {
  const url = new URL(`${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("timeMin", timeMin.toISOString());
  url.searchParams.set("timeMax", timeMax.toISOString());

  const body = asRecord(
    await requestJson(PROVIDER, deps, url.toString(), {
      headers: { authorization: `Bearer ${creds.accessToken}` },
      reconnectMessage: RECONNECT,
      failureMessage: UNAVAILABLE,
    }),
  );

  const events: ParsedEvent[] = [];
  for (const raw of asArray(body.items)) {
    const parsed = parseEvent(raw, deps.timeZone);
    if (parsed) events.push(parsed);
  }
  return events;
}

export interface NextEventsOptions {
  calendarId: string;
  lookAheadHours: number;
  skipAllDay: boolean;
  limit: number;
}

export async function nextEvents(
  creds: ProviderCredentials,
  deps: FetchDeps,
  options: NextEventsOptions,
): Promise<CalendarEvent[]> {
  const limit = Math.max(0, Math.floor(options.limit));
  if (limit === 0) return [];

  const nowMs = deps.now.getTime();
  const events = await listEvents(
    creds,
    deps,
    options.calendarId,
    deps.now,
    new Date(nowMs + Math.max(0, options.lookAheadHours) * HOUR_MS),
  );

  const kept = options.skipAllDay ? events.filter((event) => !event.allDay) : events;
  kept.sort((left, right) => left.startMs - right.startMs);

  return kept.slice(0, limit).map((event) => ({
    title: event.title,
    start: event.allDay ? ALL_DAY_START : localClock(new Date(event.startMs), deps.timeZone),
    end: event.allDay ? ALL_DAY_END : localClock(new Date(event.endMs), deps.timeZone),
    location: event.location,
    conferencing: event.conferencing,
    // Negative while an event is running, which the page reads as "now".
    minutesUntil: Math.floor((event.startMs - nowMs) / MINUTE_MS),
    allDay: event.allDay,
  }));
}

/** 0 free, then 1, 2, 3 as the booked share of the hour passes a third and two. */
function blockLevel(bookedMinutes: number): number {
  if (bookedMinutes <= 0) return 0;
  const fraction = Math.min(1, bookedMinutes / 60);
  if (fraction > 2 / 3) return 3;
  if (fraction > 1 / 3) return 2;
  return 1;
}

export interface DayShapeOptions {
  calendarId: string;
  forTomorrow: boolean;
}

export async function dayShape(
  creds: ProviderCredentials,
  deps: FetchDeps,
  options: DayShapeOptions,
): Promise<DayShape> {
  const windowStart = localDayStart(deps, options.forTomorrow ? 1 : 0, DAY_START_HOUR);
  const startMs = windowStart.getTime();
  const endMs = startMs + DAY_BLOCKS * HOUR_MS;

  const events = await listEvents(creds, deps, options.calendarId, windowStart, new Date(endMs));

  const booked = new Array<number>(DAY_BLOCKS).fill(0);
  let meetingCount = 0;

  for (const event of events) {
    // An all-day event would paint the whole strip and say nothing about how
    // busy the day is.
    if (event.allDay) continue;
    const from = Math.max(event.startMs, startMs);
    const to = Math.min(event.endMs, endMs);
    if (to <= from) continue;
    meetingCount += 1;

    for (let block = 0; block < DAY_BLOCKS; block += 1) {
      const blockStart = startMs + block * HOUR_MS;
      const overlap = Math.min(to, blockStart + HOUR_MS) - Math.max(from, blockStart);
      if (overlap > 0) booked[block] += overlap / MINUTE_MS;
    }
  }

  // Overlapping meetings can book an hour twice over, and an hour has 60
  // minutes either way.
  const capped = booked.map((minutes) => Math.min(60, minutes));

  return {
    blocks: capped.map(blockLevel),
    currentHour: localParts(deps.now, deps.timeZone).hour,
    freeMinutes: Math.round(capped.reduce((free, minutes) => free + (60 - minutes), 0)),
    meetingCount,
  };
}

// -- Gmail -------------------------------------------------------------------

export interface UnreadOptions {
  query: string;
}

export async function unreadCount(
  creds: ProviderCredentials,
  deps: FetchDeps,
  options: UnreadOptions,
): Promise<{ count: number; recent: string | null }> {
  const headers = { authorization: `Bearer ${creds.accessToken}` };

  const listUrl = new URL(`${GMAIL_BASE}/users/me/messages`);
  listUrl.searchParams.set("q", options.query);
  // Only the newest message is ever opened, so only its id is worth asking for.
  listUrl.searchParams.set("maxResults", "1");

  const list = asRecord(
    await requestJson(PROVIDER, deps, listUrl.toString(), {
      headers,
      reconnectMessage: RECONNECT,
      failureMessage: UNAVAILABLE,
    }),
  );

  const count = asCount(list.resultSizeEstimate);
  const id = asString(asRecord(asArray(list.messages)[0]).id);
  if (id.length === 0) return { count, recent: null };

  const messageUrl = new URL(`${GMAIL_BASE}/users/me/messages/${encodeURIComponent(id)}`);
  // format=metadata with a header allowlist. The body never leaves Google.
  messageUrl.searchParams.set("format", "metadata");
  messageUrl.searchParams.append("metadataHeaders", "Subject");

  const message = asRecord(
    await requestJson(PROVIDER, deps, messageUrl.toString(), {
      headers,
      reconnectMessage: RECONNECT,
      failureMessage: UNAVAILABLE,
    }),
  );

  const subject = asArray(asRecord(message.payload).headers)
    .map(asRecord)
    .find((header) => asString(header.name).toLowerCase() === "subject");

  return { count, recent: subject ? firstLine(subject.value) : null };
}
