# SRCH-95 Thread subject should outrank body text in ranking

Team: Search
Status: Done
Priority: Medium
Assignee: Nadia Osei
Labels: search, ranking
Created: 2026-06-11
Completed: 2026-06-19
Estimate: 2
Cycle: Cycle 32
Related: SRCH-88

## Description

A thread whose subject is "Marchetti 4412 Rotterdam" ranks below a thread that
merely mentions Rotterdam nine times in a forwarded email chain. The subject is
the field the dispatcher named the thread by, or that the load tender named it,
and it should win.

The cause is that `search_document` marks the subject with `setweight(..., 'A')`
and the message bodies with `'B'`, but the `ts_rank_cd` weight array in
`search/rank.sql` is `{0.1, 0.2, 0.4, 1.0}`, which Postgres reads in the order
D, C, B, A. So A is 1.0 and B is 0.4, a ratio of two and a half. A body with nine
occurrences of a term beats a subject with one, every time, because `ts_rank_cd`
sums over occurrences before the weight is applied.

Two changes. Move the message bodies from `'B'` to `'C'` so the ratio to the
subject becomes five to one. Cap the occurrence contribution of the body field so
a long forwarded chain stops accumulating score without limit. Internal notes and
party names stay where they are.

## Before and after

Query: `rotterdam reefer`. Account `acct_9f2c`, 2,140 threads.

Before:

```
1  0.081  Re: Re: Fwd: weekend cover      body x11 (rotterdam), body x2 (reefer)
2  0.074  Carrier list Q1                 body x9  (rotterdam)
3  0.061  Rotterdam reefer 4412           subject x2, body x1
4  0.058  Rotterdam reefer 4530           subject x2
```

After:

```
1  0.140  Rotterdam reefer 4412           subject x2, body x1
2  0.133  Rotterdam reefer 4530           subject x2
3  0.036  Re: Re: Fwd: weekend cover      body x11 (rotterdam), body x2 (reefer)
4  0.029  Carrier list Q1                 body x9  (rotterdam)
```

Threads three and four in the before list are the two the dispatcher wanted. The
first two are a cover rota and a carrier list.

## Comments

**Nadia Osei, 11 June**

Small and worth doing. I am filing it separately from SRCH-88 so that nobody
reads it as progress on SRCH-88. It moves one weight. The index still does not
contain load references under four characters and this does not change that.

**Sofia Berg, 12 June**

Take it. Ships this cycle.

**Nadia Osei, 17 June**

In review. I ran it against a sample of 300 real queries from the last fortnight
and diffed the top five results for each. 214 unchanged, 71 better by my reading,
15 worse. The 15 are all queries where the term genuinely only appears in a body,
usually a place name inside an address block, and the thread that now wins is a
different thread with the place in the subject. I think that is the correct
trade and I am flagging it rather than burying it.

**Hal Winters, 19 June**

Tried it on the four tickets open this morning where somebody could not find a
thread. Found three of them first result. The fourth was a load reference and it
still finds nothing, which I understand is the other issue.

**Nadia Osei, 19 June**

Shipped. And yes, that is SRCH-88.
