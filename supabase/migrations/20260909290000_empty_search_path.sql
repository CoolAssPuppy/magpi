-- Pin the four visibility predicates to an empty search_path.
--
-- Every other security definer function in this schema uses `''`. These four
-- used `public`, which is a schema a role may be able to create objects in, and
-- that is the whole thing a pinned path defends against. Their bodies name
-- every table in full, so they need no path at all.
--
-- The pgTAP assertion that should have caught this only checked that a
-- `search_path=` entry existed, so it passed on `public` for the whole build.
-- It now compares the value.

alter function public.visible_space_ids() set search_path = '';
alter function public.is_org_member(uuid) set search_path = '';
alter function public.is_org_admin(uuid) set search_path = '';
alter function public.is_space_member(uuid) set search_path = '';
