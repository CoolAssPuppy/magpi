# BIL-204 Proration produces wrong mid-cycle totals on downgrade

Team: Billing
Status: In Progress
Priority: Urgent
Assignee: Jonah Kestrel
Labels: billing, correctness, customer-impacting
Created: 2026-05-19
Estimate: 5
Cycle: Cycle 31
Related: BIL-198, BIL-201, BIL-205

## Description

Third proration bug this cycle. When an account downgrades from Growth to
Standard partway through a billing period, the ledger writes a credit for the
unused plan fee and then the trueup job recomputes the shipment overage against
the new allowance rather than the allowance in force on each day. The customer
is charged overage on shipments that were inside their allowance when they
happened.

Reproduced on account `acct_9f2c` (Marchetti Freight) on the 12 May run. They
downgraded on 6 May. Invoice shows 340 shipments of overage. Correct figure is
118.

Two accounts affected in May. Both credited by hand. Ade found them, we did
not, which is the part that bothers me.

Root cause is the same as BIL-198 and BIL-201. The ledger stores the plan
transition as a single event with an effective date, and every consumer that
needs to know what the allowance was on a given day recomputes it by walking
the events forward. Three consumers walk it, and they disagree about whether
the transition day belongs to the old plan or the new one.

## Steps to reproduce

1. Account on Growth, allowance 6,000, billing period starts on the 1st.
2. Ingest 4,100 shipments between the 1st and the 5th.
3. Downgrade to Standard on the 6th.
4. Ingest 900 shipments between the 6th and the end of the month.
5. Run the trueup job.

Expected: overage computed against 6,000 for days 1 to 5 and 1,200 for the rest.
Actual: 5,000 total shipments compared against 1,200 for the whole period.

## Fix

Store the allowance in force as a dated interval on the ledger rather than
deriving it. Backfill the intervals for the 214 live accounts. One consumer
reads the interval, the other two get deleted.

## Comments

**Jonah Kestrel, 19 May**

Fix is straightforward and I can have it in this cycle. What I want to flag is
that this is the third one. BIL-198 in April was the upgrade path, BIL-201 was
annual commitments, this is downgrade. Each one is a different consumer walking
the same events and getting a different answer. I keep fixing the consumer
instead of the model.

**Priya Raman, 20 May**

Agreed on the fix. Take the cycle.

The wider thing is the March decision. We wrote that record and one of the
three reasons was that Jonah knows the code and a rewrite he owns takes five or
six weeks. We are now nine weeks in and this is the third correctness bug that
reached a customer invoice. I am not saying the decision was wrong. I am saying
the reason we gave has not held up.

**Marcus Ilic, 20 May**

Read the March record again this morning. Two things.

The blocker we wrote down was negotiated allowances plus the mid cycle upgrade
rule. Eleven accounts with a negotiated allowance, six with an annual
commitment. That is a narrower constraint than I remembered it being when we
were arguing about it. We talked ourselves into "our model does not fit" and
what we actually wrote down was seventeen accounts out of 214.

The other thing is that the trueup job is ours no matter what, because the
shipment count comes from our database. So the question was never whether we
write the trueup. It was whether we also write proration, invoicing and the
ledger, which is where all three of these bugs live.

Not reopening it in a comment thread. Putting it on the June review.

**Ade Fashola, 21 May**

For the record on cost: I have hand checked or hand credited something on four
of the last five monthly runs. That is roughly a day and a half a month of my
time and it is the day and a half where I am least useful to anyone.

**Jonah Kestrel, 22 May**

Fix is in review. Backfill runs Thursday.

One more thing for the June conversation and then I will stop. I am moving to
the search team in July. Whoever picks this up gets four hundred lines of
proration logic and a ledger backfill they did not write. I would rather hand
over a Stripe integration than hand over this.

**Priya Raman, 26 May**

Backfill done, 214 accounts. Marchetti credited. Closing when the June run is
clean.
