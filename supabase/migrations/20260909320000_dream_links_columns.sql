-- Narrow the dream_links update grant to the two columns the feature writes.

revoke update on public.dream_links from authenticated;
grant update (confirmed_at, dismissed_at) on public.dream_links to authenticated;
