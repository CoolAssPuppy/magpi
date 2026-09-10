create type public.space_kind as enum ('personal', 'team', 'org');

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind public.space_kind not null,
  name text not null check (char_length(name) between 1 and 120),
  description text check (description is null or char_length(description) <= 400),
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

-- The target for the composite foreign keys that carry org_id through every content table.
alter table public.spaces add constraint spaces_id_org_key unique (id, org_id);

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

-- kind, org_id and owner are fixed at creation, for every role including service_role.
create or replace function public.spaces_identity_is_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind is distinct from old.kind
     or new.org_id is distinct from old.org_id
     or new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'a space cannot change kind, organization or owner after it is created';
  end if;
  return new;
end;
$$;

revoke all on function public.spaces_identity_is_immutable() from public, anon, authenticated;

create or replace trigger spaces_identity_immutable
  before update on public.spaces
  for each row
  execute function public.spaces_identity_is_immutable();

alter table public.spaces enable row level security;
alter table public.spaces force row level security;
alter table public.space_members enable row level security;
alter table public.space_members force row level security;
