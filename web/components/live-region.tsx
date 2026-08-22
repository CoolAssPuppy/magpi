"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { createClient } from "@/lib/supabase/browser";

export interface LiveRegionProps {
  supabaseUrl: string;
  supabasePublishableKey: string;
  /** Tables to watch. Each must be in the publication and scoped by RLS. */
  tables: string[];
}

/**
 * Refetches the page when a watched table changes.
 *
 * Realtime needs three things: the table in the publication, RLS that scopes
 * the rows, and this component. Miss the publication and the list silently
 * never updates.
 *
 * The event is a signal, never the data. `router.refresh` re-runs the server
 * component, so what lands on screen came through the same query and the same
 * schema as the first render.
 */
export function LiveRegion({ supabaseUrl, supabasePublishableKey, tables }: LiveRegionProps) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient(supabaseUrl, supabasePublishableKey);
    const channel = supabase.channel(`live:${tables.join(",")}`);

    for (const table of tables) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        router.refresh();
      });
    }

    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, supabaseUrl, supabasePublishableKey, tables]);

  return null;
}
