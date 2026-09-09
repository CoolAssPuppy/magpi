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

grant select, delete on public.connections to authenticated;
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
