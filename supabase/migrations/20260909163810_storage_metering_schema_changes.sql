-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

ALTER TYPE public.usage_kind ADD VALUE 'storage_bytes' AFTER 'chat_tokens';
