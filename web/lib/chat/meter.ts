import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';

/** Meters one answered question, through the service client because clients cannot insert. */
export async function recordQuery(orgId: string): Promise<void> {
  const { error } = await createServiceClient()
    .from('usage_events')
    .insert({ org_id: orgId, kind: 'query', quantity: 1 });

  if (error) throw new Error(`query meter write failed: ${error.message}`);
}
