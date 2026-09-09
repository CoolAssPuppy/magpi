create type public.message_role as enum ('user', 'assistant');

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  space_filter uuid[],
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_user_created_idx on public.conversations (user_id, created_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role public.message_role not null,
  content text not null default '',
  -- Chunk ids only. The text is resolved on read through RLS, so a reader who
  -- lost access to a space sees the answer without the citation.
  citations jsonb not null default '[]',
  latency_ms integer,
  token_count integer,
  -- The standalone rewrite of a follow-up question, kept for debugging.
  condensed_query text,
  created_at timestamptz not null default now()
);

create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

alter table public.messages
  add constraint messages_citations_is_array
  check (jsonb_typeof(citations) = 'array');

alter table public.conversations enable row level security;
alter table public.conversations force row level security;
alter table public.messages enable row level security;
alter table public.messages force row level security;
