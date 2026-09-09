-- One query for the member list, rather than one auth request per member.

-- Addresses for the members of one organization.
--
-- org_members holds a user id and nothing else, addresses live in auth.users
-- where no policy exposes them, and GoTrue has no "give me these ids" call. The
-- admin page therefore made one auth.admin.getUserById request per member, and
-- the spec's organization holds four thousand people. Walking the GoTrue
-- directory in pages of a thousand is fewer requests and still a walk.
--
-- The is_org_admin test is inside the function rather than left to the caller,
-- because a security definer function reading auth.users with no check of its
-- own is a directory of every account in the project behind one rpc call.
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
