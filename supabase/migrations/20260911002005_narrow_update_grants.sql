-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

REVOKE UPDATE ON public.conversation_folders FROM authenticated;

GRANT UPDATE ("position", color, name) ON public.conversation_folders TO authenticated;

REVOKE UPDATE ON public.organizations FROM authenticated;

GRANT UPDATE (name) ON public.organizations TO authenticated;