-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.create_team_space (
  p_org_id uuid,
  p_name   text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_space_id uuid;
begin
  if not public.is_org_member(p_org_id) then
    raise exception 'not a member of that organization' using errcode = '42501';
  end if;

  insert into public.spaces (org_id, kind, name)
  values (p_org_id, 'team', p_name)
  returning id into v_space_id;

  insert into public.space_members (space_id, user_id)
  values (v_space_id, (select auth.uid()));

  return v_space_id;
end;
$function$;

-- db diff emits grants and never revokes, so the revoke is written by hand.
REVOKE ALL ON FUNCTION public.create_team_space(uuid, text) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.create_team_space(uuid, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_team_space(uuid, text) TO service_role;
