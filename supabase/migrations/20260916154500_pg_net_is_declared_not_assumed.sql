-- invoke_worker calls net.http_post, and 00_extensions.sql declares pg_net, but no migration
-- ever created it. The local stack enables it on its own, so nothing noticed until the first
-- hosted project ticked without it.
create extension if not exists "pg_net" with schema "extensions";
