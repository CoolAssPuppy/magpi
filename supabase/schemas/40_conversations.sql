create type public.message_role as enum ('user', 'assistant');

-- The colours a folder may take. Names, not values: the value lives in the token file, so a
-- folder keeps its meaning when the theme changes and the raw-color check stays satisfied.
create type public.folder_color as enum (
  'gray', 'brand', 'blue', 'indigo', 'purple', 'pink', 'crimson', 'orange', 'amber', 'green'
);

-- A person's own filing for their own chats. Never shared, because a conversation is not either.
create table public.conversation_folders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  color public.folder_color not null default 'gray',
  -- Where it sits in the sidebar. Ties break on name, so the order is never arbitrary.
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversation_folders_name_not_blank check (btrim(name) <> ''),
  constraint conversation_folders_name_length check (char_length(name) <= 60)
);

create unique index conversation_folders_user_name_idx
  on public.conversation_folders (user_id, lower(btrim(name)));

-- The target of the composite key below, so a conversation can only name its owner's folder.
alter table public.conversation_folders
  add constraint conversation_folders_id_user_key unique (id, user_id);

create index conversation_folders_user_position_idx
  on public.conversation_folders (user_id, position, name);

alter table public.conversation_folders enable row level security;
alter table public.conversation_folders force row level security;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  space_filter uuid[],
  -- Null is the top level of the sidebar, not an error. Deleting a folder unfiles its chats.
  folder_id uuid,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Composite, so filing a chat into somebody else's folder is refused by the key rather than by a
-- policy somebody has to remember to write. RLS hides another person's folder; this makes naming
-- one impossible even when the id is known.
-- Naming the column matters: a plain `set null` on a composite key nulls user_id too, which is
-- not null, so deleting a folder would fail instead of unfiling its chats.
alter table public.conversations
  add constraint conversations_folder_of_owner
  foreign key (folder_id, user_id) references public.conversation_folders (id, user_id)
  on delete set null (folder_id);

create index conversations_user_created_idx on public.conversations (user_id, created_at desc);

create index conversations_folder_idx on public.conversations (folder_id, updated_at desc)
  where folder_id is not null;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role public.message_role not null,
  content text not null default '',
  -- Chunk ids only. The text is resolved on read through RLS.
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
