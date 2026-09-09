create type public.usage_kind as enum (
  'document_ingested',
  'chunk_embedded',
  'query',
  'dream_run',
  'embedding_tokens',
  'chat_tokens',
  'storage_bytes'
);

-- What a plan meters. Usage is never computed by scanning documents on a page load.
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind public.usage_kind not null,
  quantity bigint not null default 1,
  occurred_at timestamptz not null default now()
);

create index usage_events_org_occurred_idx on public.usage_events (org_id, occurred_at);

-- Every model call goes through one wrapper that writes here. This is where
-- analytics gets its numbers and how a latency regression becomes visible.
create table public.model_calls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  purpose text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  latency_ms integer not null default 0,
  succeeded boolean not null default true,
  occurred_at timestamptz not null default now()
);

create index model_calls_org_occurred_idx on public.model_calls (org_id, occurred_at);

-- One row per processed Stripe event. Stripe retries, so the webhook handler is
-- idempotent on the event id and this table is how.
create table public.stripe_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

alter table public.usage_events enable row level security;
alter table public.usage_events force row level security;
alter table public.model_calls enable row level security;
alter table public.model_calls force row level security;
alter table public.stripe_events enable row level security;
alter table public.stripe_events force row level security;

grant select, insert, update, delete on public.stripe_events to service_role;
