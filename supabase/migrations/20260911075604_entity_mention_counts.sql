-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.entity_mention_counts (
  p_space_id   uuid,
  p_entity_ids uuid[]
)
  RETURNS TABLE (
    entity_id uuid,
    mentions  bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select m.entity_id, count(*)
  from public.entity_mentions m
  where m.space_id = p_space_id
    and m.entity_id = any(p_entity_ids)
  group by m.entity_id;
$function$;

-- pg-delta does not emit revokes, and a new function is executable by PUBLIC until one runs.
REVOKE ALL ON FUNCTION public.entity_mention_counts(uuid, uuid[]) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.entity_mention_counts(uuid, uuid[]) TO service_role;