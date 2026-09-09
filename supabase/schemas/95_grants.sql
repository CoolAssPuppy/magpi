-- Table privileges, declared rather than inherited.
--
-- A stock Supabase project's default privileges for new tables in `public` give
-- anon, authenticated and service_role only TRUNCATE, REFERENCES, TRIGGER and
-- MAINTAIN. RLS decides which rows a caller sees, but a role still needs the
-- table privilege to ask the question at all, and without these grants every
-- policy in 90_policies.sql is unreachable.
--
-- Declaring them here means `supabase db diff` captures them. The spec warns
-- that grants duplicated from default privileges are among the things the diff
-- gets wrong, and this file is what makes the answer explicit instead.

-- anon gets nothing. There is no unauthenticated surface in this product.

-- authenticated reads what its policies allow, and writes only where a policy
-- names it. The privilege is the outer gate; the policy is the real one.
grant select on public.organizations to authenticated;
grant update on public.organizations to authenticated;

grant select on public.org_members to authenticated;
grant delete on public.org_members to authenticated;

grant select, insert, delete on public.org_invites to authenticated;

grant select, insert, update, delete on public.spaces to authenticated;
grant select, insert, delete on public.space_members to authenticated;

grant select on public.providers to authenticated;

-- connections gets a column list rather than a table grant. A column-level
-- revoke cannot subtract from a table-level grant, so the only way to keep
-- access_token_enc and refresh_token_enc unreadable is for the table privilege
-- never to exist. `select *` therefore fails for a client, which is the point:
-- naming your columns means you cannot ask for a token by accident.
grant delete on public.connections to authenticated;
grant select (
  id, org_id, space_id, user_id, provider, external_account_id, scopes,
  scope_selection, status, status_detail, cursor, token_expires_at,
  last_synced_at, created_at, updated_at
) on public.connections to authenticated;
grant select, delete on public.documents to authenticated;
grant select on public.chunks to authenticated;
grant select on public.entities to authenticated;
grant select on public.entity_mentions to authenticated;
grant select on public.dream_runs to authenticated;
grant select, update on public.dream_links to authenticated;
grant select on public.ingest_jobs to authenticated;

grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;

grant select on public.usage_events to authenticated;
grant select on public.model_calls to authenticated;

-- service_role writes everything, inside an edge function, after the caller and
-- what they may touch are already established. BYPASSRLS skips the policies; it
-- does not supply the table privilege.
grant select, insert, update, delete on public.organizations to service_role;
grant select, insert, update, delete on public.org_members to service_role;
grant select, insert, update, delete on public.org_invites to service_role;
grant select, insert, update, delete on public.spaces to service_role;
grant select, insert, update, delete on public.space_members to service_role;
grant select, insert, update, delete on public.providers to service_role;
grant select, insert, update, delete on public.connections to service_role;
grant select, insert, update, delete on public.documents to service_role;
grant select, insert, update, delete on public.chunks to service_role;
grant select, insert, update, delete on public.entities to service_role;
grant select, insert, update, delete on public.entity_mentions to service_role;
grant select, insert, update, delete on public.dream_runs to service_role;
grant select, insert, update, delete on public.dream_links to service_role;
grant select, insert, update, delete on public.ingest_jobs to service_role;
grant select, insert, update, delete on public.conversations to service_role;
grant select, insert, update, delete on public.messages to service_role;
grant select, insert, update, delete on public.usage_events to service_role;
grant select, insert, update, delete on public.model_calls to service_role;
