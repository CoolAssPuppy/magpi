# INF-322 Postgres major version upgrade

Team: Infrastructure
Status: Todo
Priority: Medium
Assignee: Kenji Mori
Labels: infrastructure, maintenance, scheduled
Created: 2026-08-10
Estimate: 2 weeks plus the window
Cycle: Cycle 35
Related: INF-318, BIL-241, SRCH-101

## Description

The primary is two major versions behind and the older of those two stops getting
patches. The reason to move is so that a security patch stays something we apply
in an afternoon. There is no feature on the far side of this that we want.

One primary, two read replicas, one logical replication slot feeding the
warehouse copy that Ade's reports read. All of it moves.

## Extension compatibility

Checked every extension we have installed against the target version.

| Extension | Status |
| --------- | ------ |
| `pg_trgm` | fine, no version change needed |
| `unaccent` | fine |
| `pgcrypto` | fine |
| `pg_stat_statements` | fine, the view gains two columns and our dashboard query names its columns, so it survives |
| `pg_partman` | needs a version bump first, on the old cluster, before the upgrade |
| `pg_repack` | client binary on the maintenance host is older than the server will be, has to be replaced |

The one that is not an extension and will be forgotten. `search/dict/freight.syn`
from SRCH-101 is a file in `$SHAREDIR/tsearch_data` on the database host, and the
new cluster is a new host with an empty directory. The deploy step installs it, so
the sequence is: build the cluster, run the deploy step, then check that
`SELECT to_tsvector('portside_freight', 'pod')` returns the expected lexeme
before any traffic goes near it. Skip it and search comes up, returns results and
quietly stops matching abbreviations.

`audit_log` is partitioned by month through `pg_partman`, so INF-318 and this
issue touch the same table for different reasons. They do not conflict.

## Plan

1. Bump `pg_partman` on the current cluster. Small, done in a normal deploy, done
   at least a fortnight before the window.
2. Build the new cluster on the target version. Same instance size, same
   parameters, diffed against the current `pg_settings` line by line.
3. Logical replication from old to new. Let it run for at least a week and watch
   replication lag and slot size daily.
4. Rebuild both read replicas off the new primary before the window, not after,
   so the window does not include a base backup.
5. In the window: stop the application, wait for the slot to drain to zero, run
   `ANALYZE` on the new cluster, repoint pgbouncer, start the application.
6. After: reindex nothing, because logical replication carries data and not index
   bloat. Verify the freight dictionary. Run the trueup in dry run and diff it
   against the last real run.

## Maintenance window

Sunday 06:00 to 08:00 UK. Expected downtime inside that is twenty to thirty
minutes and the rest is contingency.

Sunday morning is the quietest EDI hour we have. The overnight interchanges from
Marchetti and Brody and Sons land around 03:00 and are done by then. Weekday
morning is the worst possible time and I am writing that here so nobody suggests
it later.

Customers get notice a week ahead on the status page. Hal gets the wording first.

## Rollback

The old primary stays up and writable, with logical replication running the other
way from the moment we cut over. To go back we repoint pgbouncer and lose
nothing, and that decision has to be made inside the window, because after it the
reverse slot has a queue in it.

We do not drop the old cluster for two weeks.

## Comments

**Kenji Mori, 10 August**

Filed. Wanted a date and then realised the date is somebody else's decision.

**Priya Raman, 11 August**

Not before 1 October. That is the billing cutover and it is tied to a billing run
that does not move.

More than that, not in the fortnight either side. The dual run is 14 September and
the week after cutover is when we find whatever the dual run did not. If the
database changes underneath that, every difference we find has two candidate
explanations and we will spend a day ruling one out each time.

**Kenji Mori, 11 August**

Understood, and I would rather be told now than argue in September.

Proposing Sunday 18 October. That is seventeen days after the billing cutover,
which gives you two clean runs of the reconciliation report on the old version,
and it is before the audit log writer work goes into its last stretch.

**Marcus Ilic, 12 August**

18 October is fine. Two conditions.

This does not eat Kenji's time before 1 October. The audit log writer is the
thing on the plan with a date on it and this is the thing that would quietly take
a week out of it. Build the cluster, let replication run, which is mostly
waiting, and do nothing else until INF-318 is done.

And I want the rollback written as a rule rather than a judgement. Somebody in a
window at seven in the morning should not be deciding whether it is bad enough.

**Kenji Mori, 12 August**

Both agreed. I will put the abort conditions in this issue a week before the
window and they will be specific: replication lag, error rate on the health
endpoint, and the trueup dry run diff. Any one of those outside its bound and we
go back, no discussion in the room.

**Priya Raman, 13 August**

The trueup dry run diff is a good check and I had not thought of using it that
way. By 18 October the October run is done and the numbers are known, so running
it again against the new cluster and getting a different answer means the upgrade
did it.
