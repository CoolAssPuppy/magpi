"use client";

import { useContext } from "react";

import { AnalyticsContext } from "./provider";
import type { AnalyticsPort } from "./types";

/** The only way application code reaches analytics. */
export function useAnalytics(): AnalyticsPort {
  return useContext(AnalyticsContext);
}
