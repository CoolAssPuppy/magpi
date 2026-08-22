-- Renaming a connection needs a policy, not just a column grant.
--
-- The grant said which column a client may write. Row-level security still
-- decides which rows, and there was no update policy, so every rename matched
-- zero rows. Postgres reports that as success, so the website said "Renamed"
-- and nothing changed.
--
-- `with check` as well as `using`: without it a row could be updated out of
-- the caller's own scope. The column grant already stops user_id being
-- written, so this is the second lock on the same door.
create policy connections_update_own on public.connections
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
