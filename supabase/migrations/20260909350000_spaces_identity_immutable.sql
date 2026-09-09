-- A space cannot change kind, organization or owner after it is created.

-- What a space is, and whose, is decided once.
--
-- The grant in 95_grants.sql narrows `authenticated` to name and
-- dreaming_enabled, which is what stopped a member moving a space between
-- organizations. A grant cannot restrain service_role, and every Edge Function
-- holds that key, so the rule lives here where it applies to every role.
--
-- kind is the one with teeth: promote a team space to 'org' and
-- sync_org_space_membership enrols every future member of the organization into
-- it, so a private team space becomes company-wide without a single membership
-- row being written by hand.
--
-- Nothing in the product updates any of these three. The only writes to this
-- table are the name, from the settings page, and the dreaming toggle.
create or replace function public.spaces_identity_is_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind is distinct from old.kind
     or new.org_id is distinct from old.org_id
     or new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'a space cannot change kind, organization or owner after it is created';
  end if;
  return new;
end;
$$;

revoke all on function public.spaces_identity_is_immutable() from public, anon, authenticated;

create or replace trigger spaces_identity_immutable
  before update on public.spaces
  for each row
  execute function public.spaces_identity_is_immutable();
