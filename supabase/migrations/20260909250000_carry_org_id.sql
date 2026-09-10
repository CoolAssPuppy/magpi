-- Stop a space member writing spaces.org_id or spaces.kind and moving a space to another org.

-- A column-level revoke cannot subtract from a table-level grant, so the table grant goes first.
revoke update on public.spaces from authenticated;
grant update (name, dreaming_enabled) on public.spaces to authenticated;

alter table public.spaces add constraint spaces_id_org_key unique (id, org_id);

-- Correct any row whose org_id disagrees with its space, which the new constraint would refuse.
update public.documents d set org_id = s.org_id
  from public.spaces s where s.id = d.space_id and d.org_id <> s.org_id;
update public.chunks c set org_id = s.org_id
  from public.spaces s where s.id = c.space_id and c.org_id <> s.org_id;
update public.connections k set org_id = s.org_id
  from public.spaces s where s.id = k.space_id and k.org_id <> s.org_id;
update public.ingest_jobs j set org_id = s.org_id
  from public.spaces s where s.id = j.space_id and j.org_id <> s.org_id;

-- Each composite replaces its single-column key, since two keys to spaces confuse PostgREST.
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
