create type public.org_role as enum ('owner', 'admin', 'member');

create type public.org_plan as enum ('free', 'team', 'enterprise');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  plan public.org_plan not null default 'free',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  seats integer not null default 1 check (seats >= 1),
  created_at timestamptz not null default now()
);

create table public.org_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- An address has one account and that account has one organization, so membership is unique on
-- the user alone. Everything that files a row by organization can then read it off the person.
create unique index org_members_user_id_idx on public.org_members (user_id);

create table public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role public.org_role not null default 'member',
  token_hash text not null unique,
  invited_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index org_invites_pending_idx
  on public.org_invites (org_id, lower(email))
  where accepted_at is null;

alter table public.organizations enable row level security;
alter table public.organizations force row level security;
alter table public.org_members enable row level security;
alter table public.org_members force row level security;
alter table public.org_invites enable row level security;
alter table public.org_invites force row level security;
