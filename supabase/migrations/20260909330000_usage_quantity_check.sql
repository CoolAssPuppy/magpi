-- A usage row cannot be negative, because every meter sums usage_events.quantity.

update public.usage_events set quantity = 0 where quantity < 0;

-- Named `<table>_<column>_check`, matching the inline check in schemas/70_usage_events.sql.
alter table public.usage_events
  add constraint usage_events_quantity_check check (quantity >= 0);
