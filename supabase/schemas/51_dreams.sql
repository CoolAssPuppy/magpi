create type public.dream_kind as enum ('entities', 'digest', 'connections');

create type public.dream_status as enum ('queued', 'running', 'succeeded', 'failed', 'timeout');

-- A dream run is scoped to exactly one space. It reads only that space and
-- writes only into that space. That is the security model, not a simplification:
-- a synthesis job reading across spaces under the service role and surfacing the
-- result is a permission bypass wearing a friendly name.
create table public.dream_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  kind public.dream_kind not null,
  status public.dream_status not null default 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  input_document_count integer not null default 0,
  output_document_id uuid,
  error text,
  triggered_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- The write-side half of the rule above. RLS cannot enforce it, because the dream
-- job runs as service_role and service_role has BYPASSRLS, so no policy is
-- evaluated for that process at all. Carrying space_id through the foreign key
-- makes the database refuse a cross-space write outright.
--
-- MATCH SIMPLE, the default, because output_document_id is nullable and a run
-- with no output yet must still be insertable.
alter table public.dream_runs
  add constraint dream_runs_output_in_space
  foreign key (output_document_id, space_id)
  references public.documents (id, space_id) on delete set null;

create index dream_runs_space_created_idx on public.dream_runs (space_id, created_at desc);

-- A candidate link between two documents in the same space, from different
-- sources, that look like they are about the same thing. Surfaced for a human.
create table public.dream_links (
  id uuid primary key default gen_random_uuid(),
  dream_run_id uuid not null references public.dream_runs (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  document_a uuid not null,
  document_b uuid not null,
  similarity real not null,
  rationale text,
  confirmed_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  check (document_a < document_b),
  unique (space_id, document_a, document_b)
);

-- dream_links.rationale is model-written prose describing both documents, and
-- dream_links_select_visible shows it to every member of the space the link is
-- filed in. A link naming a document from another space would hand that space a
-- written summary of something nobody there can open.
alter table public.dream_links
  add constraint dream_links_document_a_in_space
    foreign key (document_a, space_id) references public.documents (id, space_id)
    on delete cascade,
  add constraint dream_links_document_b_in_space
    foreign key (document_b, space_id) references public.documents (id, space_id)
    on delete cascade;

create index dream_links_space_idx on public.dream_links (space_id, created_at desc);

alter table public.dream_runs enable row level security;
alter table public.dream_runs force row level security;
alter table public.dream_links enable row level security;
alter table public.dream_links force row level security;
