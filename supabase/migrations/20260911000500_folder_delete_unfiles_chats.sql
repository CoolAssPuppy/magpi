-- Hand-written. pg-delta compares a foreign key's action but not the column list a SET NULL names,
-- so it reported no change between `on delete set null` and `on delete set null (folder_id)`.
--
-- The difference is the whole behaviour. conversations_folder_of_owner is composite on
-- (folder_id, user_id), and a plain SET NULL nulls every column in the key. user_id is NOT NULL,
-- so deleting a folder raised instead of unfiling its conversations. Naming folder_id nulls only
-- that one, which is what "deleting a folder keeps its chats" means.

alter table public.conversations
  drop constraint conversations_folder_of_owner;

alter table public.conversations
  add constraint conversations_folder_of_owner
  foreign key (folder_id, user_id) references public.conversation_folders (id, user_id)
  on delete set null (folder_id);
