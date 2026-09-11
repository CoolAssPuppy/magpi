-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

ALTER TABLE public.conversations
  DROP CONSTRAINT conversations_folder_id_fkey;

ALTER TABLE public.conversation_folders
  ADD CONSTRAINT conversation_folders_id_user_key UNIQUE (id, user_id);

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_folder_of_owner FOREIGN KEY (folder_id, user_id) REFERENCES public.conversation_folders(id, user_id) ON DELETE SET NULL;