-- Table privileges, declared here because the stock default privileges grant none of them.

-- anon gets nothing. There is no unauthenticated surface in this product.

-- authenticated reads what its policies allow. The privilege is the outer gate.
grant select on public.organizations to authenticated;
grant update on public.organizations to authenticated;

grant select on public.org_members to authenticated;
grant delete on public.org_members to authenticated;

grant select, insert, delete on public.org_invites to authenticated;

-- update is a column list: a table grant would let a member move a space to another org.
grant select, insert, delete on public.spaces to authenticated;
grant update (name, dreaming_enabled) on public.spaces to authenticated;
grant select, insert, delete on public.space_members to authenticated;

grant select on public.providers to authenticated;

-- A column list, not a table grant, so the encrypted token columns stay unreadable.
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
-- update is a column list so a member can confirm or dismiss a link, not repoint it.
grant select on public.dream_links to authenticated;
grant update (confirmed_at, dismissed_at) on public.dream_links to authenticated;
grant select on public.ingest_jobs to authenticated;

grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;

grant select on public.usage_events to authenticated;
grant select on public.model_calls to authenticated;

-- service_role writes everything. BYPASSRLS skips policies, it does not supply the privilege.
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
