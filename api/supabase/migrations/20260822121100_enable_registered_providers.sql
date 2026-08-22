-- Slack, GitHub and Notion shipped disabled because none of them works until
-- an OAuth app is registered for it, and a connect button that opens a broken
-- authorize page is worse than an absent one.
--
-- Apps are registered for all three now, so the flag catches up. It stays a
-- manual switch rather than something derived: the credentials live in the
-- edge function environment, which the database cannot see. A deployment
-- without them gets a 503 from the gateway saying so, which is the real check.

update public.providers
   set enabled = true
 where slug in ('slack', 'github', 'notion');
