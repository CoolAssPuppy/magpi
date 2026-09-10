-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

DROP INDEX public.org_members_user_id_idx;

CREATE TYPE public.folder_color AS ENUM (
  'gray',
  'brand',
  'blue',
  'indigo',
  'purple',
  'pink',
  'crimson',
  'orange',
  'amber',
  'green'
);

CREATE TABLE public.conversation_folders (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  org_id     uuid                     NOT NULL,
  user_id    uuid                     NOT NULL,
  name       text                     NOT NULL,
  color      public.folder_color      DEFAULT 'gray'::public.folder_color NOT NULL,
  "position" integer                  DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.conversation_folders
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.conversation_folders
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.conversation_folders
  ADD CONSTRAINT conversation_folders_name_length CHECK (char_length(name) <= 60);

ALTER TABLE public.conversation_folders
  ADD CONSTRAINT conversation_folders_name_not_blank CHECK (btrim(name) <> ''::text);

ALTER TABLE public.conversation_folders
  ADD CONSTRAINT conversation_folders_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.conversation_folders
  ADD CONSTRAINT conversation_folders_pkey PRIMARY KEY (id);

ALTER TABLE public.conversation_folders
  ADD CONSTRAINT conversation_folders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.conversation_folders TO anon;

GRANT ALL ON public.conversation_folders TO authenticated;

GRANT ALL ON public.conversation_folders TO service_role;

CREATE INDEX conversation_folders_user_position_idx ON public.conversation_folders (user_id, "position", name);

CREATE UNIQUE INDEX conversation_folders_user_name_idx ON public.conversation_folders (user_id, lower(btrim(name)));

CREATE TRIGGER conversation_folders_touch_updated_at
  BEFORE UPDATE ON public.conversation_folders
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY conversation_folders_delete_own ON public.conversation_folders
  FOR DELETE
  TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY conversation_folders_insert_own ON public.conversation_folders
  FOR INSERT
  TO authenticated
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND public.is_org_member(org_id)));

CREATE POLICY conversation_folders_select_own ON public.conversation_folders
  FOR SELECT
  TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY conversation_folders_update_own ON public.conversation_folders
  FOR UPDATE
  TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.conversations
  ADD COLUMN folder_id uuid;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.conversation_folders(id) ON DELETE SET NULL;

CREATE INDEX conversations_folder_idx ON public.conversations (folder_id, updated_at DESC)
  WHERE folder_id IS NOT NULL;

CREATE UNIQUE INDEX org_members_user_id_idx ON public.org_members (user_id);