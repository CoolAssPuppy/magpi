// Every provider client behind one import, so a page builder names a source
// rather than a file.

export { dayShape, nextEvents, unreadCount } from "./google.ts";
export type { DayShapeOptions, NextEventsOptions, UnreadOptions } from "./google.ts";

export { deployments } from "./vercel.ts";
export type { DeploymentsOptions } from "./vercel.ts";

export { assignedIssues } from "./linear.ts";
export { mentions } from "./slack.ts";
export { reviewRequests } from "./github.ts";
export { insight } from "./posthog.ts";
export { openPages } from "./notion.ts";
export type { NotionOptions } from "./notion.ts";

export { SourceError } from "./contract.ts";
export type {
  CalendarEvent,
  Counter,
  DayShape,
  Deployment,
  DeploymentState,
  FetchDeps,
  NumberReading,
  ProviderCredentials,
} from "./contract.ts";
