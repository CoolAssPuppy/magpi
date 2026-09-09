-- Deny by default. Every table has RLS enabled and forced in its own schema file;
-- this file is the complete list of what is then allowed back.
--
-- Writes to connections, documents, chunks, entities and dream_runs happen only
-- under the service role inside edge functions, so those tables get select
-- policies and nothing else.
--
-- auth.uid() is wrapped in a subselect throughout. Postgres then caches it as an
-- initplan instead of re-evaluating it per row.

-- Organizations ------------------------------------------------------------

create policy organizations_select_member on public.organizations
  for select to authenticated
  using (public.is_org_member(id));

create policy organizations_update_admin on public.organizations
  for update to authenticated
  using (public.is_org_admin(id))
  with check (public.is_org_admin(id));

create policy org_members_select_member on public.org_members
  for select to authenticated
  using (public.is_org_member(org_id));

create policy org_members_delete_admin on public.org_members
  for delete to authenticated
  using (public.is_org_admin(org_id) and user_id <> (select auth.uid()));

create policy org_invites_select_admin on public.org_invites
  for select to authenticated
  using (public.is_org_admin(org_id));

create policy org_invites_insert_admin on public.org_invites
  for insert to authenticated
  with check (public.is_org_admin(org_id) and invited_by = (select auth.uid()));

create policy org_invites_delete_admin on public.org_invites
  for delete to authenticated
  using (public.is_org_admin(org_id));

-- Spaces -------------------------------------------------------------------

create policy spaces_select_member on public.spaces
  for select to authenticated
  using (id in (select public.visible_space_ids()));

create policy spaces_insert_org_member on public.spaces
  for insert to authenticated
  with check (public.is_org_member(org_id) and kind = 'team');

-- The column grant in 95_grants.sql is what stops org_id and kind being written.
-- This policy decides which rows, and the with check repeats the membership test
-- so a row cannot be updated out of the caller's own visibility.
create policy spaces_update_member on public.spaces
  for update to authenticated
  using (id in (select public.visible_space_ids()))
  with check (id in (select public.visible_space_ids()));

create policy spaces_delete_admin on public.spaces
  for delete to authenticated
  using (kind = 'team' and public.is_org_admin(org_id));

create policy space_members_select_visible on public.space_members
  for select to authenticated
  using (space_id in (select public.visible_space_ids()));

-- Adding a member is only ever adding someone to a team space you are in, and
-- only within your own organization.
create policy space_members_insert_team on public.space_members
  for insert to authenticated
  with check (
    exists (
      select 1 from public.spaces s
      where s.id = space_id
        and s.kind = 'team'
        and public.is_space_member(s.id)
        and exists (
          select 1 from public.org_members m
          where m.org_id = s.org_id and m.user_id = space_members.user_id
        )
    )
  );

create policy space_members_delete_team on public.space_members
  for delete to authenticated
  using (
    exists (
      select 1 from public.spaces s
      where s.id = space_id and s.kind = 'team' and public.is_space_member(s.id)
    )
  );

-- Providers ----------------------------------------------------------------

create policy providers_select_authenticated on public.providers
  for select to authenticated
  using (true);

-- Content ------------------------------------------------------------------

create policy connections_select_visible on public.connections
  for select to authenticated
  using (space_id in (select public.visible_space_ids()));

create policy connections_delete_owner on public.connections
  for delete to authenticated
  using (user_id = (select auth.uid()) and space_id in (select public.visible_space_ids()));

create policy documents_select_visible on public.documents
  for select to authenticated
  using (space_id in (select public.visible_space_ids()));

-- A user may delete a dream output. That must not delete its sources, which is
-- why this policy is narrowed to origin = 'dream'.
create policy documents_delete_dream on public.documents
  for delete to authenticated
  using (origin = 'dream' and space_id in (select public.visible_space_ids()));

create policy chunks_select_visible on public.chunks
  for select to authenticated
  using (space_id in (select public.visible_space_ids()));

create policy entities_select_visible on public.entities
  for select to authenticated
  using (space_id in (select public.visible_space_ids()));

create policy entity_mentions_select_visible on public.entity_mentions
  for select to authenticated
  using (space_id in (select public.visible_space_ids()));

create policy dream_runs_select_visible on public.dream_runs
  for select to authenticated
  using (space_id in (select public.visible_space_ids()));

create policy dream_links_select_visible on public.dream_links
  for select to authenticated
  using (space_id in (select public.visible_space_ids()));

create policy dream_links_update_visible on public.dream_links
  for update to authenticated
  using (space_id in (select public.visible_space_ids()))
  with check (space_id in (select public.visible_space_ids()));

create policy ingest_jobs_select_visible on public.ingest_jobs
  for select to authenticated
  using (space_id in (select public.visible_space_ids()));

-- Conversations ------------------------------------------------------------

create policy conversations_select_own on public.conversations
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy conversations_insert_own on public.conversations
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_org_member(org_id));

create policy conversations_update_own on public.conversations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy conversations_delete_own on public.conversations
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy messages_select_own on public.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

create policy messages_insert_own on public.messages
  for insert to authenticated
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

-- Analytics ----------------------------------------------------------------

create policy usage_events_select_admin on public.usage_events
  for select to authenticated
  using (public.is_org_admin(org_id));

create policy model_calls_select_admin on public.model_calls
  for select to authenticated
  using (public.is_org_admin(org_id));

-- Storage policies and realtime publication membership are not captured by
-- `supabase db diff`, so they live in hand-written migrations instead. See
-- supabase/migrations/*_storage_policies.sql and *_realtime.sql.
