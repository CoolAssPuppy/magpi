# Billing platform review

Alderwick Systems Ltd. Confidential.
Billing platform review, February 2026

--- Page 1 ---

Billing platform review
February 2026

Priya Raman, engineering lead, platform
Ade Fashola, finance

Prepared for the March decision meeting

Alderwick Systems Ltd. Confidential.
Billing platform review, February 2026

--- Page 2 ---

Why we are looking at this

- Portside bills a plan fee plus a per shipment charge above an
included volume. The plan fee is easy. The overage is not, because
we do not know it until the month closes.
- The service that does this was written in 2023. It calls Stripe for the
charge and does everything else itself.
- Four hundred lines of proration logic and a cron job.
- Three of the last six support escalations that reached engineering were
billing.
- and
- Every plan change is a held breath.

Alderwick Systems Ltd. Confidential.
Billing platform review, February 2026

--- Page 3 ---

What the current service actually does

Invoice line items Built by us from plan, seats and shipment count
Proration Recomputed from invoice history, every time
Trueup Cron job, first of the month, no visible failure state
Payment Stripe
Refunds and credits By hand, Ade, in the Stripe dashboard
Reconciliation Nothing. Ade rebuilds it in a spreadsheet.

Alderwick Systems Ltd. Confidential.
Billing platform review, February 2026

--- Page 4 ---

The three options

1. Keep it and rebuild it properly
Single ledger table, trueup on the job queue,
reconciliation report Ade can read on the first.

2. Move to Stripe Billing
Subscriptions for the plan, metered pricing for the
overage.

3. Buy a billing vendor
Two quotes in hand.

Alderwick Systems Ltd. Confidential.
Billing platform review, February 2026

--- Page 5 ---

Option 2, and the problem with it

The general case fits a subscription product fine. $340 a month, five
seats, 1,200 shipments included, $0.11 above that. That is a
subscription with a metered component and it is not hard.

The exceptions are where it stops being easy.

- Eleven accounts have a negotiated allowance that is not the plan
default. The allowance is the thing that was negotiated, not the price.
- Six accounts have an annual commitment paid monthly.
- The two sets overlap by two.

Alderwick Systems Ltd. Confidential.
Billing platform review, February 2026

--- Page 6 ---

The negotiated allowance problem, in detail

Ade priced out expressing the exceptions as subscriptions.

The shape that came back needs two subscriptions per customer: one
carrying the plan fee at the negotiated rate, one carrying the metered
component with a custom included quantity. Then a manual adjustment
every month where the commitment and the plan fee drift.

They drift whenever somebody adds a seat. Seats are $28 each and
customers add them constantly, which is the whole point of the product.

Seventeen accounts out of 214. Ade's estimate was a day a month of
adjustments, forever, and a reconciliation he cannot automate.

Alderwick Systems Ltd. Confidential.
Billing platform review, February 2026

--- Page 7 ---

The mid cycle upgrade rule

When a customer upgrades on the 14th we do not prorate the shipment
allowance. They get the whole new allowance for the month.

- We prorate the plan fee. We do not prorate the allowance.
- Elena has sold it that way for four years and it is in the sales deck.
- Every customer who has upgraded mid month has had that conversation
with a salesperson.

This is one rule. It is ours. Any platform we adopt has to be talked
into it, and the talking usually ends in a webhook and a manual credit,
which is the thing we are trying to stop doing.

Alderwick Systems Ltd. Confidential.
Billing platform review, February 2026

--- Page 8 ---

Option 3, the vendor quotes

Ade ran two vendors through a short evaluation and got pricing from
both.

Both quotes came back at more than we spend on all our
infrastructure. The comparison there is our whole infrastructurebill,
every environment, not the billing line inside it.

We are not putting the numbers on this slide because they are under
NDA and because the number is not the interesting part. The interesting
part is that at that price the question stops being technical.

Both vendors would handle the negotiated allowances. Neither handles
the mid cycle rule without configuration work we would own anyway.

Alderwick Systems Ltd. Confidential.
Billing platform review, February 2026

--- Page 9 ---

What a rebuild costs

Jonah's estimate, and he wrote the original:

Proration against a ledger 2 weeks
Trueup onto the job queue 1 week
Reconciliation report 1 week
Backfill and verification 1 to 2 weeks

Five or six weeks. One engineer. No data migration, because the data
stays where it is.

Compare: a platform migration is a quarter of work plus moving 214
live accounts, and at the end of it we still write the trueup
ourselves, because the shipment count comes out of our database and
always will.

Alderwick Systems Ltd. Confidential.
Billing platform review, February 2026

--- Page 10 ---

Risk, either way

If we rebuild
- The proration rewrite touches money. Mistakes show up on a customer
invoice before they show up in our logs.
- One person has read the current code end to end.

If we migrate
- Data migration for 214 accounts.
- Seventeen exception accounts need a manual shape from day one.
- The mid cycle rule becomes somebody else's default and our exception.

Alderwick Systems Ltd. Confidential.
Billing platform review, February 2026

--- Page 11 ---

What would change our mind later

- If the exception accounts stopped being exceptional. If thirteen of the
seventeen renewed onto standard terms, the argument on slide 6
disappears.
- If we ever sell usage only. Then the plan fee stops being the
anchor and the model looks like everybody else's.
- If Jonah stopped owning this code.

None of those are true in February.

Alderwick Systems Ltd. Confidential.
Billing platform review, February 2026

--- Page 12 ---

Questions for the room

- Are we comfortable that seventeen accounts are driving the decision for
214?
- Ade, is a day a month of manual adjustment worse or better than a day
and a half of hand checking a run?
- Marcus, does a five week rebuild count as fewer things in flight or
one more thing?
- What is the review trigger and when do we look at this again?

Alderwick Systems Ltd. Confidential.
Billing platform review, February 2026
