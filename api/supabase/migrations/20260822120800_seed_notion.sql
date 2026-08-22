-- Notion, as a counter source.
--
-- Notion has no "assigned to me" endpoint, so which pages count is a choice
-- the wearer makes: a database id in the page settings queries that database,
-- and without one the integration's shared surface is searched.
--
-- Capabilities are set on the Notion integration itself rather than requested
-- as scopes, so the scopes array is empty by design rather than unfilled. Read
-- content is the only capability this needs.

insert into public.providers
  (slug, display_name, description, kind, auth_url, token_url, scopes, docs_url, enabled, position)
values
  (
    'notion',
    'Notion',
    'Pages waiting on you, from one database or everywhere.',
    'oauth',
    'https://api.notion.com/v1/oauth/authorize',
    'https://api.notion.com/v1/oauth/token',
    '{}',
    'https://developers.notion.com/docs/authorization',
    false,
    35
  );

comment on column public.providers.position is
  'List order on the connections page. Gaps are deliberate, so a provider can
   be slotted between two others without renumbering.';
