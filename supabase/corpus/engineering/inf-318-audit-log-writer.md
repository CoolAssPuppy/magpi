# INF-318 Audit log writer must take a region scoped connection pool

Team: Infrastructure
Status: In Progress
Priority: High
Assignee: Kenji Mori
Labels: infrastructure, compliance, tech-debt
Created: 2026-07-09
Estimate: 3 weeks
Cycle: Cycle 33 to Cycle 36
Blocks: INF-311

## Description

The audit log writer knows where the primary database is at compile time. It has
to take a pool instead, and the three modules that read the audit log have to
know which region they are asking about.

Why this blocks Frankfurt is in `INF-311`. The work is here.

## What the code does now

`services/audit/writer.ts` opens a connection at process start and holds it:

```ts
const POOL = getPrimaryPool();

export function appendAudit(row: AuditRow): Promise<void> {
  return POOL.query(INSERT_AUDIT, toParams(row));
}
```

`getPrimaryPool()` lives in `services/db/pools.ts` and reads
`process.env.PRIMARY_DATABASE_URL` once into a module level constant. It cannot
be varied per request, and the writer is not the only thing importing it.

Three consumers read `audit_log` through the same helper, and all three assume
that reading from the primary is the same as reading all of it.

**Export cursor**, `services/export/cursor.ts`. Pages `audit_log` by
`(created_at, id)` for the customer facing activity export. In two regions it
would page one region and report a complete export.

**Retention job**, `jobs/audit-retention.ts`. Deletes rows older than 24 months
in batches of 5,000. A one way replica cannot be deleted from, which is why the
replicate and union option failed.

**Compliance export**, `services/compliance/export.ts`. The one Bergstrom asked
for. It has three tests. One asserts the return is an array, one asserts a CSV
header row, and one has been skipped since 2022. Nothing tests that the export
contains every row it should, which is the only property anybody cares about.

## Plan

1. `appendAudit(pool, row)`. The pool comes from the request context, which
   already carries the account and therefore the account's region pin.
2. Delete `getPrimaryPool()`. Replace with `getPoolForRegion(region)` and a
   `getAllRegionPools()` for consumers that genuinely need every region.
3. Export cursor pages per region and merges on `created_at`. The cursor becomes
   `(region, created_at, id)`, and customers hold cursors, so the old format
   keeps working for a release.
4. Retention job runs per region against that region's writable primary, with a
   dry run mode that reports what it would delete and deletes nothing.
5. Compliance export: tests first, against a fixture with rows in two regions and
   an assertion on the full set. Then make it region aware. Most of the three
   weeks is here.
6. Single region deployments keep working throughout. The region list has one
   entry today and nothing in the code may assume that.

## Comments

**Kenji Mori, 9 July**

Split out of INF-311 so the blocker has its own number and estimate. Three weeks.
Target on the Q3 plan page is 9 October and it crosses the quarter on purpose.

**Priya Raman, 15 July**

Flagging the retention job before you get to it, because it touches something I
am in the middle of.

The reconciliation report reads `audit_log` for plan change events. When Ade
looks at an account whose charge moved, the first thing she checks is whether the
plan changed and when, and that answer comes out of the audit log rather than the
ledger, because the ledger is what we are deleting. Between now and the October
cutover the audit log is the record of why an invoice looks the way it does.

Two asks. Do not run the retention job in anger between 14 September and 7
October. And make the dry run the default, so somebody running it by hand at two
in the morning has to type a flag to delete anything.

**Kenji Mori, 15 July**

Both fine. Dry run as default was already in the plan and the flag will be named
something you cannot type by accident.

The freeze is easier than you think. The job deletes rows from 2024 and none of
it is urgent, so I will just not schedule it in September. It has been off for
six weeks at a time before and nobody noticed, which is its own small finding.

**Priya Raman, 16 July**

Thank you. Also worth knowing: once the ledger is gone, the audit log is the only
place plan history exists. Today it is in two places and retention is
housekeeping. In October it becomes the thing that answers a customer asking why
their invoice changed in March.

**Kenji Mori, 16 July**

That is a change in what the audit log is for and it belongs somewhere other than
this thread. Twenty four months of retention was chosen when the audit log
answered security questions. Raising it at the leads meeting.

**Kenji Mori, 28 August**

Writer and pools done, merged behind a region list with one entry. Export cursor
done, old format still accepted, there is a test for it.

Compliance export is where I said it would be. Eleven tests against a two region
fixture and four of them fail against the current code. Two are ordering, one is
a timezone, and one drops the last page when the page size divides the row count
exactly. That last one is in production today and has been for four years.
