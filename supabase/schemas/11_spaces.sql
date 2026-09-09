create type public.space_kind as enum ('personal', 'team', 'org');

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind public.space_kind not null,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  dreaming_enabled boolean not null default true,
  owner_user_id uuid references auth.users (id) on delete cascade
);

-- A personal space has exactly one owner and there is only ever one per user per org.
create unique index spaces_personal_owner_idx
  on public.spaces (org_id, owner_user_id)
  where kind = 'personal';

-- Exactly one org space per organization.
create unique index spaces_org_kind_idx
  on public.spaces (org_id)
  where kind = 'org';

create index spaces_org_id_idx on public.spaces (org_id);

alter table public.spaces
  add constraint spaces_personal_has_owner
  check ((kind = 'personal') = (owner_user_id is not null));

create table public.space_members (
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create index space_members_user_id_idx on public.space_members (user_id);

alter table public.spaces enable row level security;
alter table public.spaces force row level security;
alter table public.space_members enable row level security;
alter table public.space_members force row level security;
