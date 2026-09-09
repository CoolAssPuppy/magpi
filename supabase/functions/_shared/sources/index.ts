// The driver registry. Everything that reads a source names a provider and gets
// a driver, so adding a fifth is one file plus a row in `providers`.

import { ApiError } from '../errors.ts';
import type { SourceDriver } from './contract.ts';
import { googleDriver } from './google.ts';
import { linearDriver } from './linear.ts';
import { notionDriver } from './notion.ts';
import { slackDriver } from './slack.ts';

const DRIVERS: readonly SourceDriver[] = [notionDriver, linearDriver, slackDriver, googleDriver];

const BY_SLUG = new Map(DRIVERS.map((driver) => [driver.provider, driver]));

export const SOURCE_PROVIDERS: readonly string[] = DRIVERS.map((driver) => driver.provider);

/**
 * A provider row can exist without a driver behind it: the registry is a
 * migration and the driver is a deploy, and the two land in that order. Saying
 * so plainly beats a sync that fails on an undefined method call.
 */
export function driverFor(provider: string): SourceDriver {
  const driver = BY_SLUG.get(provider);
  if (!driver) {
    throw new ApiError(400, 'unknown_provider', `no driver is registered for ${provider}`);
  }
  return driver;
}

export function hasDriver(provider: string): boolean {
  return BY_SLUG.has(provider);
}
