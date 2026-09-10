-- A space cannot change kind, organization or owner after it is created.

-- A trigger rather than a grant, so the rule binds service_role too.
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
