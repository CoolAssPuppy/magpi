// The driver registry. Everything that reads a source names a provider and gets a driver.

import { ApiError } from '../errors.ts';
import type { SourceDriver } from './contract.ts';
import { googleDriver } from './google.ts';
import { linearDriver } from './linear.ts';
import { notionDriver } from './notion.ts';
import { slackDriver } from './slack.ts';

const DRIVERS: readonly SourceDriver[] = [notionDriver, linearDriver, slackDriver, googleDriver];

const BY_SLUG = new Map(DRIVERS.map((driver) => [driver.provider, driver]));

export const SOURCE_PROVIDERS: readonly string[] = DRIVERS.map((driver) => driver.provider);

/** A provider row can exist before its driver is deployed, so an unknown slug is a plain 400. */
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
