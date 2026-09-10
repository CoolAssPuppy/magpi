-- Function execute and column privileges, hand-written: `supabase db diff` never emits revokes.

-- Revoking from PUBLIC also removes execute from service_role, so each grant below is required.
revoke all on function public.consume_oauth_state(text) from public, anon, authenticated;
grant execute on function public.consume_oauth_state(text) to service_role;

revoke all on function public.prune_oauth_states() from public, anon, authenticated;
grant execute on function public.prune_oauth_states() to service_role;

revoke all on function public.consume_pending_connection(text) from public, anon, authenticated;
grant execute on function public.consume_pending_connection(text) to service_role;

revoke all on function public.prune_pending_connections() from public, anon, authenticated;
grant execute on function public.prune_pending_connections() to service_role;

revoke all on function public.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

revoke all on function public.prune_rate_limits() from public, anon, authenticated;
grant execute on function public.prune_rate_limits() to service_role;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.sync_org_space_membership() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

-- anon has no surface in this product, so it executes nothing that reaches data.
revoke all on function public.visible_space_ids() from public, anon;
grant execute on function public.visible_space_ids() to authenticated, service_role;

revoke all on function public.is_org_member(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated, service_role;

revoke all on function public.is_org_admin(uuid) from public, anon;
grant execute on function public.is_org_admin(uuid) to authenticated, service_role;

revoke all on function public.is_space_member(uuid) from public, anon;
grant execute on function public.is_space_member(uuid) to authenticated, service_role;

revoke all on function public.check_ingest_allowed(uuid) from public, anon;
grant execute on function public.check_ingest_allowed(uuid) to authenticated, service_role;

revoke all on function public.plan_document_limit(public.org_plan) from public, anon;
grant execute on function public.plan_document_limit(public.org_plan) to authenticated, service_role;

revoke all on function public.plan_monthly_query_limit(public.org_plan) from public, anon;
grant execute on function public.plan_monthly_query_limit(public.org_plan)
  to authenticated, service_role;

revoke all on function public.search(extensions.vector, text, uuid[], integer) from public, anon;
grant execute on function public.search(extensions.vector, text, uuid[], integer)
  to authenticated, service_role;

-- Column privileges: a connection row is readable, the encrypted token column on it is not.
revoke select on public.connections from authenticated;
grant select (
  id, org_id, space_id, user_id, provider, external_account_id, scopes,
  scope_selection, status, status_detail, cursor, token_expires_at,
  last_synced_at, created_at, updated_at
) on public.connections to authenticated;
