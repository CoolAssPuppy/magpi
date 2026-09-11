-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.routes_into_visible_space (
  p_scope_selection jsonb
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Every guard below is about a malformed column rather than a hostile one. jsonb_each_text
  -- raises on a non-object, and the uuid cast raises on anything that is not one, and either
  -- would turn one bad row into an error for every reader of the connections page except its
  -- owner, whose own policy branch short-circuits before this runs.
  select exists (
    select 1
    from jsonb_each_text(
      case
        when jsonb_typeof(p_scope_selection -> 'routes') = 'object'
        then p_scope_selection -> 'routes'
        else '{}'::jsonb
      end
    ) as route(unit, space)
    where route.space ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      and route.space::uuid in (select public.visible_space_ids())
  )
$function$;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.chunks FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.chunks FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.connections FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.connections FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.conversation_folders FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.conversation_folders FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.conversations FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.conversations FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.documents FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.documents FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.dream_links FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.dream_links FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.dream_runs FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.dream_runs FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.entities FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.entities FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.entity_mentions FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.entity_mentions FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.ingest_jobs FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.ingest_jobs FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.messages FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.messages FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.model_calls FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.model_calls FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.oauth_states FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.oauth_states FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.org_invites FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.org_invites FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.org_members FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.org_members FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.organizations FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.organizations FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.pending_connections FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.pending_connections FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.providers FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.providers FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.rate_limits FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.rate_limits FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.space_members FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.space_members FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.spaces FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.spaces FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.stripe_events FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.stripe_events FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.usage_events FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.usage_events FROM authenticated;