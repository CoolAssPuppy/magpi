-- Stop a space member moving a space into another organization.
--
-- Reproduced against the live database before this landed:
--
--   set local role authenticated;
--   update public.spaces set org_id = '<another org>' where id = '<my space>';
--   -- moved: 1
--   update public.spaces set kind = 'org' where id = '<my team space>';
--   -- kindnow: org
--
-- spaces_update_member tested membership and nothing else, and 95_grants.sql
-- granted the whole table, so org_id and kind were writable by anyone in the
-- space. Nothing tied documents.org_id, chunks.org_id, connections.org_id or
-- ingest_jobs.org_id to the space's own org, so the content followed the move
-- and was then metered, billed and plan-counted against an organization it did
-- not belong to.
--
-- This is the same mistake as the cross-space writes, one level up. space_id is
-- carried through composite foreign keys everywhere; org_id was carried nowhere.

-- A column-level revoke cannot subtract from a table-level grant, so the table
-- privilege has to go for the column list to mean anything.
revoke update on public.spaces from authenticated;
grant update (name, dreaming_enabled) on public.spaces to authenticated;

alter table public.spaces add constraint spaces_id_org_key unique (id, org_id);

-- Any pre-existing row whose org_id disagrees with its space would refuse the
-- constraint, so it is corrected to the space's own org first. On a database
-- where the hole was never exercised this updates nothing.
update public.documents d set org_id = s.org_id
  from public.spaces s where s.id = d.space_id and d.org_id <> s.org_id;
update public.chunks c set org_id = s.org_id
  from public.spaces s where s.id = c.space_id and c.org_id <> s.org_id;
update public.connections k set org_id = s.org_id
  from public.spaces s where s.id = k.space_id and k.org_id <> s.org_id;
update public.ingest_jobs j set org_id = s.org_id
  from public.spaces s where s.id = j.space_id and j.org_id <> s.org_id;

-- Each composite replaces the single-column reference rather than joining it.
-- Two foreign keys between the same pair of tables give PostgREST two
-- relationships to choose from, and `select=*,documents(*)` on the spaces page
-- then fails with "more than one relationship was found".
alter table public.documents drop constraint documents_space_id_fkey;
alter table public.chunks drop constraint chunks_space_id_fkey;
alter table public.connections drop constraint connections_space_id_fkey;
alter table public.ingest_jobs drop constraint ingest_jobs_space_id_fkey;

alter table public.documents
  add constraint documents_space_in_org
  foreign key (space_id, org_id) references public.spaces (id, org_id)
  on delete cascade;

alter table public.chunks
  add constraint chunks_space_in_org
  foreign key (space_id, org_id) references public.spaces (id, org_id)
  on delete cascade;

alter table public.connections
  add constraint connections_space_in_org
  foreign key (space_id, org_id) references public.spaces (id, org_id)
  on delete cascade;

alter table public.ingest_jobs
  add constraint ingest_jobs_space_in_org
  foreign key (space_id, org_id) references public.spaces (id, org_id)
  on delete cascade;
