"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * The publishable key with RLS only.
 *
 * The url and key are handed in rather than read here. Both are public by
 * definition, but they only reach a client bundle if Next inlined them at
 * build time, and a variable marked sensitive in the deployment environment is
 * deliberately withheld from the build. That is not a misconfiguration this
 * code can detect: it looks exactly like a variable nobody set. So a server
 * component reads them, where a real environment exists at runtime, and passes
 * them down.
 */
export function createClient(url: string, publishableKey: string) {
  return createBrowserClient(url, publishableKey);
}
