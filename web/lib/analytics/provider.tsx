"use client";

import { usePathname } from "next/navigation";
import { createContext, useEffect, type ReactNode } from "react";

import { getAnalytics } from "./client";
import { createNoopAnalytics } from "./noop";
import type { AnalyticsPort } from "./types";

export const AnalyticsContext = createContext<AnalyticsPort>(createNoopAnalytics());

/** Puts the client on the tree and reports a page view per navigation. */
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const analytics = getAnalytics();
  const pathname = usePathname();

  useEffect(() => {
    analytics.pageView(pathname);
  }, [analytics, pathname]);

  return <AnalyticsContext.Provider value={analytics}>{children}</AnalyticsContext.Provider>;
}
