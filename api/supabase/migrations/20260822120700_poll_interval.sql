-- How often the badge asks, per user.
--
-- On profiles rather than pomodoro_settings: it is a badge preference and has
-- nothing to do with the timer, and a column named for one thing holding
-- another is a lie that survives every later reader.
--
-- The floor is enforced here as well as in the gateway. A five second poll is
-- 17,000 upstream calls a day per provider, and a check constraint is the only
-- one of the two that a direct write cannot skip.

alter table public.profiles
  add column poll_interval_ms int not null default 30000
    check (poll_interval_ms between 5000 and 300000);

comment on column public.profiles.poll_interval_ms is
  'Milliseconds between badge polls. The gateway clamps to the same floor.';

grant update (poll_interval_ms) on public.profiles to authenticated;
