-- Pin the four visibility predicates to an empty search_path.

alter function public.visible_space_ids() set search_path = '';
alter function public.is_org_member(uuid) set search_path = '';
alter function public.is_org_admin(uuid) set search_path = '';
alter function public.is_space_member(uuid) set search_path = '';
