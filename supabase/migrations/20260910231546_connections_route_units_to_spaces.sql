-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP FUNCTION public.consume_oauth_state(IN p_state text);

DROP FUNCTION public.consume_pending_connection(IN p_ticket_hash text);

ALTER TABLE public.connections
  DROP CONSTRAINT connections_space_in_org;

ALTER TABLE public.oauth_states
  DROP CONSTRAINT oauth_states_space_id_fkey;

ALTER TABLE public.oauth_states
  DROP COLUMN space_id;

ALTER TABLE public.pending_connections
  DROP CONSTRAINT pending_connections_space_id_fkey;

ALTER TABLE public.pending_connections
  DROP COLUMN space_id;

DROP INDEX public.connections_account_idx;

DROP INDEX public.connections_no_account_idx;

DROP INDEX public.connections_space_id_idx;

DROP POLICY connections_delete_owner ON public.connections;

DROP POLICY connections_select_visible ON public.connections;

ALTER TABLE public.connections
  DROP COLUMN space_id;

CREATE FUNCTION public.consume_oauth_state (
  p_state text
)
  RETURNS TABLE (
    user_id       uuid,
    provider      text,
    code_verifier text,
    return_to     text
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  delete from public.oauth_states
  where state = p_state and expires_at > clock_timestamp()
  returning user_id, provider, code_verifier, return_to;
$function$;

REVOKE ALL ON FUNCTION public.consume_oauth_state(text) FROM public, anon, authenticated;

GRANT ALL ON FUNCTION public.consume_oauth_state(text) TO service_role;

CREATE FUNCTION public.consume_pending_connection (
  p_ticket_hash text
)
  RETURNS TABLE (
    user_id             uuid,
    provider            text,
    external_account_id text,
    access_token_enc    bytea,
    refresh_token_enc   bytea,
    scopes              text[],
    token_expires_at    timestamp with time zone,
    return_to           text
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  delete from public.pending_connections
  where ticket_hash = p_ticket_hash and expires_at > clock_timestamp()
  returning user_id, provider, external_account_id, access_token_enc,
            refresh_token_enc, scopes, token_expires_at, return_to;
$function$;

REVOKE ALL ON FUNCTION public.consume_pending_connection(text) FROM public, anon, authenticated;

GRANT ALL ON FUNCTION public.consume_pending_connection(text) TO service_role;

CREATE FUNCTION public.routes_into_visible_space (
  p_scope_selection jsonb
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1
    from jsonb_each_text(coalesce(p_scope_selection -> 'routes', '{}'::jsonb)) as route(unit, space)
    where route.space is not null
      and route.space <> ''
      and route.space::uuid in (select public.visible_space_ids())
  )
$function$;

REVOKE ALL ON FUNCTION public.routes_into_visible_space(jsonb) FROM public, anon;

GRANT ALL ON FUNCTION public.routes_into_visible_space(jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.routes_into_visible_space(jsonb) TO service_role;

REVOKE SELECT
  (created_at, cursor, external_account_id, id, last_synced_at, org_id, PROVIDER, scope_selection, scopes, status, status_detail, token_expires_at, updated_at, user_id)
  ON public.connections FROM authenticated;

GRANT SELECT (created_at, cursor, external_account_id, id, last_synced_at, org_id, PROVIDER, scope_selection, scopes, status, status_detail, token_expires_at, updated_at, user_id)
  ON public.connections TO authenticated;

CREATE INDEX connections_routes_idx ON public.connections USING gin ((scope_selection -> 'routes'::text));

CREATE UNIQUE INDEX connections_no_account_idx ON public.connections (org_id, user_id, PROVIDER)
  WHERE external_account_id IS NULL;

CREATE UNIQUE INDEX connections_account_idx ON public.connections (org_id, user_id, PROVIDER, external_account_id)
  WHERE external_account_id IS NOT NULL;

CREATE POLICY connections_delete_owner ON public.connections
  FOR DELETE
  TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY connections_select_visible ON public.connections
  FOR SELECT
  TO authenticated
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR public.routes_into_visible_space(scope_selection)));