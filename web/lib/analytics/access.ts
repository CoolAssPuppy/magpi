import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { isOrgAdmin } from '@/lib/auth/admin';
import type { Database } from '@/lib/database.types';
import { getSessionContext, type SessionContext } from '@/lib/supabase/context';
import { createServiceClient } from '@/lib/supabase/service';

/** Whether this person may see the admin pages: granted, signed out, or forbidden. */
export type AdminAccess =
  | {
      readonly kind: 'granted';
      readonly context: SessionContext;
      /** Service role, built only after is_org_admin. Every query with it filters on context.orgId. */
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
