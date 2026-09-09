# BIL-233 Trueup job aborts with ERR_TRUEUP_4471 on accounts with a zero allowance

Team: Billing
Status: Done
Priority: High
Assignee: Jonah Kestrel
Labels: billing, bug
Created: 2026-06-30
Completed: 2026-07-02
Estimate: 1
Cycle: Cycle 33

## Description

The June trueup run aborted partway through. Job log:

```
[trueup] run 2026-06-30T02:14:11Z accounts=214
[trueup] processed=88 skipped=0
[trueup] fatal ERR_TRUEUP_4471 account=acct_31be allowance=0 period=2026-06
[trueup] aborted after 88 accounts, no invoice items written
```

`ERR_TRUEUP_4471` is the guard we added in BIL-201 that refuses to divide by an
allowance of zero when computing the proportion of the period a plan was in
force. It was written as a fatal because at the time an allowance of zero was
impossible.

It is now possible. Ade set up two trial accounts on 29 June with a zero
shipment allowance so sales can demo without generating overage. Nobody told
billing, and nobody should have to, because the code should not fall over on a
value the admin form lets you type.

The abort is the actual problem. One bad account stopped the run for the other
126, and because the job writes invoice items at the end rather than per
account, nothing was written at all. Ade found it at 08:40 when the
reconciliation report was empty.

## Fix

Two changes.

1. Zero allowance is valid. Every shipment is overage. Skip the proportion
   calculation entirely rather than guarding it.
2. A fatal on one account no longer aborts the run. Record the failure against
   the account, carry on, and report the failed accounts at the end. Ade would
   rather have 213 correct accounts and a list of one than nothing.

The second change is the one worth having. The first is three lines.

## Comments

**Jonah Kestrel, 30 June**

Shipped. Rerun completed at 11:02, 214 accounts, no failures.

**Priya Raman, 30 June**

Good. Note for `BIL-241`: whatever we build on Stripe, the trueup stays ours
and it needs the same per account isolation. Do not carry the abort behaviour
across.

**Ade Fashola, 1 July**

The reconciliation report being empty is how I found this. That report has now
paid for itself twice.

**Jonah Kestrel, 2 July**

Closing. This is my last billing issue. Handover doc is in Notion.
