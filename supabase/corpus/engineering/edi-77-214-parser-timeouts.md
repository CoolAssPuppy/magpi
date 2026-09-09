# EDI-77 Legacy 214 parser times out on two accounts

Team: Integrations
Status: Todo
Priority: Medium
Assignee: Kenji Mori
Labels: edi, tech-debt, customer-impacting
Created: 2026-04-17
Estimate: not estimated
Cycle: Cycle 30
Related: EDI-81, EDI-79

## Description

The legacy 214 parser, the 2021 one that seven customers still feed, is killed by
the job runner on two of the seven. Marchetti Freight, `acct_9f2c`, and Brody and
Sons, `acct_c704`. Status messages for those two accounts arrive in the thread
late or not at all, and when they do not arrive the dispatcher phones the carrier
to ask where the truck is, which is the exact thing Portside is meant to stop.

The cron runs `edi214-legacy` every fifteen minutes. Wall clock timeout is 300
seconds and it is enforced by the runner, not by the job, so the process is
killed and whatever it had parsed is not written.

```
[edi214-legacy] batch 2026-04-16T03:02:44Z connection=conn_4a19 account=acct_9f2c
[edi214-legacy] interchange ISA_0091 segments=18422 messages=1412
[edi214-legacy] segment scan pass=3 elapsed=214s
[edi214-legacy] segment scan pass=4 elapsed=288s
[edi214-legacy] killed: job exceeded 300s wall clock, 0 messages committed
```

Both accounts do the same thing, which is why it is those two and not the other
five. They send the whole day in one overnight interchange rather than a message
at a time. Marchetti's 03:02 batch is routinely over eighteen thousand segments.
The other five send a few dozen segments every few minutes and never come near
the limit.

## Why it is slow

`parseStatusLoop()` in `edi/legacy/parser214.js`. For each status message in the
interchange it scans the full segment array from position zero looking for the
matching stop and reference segments, because the 2021 code has no index and no
position cursor. That is quadratic in the segment count. Six hundred segments
runs in under a second. Eighteen thousand does not.

Nothing else in the file is slow. It is that one loop.

## What a proper fix looks like

Build a segment index once per interchange and have the loop seek instead of
scan. That is an afternoon of work in isolation.

It is not an afternoon of work here. `parseStatusLoop()` is also where the
tolerant segment order behaviour lives, in the form of six years of conditional
branches that check what came before the current segment and decide what it must
therefore be. The scan is not incidental to that. It is how the branches know
where they are. Indexing the segments means rewriting the branch logic, and the
branch logic is the only place the older implementation guide is described, and
it is described in code rather than anywhere a person could read.

So the honest estimate for fixing it properly is a rewrite of the parser we are
trying to delete, with no test fixtures, against a message format documented
nowhere except in the file itself.

## What we did instead

Raised the runner timeout for this job to 900 seconds and split the batch by
interchange so a kill loses one interchange rather than the night. Marchetti now
completes at around 470 seconds and Brody and Sons at around 350. It is a patch
and it stops working the day either account grows.

## Comments

**Kenji Mori, 17 April**

Filed with the log line so the next person does not have to find it.

**Kenji Mori, 24 April**

Timeout raised, batches split. Both accounts have run clean for six nights.

Calling that fixed would be wrong. Marchetti's volume grew about a fifth over the
last year, and if it grows the same amount again we are back here with less
headroom and the same conversation.

**Hal Winters, 12 May**

Marchetti raised it again this morning, three status messages missing from
Saturday night. Is that this or something else.

**Kenji Mori, 12 May**

Saturday was a different thing, a malformed interchange the parser rejected
whole. Same parser, different failure. Sending you the message so you can answer
them.

**Kenji Mori, 3 August**

Answer to this is `EDI-81`. Move all seven onto the current parser with a
tolerant segment order mode behind a per connection flag, then delete the legacy
path and the cron that feeds it. The current parser builds an index and seeks, so
the timeout stops existing.

Engineering work over there is two weeks. The constraint is not engineering, it
is ninety days written notice under clause 7.2, and the reasoning is written up
in EDI-81 rather than here.

Leaving this open until the seven are moved, because until then the patch is what
is holding two accounts up and somebody should be able to find out why.
