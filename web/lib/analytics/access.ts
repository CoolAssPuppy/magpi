import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { isOrgAdmin } from '@/lib/auth/admin';
import type { Database } from '@/lib/database.types';
import { getSessionContext, type SessionContext } from '@/lib/supabase/context';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * The result of asking the database whether this person may see the admin
 * surface. Three outcomes, because a signed-out visitor and a member who is not
 * an admin need different answers and neither should see an empty table.
 */
export type AdminAccess =
  | {
      readonly kind: 'granted';
      readonly context: SessionContext;
      /**
       * Service role, constructed only after is_org_admin returned true as the
       * caller. It exists because the org-wide analytics panels read tables whose
       * policies are per space or per user: an admin has no policy that lets them
       * read another member's messages, or a space they are not in. Every query
       * made with it is filtered to context.orgId.
       */
      readonly elevated: SupabaseClient<Database>;
    }
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'forbidden'; readonly context: SessionContext };

export async function resolveAdminAccess(): Promise<AdminAccess> {
  const context = await getSessionContext();
  if (!context) return { kind: 'signed-out' };

  const admin = await isOrgAdmin(context.supabase, context.orgId);
  if (!admin.ok) throw new Error(admin.error);
  if (!admin.data) return { kind: 'forbidden', context };

  return { kind: 'granted', context, elevated: createServiceClient() };
}
