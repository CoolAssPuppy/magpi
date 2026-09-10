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
  ),
  -- Not wired up. They are here so the connections page shows what this is for, and the page
  -- renders them as coming soon rather than offering a button that would fail.
  (
    'hubspot', 'HubSpot', 'Contacts, deals and notes from a HubSpot portal.',
    'oauth', 'https://app.hubspot.com/oauth/authorize',
    'https://api.hubapi.com/oauth/v1/token', array[]::text[],
    'https://developers.hubspot.com/docs/api/oauth-quickstart-guide', false, 50, null
  ),
  (
    'salesforce', 'Salesforce', 'Accounts, opportunities and cases from a Salesforce org.',
    'oauth', 'https://login.salesforce.com/services/oauth2/authorize',
    'https://login.salesforce.com/services/oauth2/token', array[]::text[],
    'https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_flows.htm', false, 60, null
  ),
  (
    'jira', 'Jira', 'Issues, epics and comments from a Jira site.',
    'oauth', 'https://auth.atlassian.com/authorize',
    'https://auth.atlassian.com/oauth/token', array[]::text[],
    'https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/', false, 70, null
  ),
  (
    'confluence', 'Confluence', 'Spaces and pages from a Confluence site.',
    'oauth', 'https://auth.atlassian.com/authorize',
    'https://auth.atlassian.com/oauth/token', array[]::text[],
    'https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/', false, 80, null
  ),
  (
    'github', 'GitHub', 'Issues, pull requests and repository markdown.',
    'oauth', 'https://github.com/login/oauth/authorize',
    'https://github.com/login/oauth/access_token', array[]::text[],
    'https://docs.github.com/en/apps/oauth-apps', false, 90, null
  ),
  (
    'zendesk', 'Zendesk', 'Tickets and help centre articles from a Zendesk account.',
    'oauth', 'https://example.zendesk.com/oauth/authorizations/new',
    'https://example.zendesk.com/oauth/tokens', array[]::text[],
    'https://developer.zendesk.com/documentation/ticketing/working-with-oauth/', false, 100, null
  ),
  (
    'front', 'Front', 'Shared inbox conversations and comments from Front.',
    'oauth', 'https://app.frontapp.com/oauth/authorize',
    'https://app.frontapp.com/oauth/token', array[]::text[],
    'https://dev.frontapp.com/docs/oauth', false, 110, null
  ),
  -- Hex authenticates with an API key rather than OAuth, so it carries no endpoints.
  (
    'hex', 'Hex', 'Notebooks, apps and their published results from a Hex workspace.',
    'api_key', null, null, array[]::text[],
    'https://learn.hex.tech/docs/api/api-overview', false, 120, null
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
