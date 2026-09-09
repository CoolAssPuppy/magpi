# Postmortem: thread list slow for four hours on 16 June

Owner: Kenji Mori
Date: 18 June 2026
Status: actions open
Severity: S2
In the room for the review: Kenji Mori, Priya Raman, Ruth Adeyemi, Hal Winters

## Summary

An index added on Monday evening for the mobile message pagination endpoint
changed the query plan for the thread list. From 09:05 to 13:10 on Tuesday 16
June, p95 on `GET /threads` went from about 380 ms to about 4.2 seconds. Worst
observed was 9.8 seconds on one account.

Nothing was lost, nothing was written incorrectly, and no customer was billed
anything unusual. The product was slow and unpleasant to use for four hours,
mostly for our larger accounts. Three customers said so.

## Timeline

All times UTC.

**Mon 15 June, 18:20.** Migration `20260615_add_idx_messages_thread_created`
deploys as part of `MOB-28`. It creates
`idx_messages(thread_id, created_at DESC)`, which the mobile client needs to
page a thread backwards without sorting the whole thread. Reviewed by Priya,
approved, uncontroversial, and correct for what it was for.

**Mon 15 June, 18:20 to 23:00.** Nothing happens. Evening traffic is low and the
planner keeps the old plan for most accounts.

**Tue 16 June, 08:12.** First support ticket. Kestenbaum Transit, "the list is
taking ages this morning". Rosa answers it as a browser question, which is the
right first guess and was wrong.

**Tue 16 June, 09:05.** p95 crosses one second and stays there. No alert fires,
because we have no latency alert on this endpoint. This is the gap that made
four hours out of what should have been forty minutes.

**Tue 16 June, 09:40 and 10:05.** Two more tickets. Nine Mile Haulage and
Rutherford Bulk. Same sentence in both, near enough.

**Tue 16 June, 10:40.** Hal raises it as an S2 in `#support` and `#eng` with
three account names. On call is Ruth, who confirms it is server side within
about ten minutes and pages me because it looks like the database.

**Tue 16 June, 11:15.** I pull the plan for the thread list query on Kestenbaum's
account. The unread count subquery has switched from a hash aggregate over the
account's messages to a nested loop over the new index. The planner's row
estimate for messages per thread is 41. On that account it is 380, and on their
biggest threads it is in the thousands.

**Tue 16 June, 11:15 to 12:50.** I try to fix it without dropping the index,
because the mobile work needs it. `ANALYZE messages` does not move the plan.
Neither does raising the statistics target on `thread_id`. The estimate is not
wrong about `messages` in general, it is wrong about the correlation between
thread size and account, and there is no single column statistic that says that.

**Tue 16 June, 13:04.** Drop the index. Plans revert on the next query.

**Tue 16 June, 13:10.** p95 back to 400 ms. Hal tells the three accounts.

**Wed 17 June, 16:30.** Index recreated, after Priya rewrote the unread count as
a lateral subquery with an explicit limit so the planner has no bad shape
available to it. Verified with `EXPLAIN (ANALYZE, BUFFERS)` against a restored
copy of production on the four largest accounts before it went out.

## Cause

The thread list query does two things at once: it pages threads for an account
ordered by `last_message_at`, and for each thread on the page it counts messages
newer than the viewer's last read. The second half was written as a correlated
subquery over `messages` in 2023 and has always been the expensive part.

Before the new index there was no useful access path for that subquery, so the
planner built the counts for the account in one pass and joined. That plan is
not clever and it is stable, and it is what we have been running on for two
years.

The new index gave the planner a cheap looking path per thread. It took it. The
cost model said fifty small index lookups. The reality on a large account was
fifty index lookups each followed by hundreds of heap fetches, on a table that
does not fit in cache.

So: an index that is correct for the query it was added for, added to a table
that another query reads differently, with no step in our process that would
have shown us the second query's plan before it went out.

## What went well, briefly

Ruth had not held the pager for long and escalated in ten minutes rather than
investigating for an hour. That is the behaviour the runbook asks for and it is
worth writing down when it happens.

Rolling back was one statement and took seconds. We did not have to think about
whether it was safe.

## What did not

We found out from a customer. Twice, before anybody looked at a graph. The
latency numbers were on a dashboard the whole time and nobody was looking at the
dashboard, which is what dashboards are for and also the reason they are not
alerts.

I also spent ninety minutes trying to keep the index because I did not want to
undo somebody else's work. Dropping it at 11:20 would have cost us nothing and
saved about two hours. The mobile endpoint was not shipped yet.

## Actions

| # | Action | Owner | Issue |
| - | ------ | ----- | ----- |
| 1 | Latency alert on `GET /threads`, p95 over 1 s for five minutes, working hours page | Priya Raman | `INF-319` |
| 2 | Any migration that adds or drops an index runs `EXPLAIN` against a restored production copy for the queries in the hot list, and the output goes in the pull request | Kenji Mori | `INF-320` |
| 3 | Write the hot list. Ten queries, checked in at `portside-api/db/hot-queries.sql`, with the accounts to test them against | Kenji Mori | `INF-321` |

Action 3 is the one that makes action 2 possible, so it is first in practice
even though it is third here. I have it for this week.

## Not doing

We discussed a per thread unread counter maintained on write, which removes the
subquery entirely. It is the right answer eventually and it is a schema change
with a backfill across every account, and Q3 is the billing migration. Priya has
it in the platform backlog and neither of us is going to pretend it is happening
this quarter.
