-- A usage row cannot be negative.
--
-- Every meter sums usage_events.quantity: the document count, the monthly
-- question limit, the token totals on the analytics page. A negative row is a
-- smaller invoice and a plan limit that never arrives. No client role can write
-- this table, but service_role can, and every Edge Function holds that key.

update public.usage_events set quantity = 0 where quantity < 0;

-- Named as Postgres names a column check, `<table>_<column>_check`, because
-- that is what the inline check in schemas/70_usage_events.sql produces and a
-- different name here reads as drift forever.
alter table public.usage_events
  add constraint usage_events_quantity_check check (quantity >= 0);
