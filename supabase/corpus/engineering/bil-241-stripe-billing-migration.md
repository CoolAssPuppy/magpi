# BIL-241 Move plan fees and seat counts to Stripe subscriptions

Team: Billing
Status: In Progress
Priority: Urgent
Assignee: Priya Raman
Labels: billing, epic, migration
Created: 2026-07-06
Estimate: epic, tracked in children
Cycle: Cycle 33 to Cycle 36
Related: BIL-204, BIL-233

## Description

The epic for the June reversal. Plan fees and seat counts go to Stripe
subscriptions. The month end trueup stays ours, because the shipment count comes
out of `shipment_event` and always will, and it gets posted as one invoice item
against the Stripe subscription instead of against our ledger.

Deleted at the end of this: `billing/proration.ts`, all four hundred lines, and
the `billing_ledger` and `billing_ledger_interval` tables behind it. That file
and those tables produced BIL-198, BIL-201 and BIL-204.

Kept: the trueup job, the reconciliation report, and the allowance field on the
admin account screen.

## Plan

1. One Stripe product per plan, monthly recurring. Standard $340 with five seats,
   Growth $890 with twenty. Seats above that are a quantity at $28.
2. Map all 214 live accounts to a subscription.
   `account.stripe_subscription_id`, nullable until an account is migrated, which
   is how both systems run at once.
3. Trueup reads `account.shipment_allowance` and writes overage as a Stripe
   invoice item at $0.11 per shipment above it. No ledger read anywhere.
4. Point the reconciliation report at Stripe invoices. Same columns, same CSV.
   Ade should not have to learn anything.
5. Mid cycle plan change becomes a subscription update plus one invoice item for
   the difference. We do not prorate the shipment allowance on upgrade. That rule
   is a line now instead of a module.
6. Delete the ledger, the proration file, and the two cron entries feeding them.

## The awkward rows

**Thirteen negotiated allowances.** A value in `account.shipment_allowance` that
differs from the plan default. Not special once the column exists. The work is
copying thirteen numbers out of the ledger and checking them against Elena's
contracts, by hand, twice.

**Six annual commitments paid monthly.** The ones I said in June I had no clean
answer for. The subscription bills monthly, the commitment is annual, and Stripe
has no opinion about the commitment. Each of the six moves at its own renewal and
is handled by hand until then.

**Three held rate accounts.** Diane has flagged three accounts as needing a held
rate through the migration. The reason is not mine to write down. What billing
needs is a per account rate the trueup reads instead of the plan rate, with an
effective from date and no expiry until somebody sets one. That is
`account.overage_rate_override`, nullable.

## Dates

- Dual run against production data: 14 September. Both systems compute, neither
  charges, we diff per account.
- Cutover: the October billing run, 1 October.

Billing runs do not move, so neither does this.

## Comments

**Priya Raman, 6 July**

Opened. Work starts the week of the 13th, after Jonah's handover.

One thing on the record now rather than in October. The measure of this epic is
that `billing/proration.ts` is deleted. If the subscriptions are live and that
file is still on disk because something still reads it, we have added a system
and kept the old one.

**Jonah Kestrel, 9 July**

Handover doc is done and linked from the project. Two things in it that are not
obvious from the code.

The ledger has two write paths. The known one is the plan change event. The other
is the seat count adjustment, which goes through `applySeatDelta`, predates the
ledger and was never moved onto it. It writes a row that looks like a ledger row
and is not one.

The trueup also reads the ledger three times per account when one read would do,
which is why the June run takes forty minutes.

That is me done on billing. Priya has everything. Signing off before I disappear
into search, and I would rather hand over a Stripe integration than hand over the
ledger, which I have now said enough times.

**Ade Fashola, 21 July**

What I do with the reconciliation report is not what it was built for, so before
you point it at Stripe, this is the use.

I open it the morning after the run and read three columns: account, what we
charged, and the shipment count, sorted by the change from last month. Anything
that moved more than about thirty percent I check by hand. Usually four or five
accounts, and about once a quarter one of them is a real problem rather than a
busy month.

Same columns, same sort, and it does not have to be prettier. What it does need,
which it does not do today, is to show a failed account as a failed account. In
June the run aborted and the report was empty, and an empty report looks exactly
like a report I have not opened yet.

**Priya Raman, 22 July**

Taking the failed row as a requirement. Every account gets a row and a status of
charged, skipped or failed. An empty report should be impossible.

**Priya Raman, 4 September**

Subscriptions created for 211 of 214 before the dual run. The three missing are
two zero allowance trial accounts and one account in a payment dispute.

Allowances copied and checked. One had been wrong in the ledger since February,
in the customer's favour. We are correcting it forward at renewal and Elena is
telling them rather than clawing it back.
