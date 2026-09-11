// What every tool is handed: one caller, one request.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { ModelRunner } from '../../_shared/model_client.ts';

/** Where a note's text is written before the ingest job reads it back. */
export interface NoteStore {
  write(storagePath: string, text: string): Promise<void>;
}

export interface ToolContext {
  /** The caller's own client. Row level security decides what each tool can see. */
  supabase: SupabaseClient;
  /** Service role. Only the one write reaches for it, and only after a membership check. */
  admin: SupabaseClient;
  userClaims: { id: string; email?: string };
  jwtClaims: Record<string, unknown>;
  models: ModelRunner;
  notes: NoteStore;
  /** The caller's organization. One per account, so there is nothing to choose. */
  orgId: string;
}
