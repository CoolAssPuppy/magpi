-- Drop four indexes covered by the leading columns of another. chunks_space_id_idx stays.

drop index public.chunks_document_id_idx;
drop index public.documents_space_id_idx;
drop index public.documents_org_id_idx;
drop index public.entities_space_id_idx;
