-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

ALTER TABLE public.documents
  ADD COLUMN created_by uuid;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;