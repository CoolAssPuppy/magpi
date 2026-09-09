-- Migration unit 2: after_enum_values
-- Transaction mode: transactional
-- Boundary reason: enum_value_visibility

ALTER TABLE public.documents
  ADD COLUMN size_bytes bigint;
