import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';

/**
 * One answered question, against the organization's monthly allowance.
 *
 * Written through the service client, the same way model_calls is: a client has
 * no insert grant on usage_events, and a meter a user can write is a meter.
 */
export async function recordQuery(orgId: string): Promise<void> {
  const { error } = await createServiceClient()
    .from('usage_events')
    .insert({ org_id: orgId, kind: 'query', quantity: 1 });

  if (error) throw new Error(`query meter write failed: ${error.message}`);
}
