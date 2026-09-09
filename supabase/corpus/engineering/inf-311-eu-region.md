# INF-311 EU region: Frankfurt deployment

Team: Infrastructure
Status: Blocked
Priority: High
Assignee: Kenji Mori
Labels: infrastructure, compliance, slipped
Created: 2026-04-09
Updated: 2026-06-22
Cycle: moved out of Cycle 32
Blocked by: INF-318

## Description

Stand up a second Portside deployment in Frankfurt so that customer data for
accounts that ask for it stays in the EU. Two accounts have asked, Marchetti
Freight and Bergstrom Logistik. Bergstrom put it in writing during their
renewal conversation in March.

Scope as originally written: database in eu-central-1, object storage in the
same region, application servers behind a region aware router, and a per account
flag that pins an account to a region at creation time and never moves it.

## Why this is blocked

The audit log writer.

Every write that touches a shipment thread appends to an audit log, and
compliance is the entire reason Bergstrom asked for an EU region in the first
place, so the audit log has to work in Frankfurt on day one. It does not.

The writer opens a connection to the primary database at process start, holds
it, and writes through it. There is one primary and the code knows where it is.
It is not a configuration value, it is a module level constant and a
`getPrimaryPool()` helper that four other modules also import. When I traced it
I found the export cursor, the retention job and the compliance export all
using the same helper, and all three assume that reading the audit log from the
primary is the same as reading all of it.

In a two region deployment there are two primaries and the audit log is split
across them. The compliance export would silently return half the records. Half
a compliance export is worse than no compliance export, because it looks like
one.

Options I looked at, in the order I abandoned them:

**Write both regions' audit rows to a single primary.** Defeats the purpose. The
audit rows contain thread identifiers and actor emails, which is the data
Bergstrom is asking us to keep in the EU.

**Replicate one way and query the union.** Works for the export, does not work
for retention, because retention deletes and a one way replica cannot be
deleted from.

**Rewrite the writer to take a region scoped pool and make the three consumers
region aware.** This is the one. It is `INF-318` and it is about three weeks of
work, most of it in the compliance export which has no tests worth the name.

So Frankfurt is not blocked on Frankfurt. It is blocked on a piece of 2022 code
that nobody has had a reason to touch until now.

## Comments

**Kenji Mori, 9 June**

Raised at the leads meeting. The honest position is that I estimated this in
April without reading the audit log writer, because I assumed it took a
connection string like everything else does. That was the mistake and it is
mine.

**Marcus Ilic, 10 June**

Understood. Do not spend the quarter apologising for it, spend it on INF-318.

Two things I want written down here rather than said in a meeting. First, we do
not start the Frankfurt work until the writer is done, because doing them in
parallel means the router and the writer get built against each other's
assumptions and we debug that instead. Second, Elena tells both accounts this
week, with a date, and we do not move that date a second time.

**Elena Vargas, 12 June**

Told Bergstrom on the call this morning. They were fine about it, which
surprised me. Their compliance person said the thing they cannot live with is a
date that moves twice, and one slip communicated early is a different
conversation from a slip they find out about in November.

Marchetti told by email the same day.

**Kenji Mori, 22 June**

Moved out of the cycle. New target is on the Q3 plan page rather than here,
because the date belongs to planning and I would rather there was one copy of
it that Sofia owns.

Work order once INF-318 lands: region aware router, then storage, then the per
account pin, then a dry run migration of Bergstrom's data on a copy.
