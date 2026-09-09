-- Seed rows live here, never in a migration. Putting a provider row in a
-- migration means every change to it needs a new migration forever.
--
-- The connections page renders from this table, so adding a provider is a
-- migration for the column plus a row here, never a React change.

insert into public.providers (
  slug, display_name, description, kind, auth_url, token_url, scopes, docs_url,
  enabled, position, scope_selection_kind
) values
  (
    'notion',
    'Notion',
    'Pages and databases from a Notion workspace.',
    'oauth',
    'https://api.notion.com/v1/oauth/authorize',
    'https://api.notion.com/v1/oauth/token',
    array[]::text[],
    'https://developers.notion.com/docs/authorization',
    true,
    10,
    'workspace'
  ),
  (
    'linear',
    'Linear',
    'Issues, projects and comments from a Linear workspace.',
    'oauth',
    'https://linear.app/oauth/authorize',
    'https://api.linear.app/oauth/token',
    array['read'],
    'https://developers.linear.app/docs/oauth/authentication',
    true,
    20,
    'workspace'
  ),
  (
    'slack',
    'Slack',
    'Messages and threads from the channels you pick.',
    'oauth',
    'https://slack.com/oauth/v2/authorize',
    'https://slack.com/api/oauth.v2.access',
    array['channels:history', 'channels:read', 'groups:history', 'groups:read', 'users:read'],
    'https://api.slack.com/authentication/oauth-v2',
    true,
    30,
    'channel'
  ),
  (
    'google_drive',
    'Google Drive',
    'Documents from the folders you pick.',
    'oauth',
    'https://accounts.google.com/o/oauth2/v2/auth',
    'https://oauth2.googleapis.com/token',
    array['https://www.googleapis.com/auth/drive.readonly'],
    'https://developers.google.com/identity/protocols/oauth2/web-server',
    true,
    40,
    'folder'
  )
on conflict (slug) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  kind = excluded.kind,
  auth_url = excluded.auth_url,
  token_url = excluded.token_url,
  scopes = excluded.scopes,
  docs_url = excluded.docs_url,
  enabled = excluded.enabled,
  position = excluded.position,
  scope_selection_kind = excluded.scope_selection_kind;
