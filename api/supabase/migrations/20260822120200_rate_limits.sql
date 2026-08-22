-- Rate limiting and the user_code lockout.
--
-- In Postgres rather than in function memory. Edge Functions are serverless:
-- a module-scope counter is per instance and resets on every cold start, so
-- N concurrent instances multiply the effective limit by N and an attacker
-- who paces requests to trigger new instances is never limited at all. The
-- user_code lockout is stateful across requests by definition
-- and cannot be built on per-instance memory.

create table public.rate_limits (
  bucket       text        not null,
  window_start timestamptz not null,
  count        int         not null default 0,
  primary key (bucket, window_start)
);

alter table public.rate_limits enable row level security;
alter table public.rate_limits force row level security;

-- No policies, and no grants to any client role: counters are never readable
-- by a caller, since knowing your remaining budget helps only an attacker
-- pacing to stay under it. The service role needs table privileges because
-- BYPASSRLS does not imply them.
grant select, insert, update, delete on public.rate_limits to service_role;

comment on table public.rate_limits is
  'Fixed-window counters. Keyed by an opaque bucket string such as
   "device-start:ip:1.2.3.4" so callers choose their own dimensions.';

/**
 * Consume one unit from a fixed window, returning whether the caller is
 * allowed and how long until the window rolls.
 *
 * The insert-on-conflict-update is a single atomic statement, so concurrent
 * callers cannot both observe count < limit and both proceed. Doing this as
 * select-then-update would race exactly when it matters, under load.
 */
create or replace function public.consume_rate_limit(
  p_bucket   text,
  p_limit    int,
  p_window_s int
)
returns table (allowed boolean, remaining int, retry_after_s int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_count        int;
begin
  -- Floor now() to the window boundary so every caller in the same window
  -- lands on the same row.
  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_s) * p_window_s
  );

  insert into public.rate_limits (bucket, window_start, count)
  values (p_bucket, v_window_start, 1)
  on conflict (bucket, window_start)
    do update set count = public.rate_limits.count + 1
  returning public.rate_limits.count into v_count;

  return query select
    v_count <= p_limit,
    greatest(0, p_limit - v_count),
    greatest(
      1,
      ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_s))
                              - clock_timestamp()))::int
    );
end;
$$;

-- Revoking from PUBLIC removes execute from every role that was not granted
-- it explicitly, service_role included, so the grant below is required and
-- not merely tidiness.
revoke all on function public.consume_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, int, int) to service_role;

/**
 * Deletes windows that can no longer affect a decision. Sampled from
 * enforceRateLimits in _shared/db.ts; there is no cron dependency.
 */
create or replace function public.prune_rate_limits(p_older_than interval default '1 day')
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.rate_limits
  where window_start < clock_timestamp() - p_older_than;
$$;

revoke all on function public.prune_rate_limits(interval) from public, anon, authenticated;
grant execute on function public.prune_rate_limits(interval) to service_role;
