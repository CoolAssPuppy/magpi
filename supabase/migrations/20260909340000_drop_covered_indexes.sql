-- Drop four indexes fully covered by the leading columns of another.
--
-- A btree index on (a, b) already serves a lookup on a alone, so each of these
-- was pure write amplification. chunks and documents are the hot path: every
-- ingest inserts a document and a chunk per passage, and six cascade indexes
-- landed on those tables earlier today.
--
--   chunks_document_id_idx   covered by chunks_document_id_ordinal_key
--   documents_space_id_idx   covered by documents_origin_idx (space_id, origin)
--   documents_org_id_idx     covered by documents_dead_content_idx (org_id, last_retrieved_at)
--   entities_space_id_idx    covered by entities_space_id_kind_canonical_name_key
--
-- chunks_space_id_idx stays. Nothing else on chunks leads with space_id, and
-- every RLS policy on that table filters by it.

drop index public.chunks_document_id_idx;
drop index public.documents_space_id_idx;
drop index public.documents_org_id_idx;
drop index public.entities_space_id_idx;
