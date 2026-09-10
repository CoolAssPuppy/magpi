-- One query for the member list, rather than one auth request per member.

-- Addresses for one organization's members. The admin check is inside, since this reads auth.users.
create or replace function public.org_member_emails(p_org_id uuid)
returns table (user_id uuid, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, u.email::text
  from public.org_members m
  join auth.users u on u.id = m.user_id
  where m.org_id = p_org_id
    and public.is_org_admin(p_org_id);
$$;

revoke all on function public.org_member_emails(uuid) from public, anon;
grant execute on function public.org_member_emails(uuid) to authenticated, service_role;
