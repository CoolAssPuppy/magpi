-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

ALTER TABLE public.providers
  DROP CONSTRAINT providers_scope_selection_kind_check;

ALTER TABLE public.providers
  ADD CONSTRAINT providers_scope_selection_kind_check CHECK (scope_selection_kind = ANY (ARRAY['channel'::text, 'folder'::text, 'workspace'::text, 'repository'::text]));