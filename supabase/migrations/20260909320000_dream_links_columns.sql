-- Narrow the dream_links update grant to the two columns the feature writes.
--
-- The same shape as the spaces grant: dream_links_update_visible tests
-- space_id and nothing else, and the grant covered the whole table, so a space
-- member could rewrite similarity, rationale, dream_run_id, document_a and
-- document_b. A link between two documents they can see could be repointed at
-- one they cannot, carrying rationale prose they wrote themselves, and it would
-- render as the dream job's own output.
--
-- Confirming and dismissing a candidate link is the entire feature.

revoke update on public.dream_links from authenticated;
grant update (confirmed_at, dismissed_at) on public.dream_links to authenticated;
