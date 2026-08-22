-- The provider registry.
--
-- Every scope here is read only. Write access to any provider is a separate
-- decision, made later, per provider.
--
-- Adding a provider is this insert plus one page builder in
-- functions/_shared/pages/. If it also needs a React change, the registry is
-- wrong.

insert into public.providers
  (slug, display_name, description, kind, auth_url, token_url, scopes, docs_url, enabled, position)
values
  (
    'google',
    'Google',
    'Calendar events and Gmail message headers.',
    'oauth',
    'https://accounts.google.com/o/oauth2/v2/auth',
    'https://oauth2.googleapis.com/token',
    array[
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/gmail.metadata'
    ],
    'https://developers.google.com/identity/protocols/oauth2',
    true,
    10
  ),
  (
    'linear',
    'Linear',
    'Issues assigned to you.',
    'oauth',
    'https://linear.app/oauth/authorize',
    'https://api.linear.app/oauth/token',
    array['read'],
    'https://developers.linear.app/docs/oauth/authentication',
    true,
    20
  ),
  (
    'slack',
    'Slack',
    'Mentions across the workspaces you are in.',
    'oauth',
    'https://slack.com/oauth/v2/authorize',
    'https://slack.com/api/oauth.v2.access',
    array['search:read'],
    'https://api.slack.com/authentication/oauth-v2',
    false,
    30
  ),
  (
    'github',
    'GitHub',
    'Pull requests waiting on your review.',
    'oauth',
    'https://github.com/login/oauth/authorize',
    'https://github.com/login/oauth/access_token',
    array['read:user'],
    'https://docs.github.com/apps/oauth-apps',
    false,
    40
  ),
  (
    'vercel',
    'Vercel',
    'Deployment state for your projects.',
    'api_key',
    null,
    null,
    '{}',
    'https://vercel.com/docs/rest-api',
    true,
    50
  ),
  (
    'posthog',
    'PostHog',
    'One insight, drawn as a number and a sparkline.',
    'api_key',
    null,
    null,
    '{}',
    'https://posthog.com/docs/api',
    true,
    60
  );

comment on column public.providers.enabled is
  'Slack and GitHub ship disabled. Both need an app registered before the
   connect button can work, and a button that opens a broken authorize page
   is worse than an absent one.';

-- gmail.metadata rather than gmail.readonly is deliberate. It permits
-- messages.list and messages.get with format=metadata, which returns headers
-- including the subject. That covers a count and one subject line without
-- granting access to message bodies.
