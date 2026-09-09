# Board update Q2 2026

Alderwick Systems Ltd.
Board pack, Q2 2026. Confidential.

--- Page 1 ---

Alderwick Systems Ltd. Board pack, Q2 2026. Confidential.

Q2 2026 board update

10 July 2026
Diane Ockley, chief executive

Deck exported for the pack. Slides only. The financial statements,
the H2 budget and the cash position are appendices A to C and are
not repeated here.

Alderwick Systems Ltd. Board pack, Q2 2026. Confidential.

--- Page 2 ---

Alderwick Systems Ltd. Board pack, Q2 2026. Confidential.

What I want from today

- Forty minutes on the billing decision and the reversal, because it
is the most interesting thing that happened this quarter and I would
rather you heard it from me at length than in a paragraph
- A view on the pricing change. Numbers come to you in September
- Two introductions. Slide 11
- Fifteen minutes at the end with no agenda

What I do not want today is a conversation about raising money. If
that changes I will put it on an agenda rather than let it arrive
sideways.

Alderwick Systems Ltd. Board pack, Q2 2026. Confidential.

--- Page 3 ---

Alderwick Systems Ltd. Board pack, Q2 2026. Confidential.

Q2 in one page

Shipped: thread merge, attachment grid, bulk status update, tolerant
mode on the 204 parser, invoice PDF redesign, saved recipients.

Mobile app went out at the start of July. Without offline drafts,
which was a deliberate cut and the right one.

Did not ship: the proration rewrite, which we cancelled rather than
missed. Frankfurt, which moved to Q4.

Headcount 31. Two joins, no leavers, no regretted departures in
eighteen months.

Alderwick Systems Ltd. Board pack, Q2 2026. Confidential.

--- Page 4 ---

Alderwick Systems Ltd. Board pack, Q2 2026. Confidential.

Revenue shape

Detail in appendix A. This slide is the shape, which is the part I
think is worth your time.

Plan Accounts Share of accounts Share of revenue
Standard 174 81% 62%
Growth 40 19% 38%

Where the money comes from Share
Plan fees 54%
Seats above the included five or twenty 18%
Shipment overage 28%

The overage line is the one to look at. Twenty eight percent of what
we bill is a number nobody knows until the month closes, including
the customer. That is the whole argument for the pricing work on
slide 10.

Alderwick Systems Ltd. Board pack, Q2 2026. Confidential.

--- Page 5 ---

Alderwick Systems Ltd. Board pack, Q2 2026. Confidential.

Churn and retention

214 live accounts at the end of Q2. 214 at the end of Q1. That is
not a coincidence, it is six won and six lost.

The six we lost:
- Two went out of business. Both small, both were struggling before
they were customers
- Two merged into other brokerages. One of the acquirers is still
ours, so we kept the volume and lost the logo
- One to Harbourline, on billing predictability and on carrier
records, and Elena has written that one up honestly
- One downgraded in March and left in June

Net revenue retention 106%, on expansion in seats and overage rather
than on anything we sold them.

Flat logos and growing revenue per account is a real business and it
is also a warning. We are getting more out of the customers we have
and we are not adding customers.

Alderwick Systems Ltd. Board pack, Q2 2026. Confidential.

--- Page 6 ---

Alderwick Systems Ltd. Board pack, Q2 2026. Confidential.

The billing decision, March

We bill a monthly plan fee plus a charge per shipment above an
included volume. That runs on a service we wrote ourselves.

In March we decided to keep it and rebuild it properly, rather than
move the plan and seat billing onto Stripe.

Three reasons, all of them good on the day:

- Our billing model has exceptions that do not sit cleanly in a
subscription product
- The rule about mid cycle upgrades is ours and any platform would
have to be taught it
- The engineer who wrote the service owned it and estimated five to
six weeks

I signed it off. It is on the record with my name on it and I am
not going to present it as a decision that happened to the company.

Alderwick Systems Ltd. Board pack, Q2 2026. Confidential.

--- Page 7 ---

Alderwick Systems Ltd. Board pack, Q2 2026. Confidential.

The billing decision, June

We reversed it.

All three reasons had moved by June. The exception accounts turned
out to be seventeen out of 214 and a shrinking seventeen. The mid
cycle rule turned out to be one rule, expressible as a single
invoice item rather than as a ledger. And the engineer who owned the
code moved to the search team, which was right for him and right for
search and removed the third reason completely.

Nine weeks into a five week rewrite we had three bug fixes and no
rewrite.

Plan fees and seat counts move onto Stripe subscriptions. The month
end job that counts shipments stays ours, because the shipment count
comes out of our database and always will.

Cutover is the October billing run.

Alderwick Systems Ltd. Board pack, Q2 2026. Confidential.

--- Page 8 ---

Alderwick Systems Ltd. Board pack, Q2 2026. Confidential.

What the reversal cost, and what I take from it

Written off: about five engineer weeks, roughly £7,300. Three months
of calendar.

Still to spend: seventeen to nineteen engineer weeks through Q3.

What I would like you to take from it, and it is the reason this has
three slides rather than one:

- Nobody spent a week defending March. The head of platform took the
three reasons and went through them in order, in public, in about
eight minutes
- It was written up as a decision, not as an apology
- The failure was not the decision. It was that seventeen accounts
out of 214 drove it and nobody asked hard enough whether seventeen
should

- and the second time somebody

Alderwick Systems Ltd. Board pack, Q2 2026. Confidential.

--- Page 9 ---

Alderwick Systems Ltd. Board pack, Q2 2026. Confidential.

Frankfurt

Two customers have asked for their data to stay in Europe. One put
it in writing during a renewal conversation in March.

We planned it for Q3. It is Q4.

The reason is specific and I would rather give it to you than give
you a category. Every write in Portside appends to an audit log. The
code that writes that log was built in 2022 on the assumption that
there is one database and it knows where it is. Three other things
read the log through the same assumption, including the compliance
export, which is the exact feature the European customer is asking
for. In two regions that export would silently return half the
records, and half a compliance export is worse than none because it
looks complete.

So we rewrite that first, then build the region. Doing both at once
means they get built against each other's assumptions.

There is a date. It is on the engineering plan and both customers
have been told it, with a named person and a phone call rather than
an email. It is not on this slide, because the last date I put on a
slide moved and I would rather report it to you when it has held.

Alderwick Systems Ltd. Board pack, Q2 2026. Confidential.

--- Page 10 ---

Alderwick Systems Ltd. Board pack, Q2 2026. Confidential.

Hiring, second half

Five roles. 31 people to 36.

Role Team When
Engineer, billing and platform Platform September
Account executive Sales September
Infrastructure engineer Infrastructure October
Product designer, twelve month cover Product October
Support engineer Support November

Two of these exist because one person is a single point of failure
and one exists because our only designer goes on parental leave in
November.

There is a written trigger: if we are more than four percent under
the revenue plan at the end of August, the infrastructure and
support roles hold until January. More than eight percent and only
two of the five proceed. I would rather show you the rule now than
explain a decision in October.

Alderwick Systems Ltd. Board pack, Q2 2026. Confidential.

--- Page 11 ---

Alderwick Systems Ltd. Board pack, Q2 2026. Confidential.

Pricing

The plan fee has not moved in four years and the product has.

We are changing it in October, before the October renewal window
rather than after it. Two shapes are still on the table and neither
is agreed, so there are no numbers on this slide and there will not
be any until they are real.

What I will tell you about the direction: the overage rate is the
half I find interesting. An account in a busy month can see its bill
roughly double, and the accounts that experience that are the ones
most likely to be looking at somebody else. A bill that is higher
and steadier is worth more to us than a bill that is occasionally
enormous.

Numbers to you at the September meeting. Announcement to customers
in the second half of September. Existing customers move at their
renewal with sixty days notice, not on the day.

Alderwick Systems Ltd. Board pack, Q2 2026. Confidential.

--- Page 12 ---

Alderwick Systems Ltd. Board pack, Q2 2026. Confidential.

The ask

1. Note the hiring plan and the revenue trigger. I am not asking for
approval, I am asking you to have seen the trigger before it fires

2. Bless the direction on pricing today so that October is not
waiting on a September board date. Numbers still come to you in
September and go in the minutes

3. Two introductions. One senior infrastructure engineer, because we
have failed to fill that role twice on our own and are about to pay
an agency. One route into a European brokerage group, so that
Frankfurt has a second commercial reason to exist and not only two
customers who asked

Appendices A to C in the pack: statements, H2 budget, cash.

Alderwick Systems Ltd. Board pack, Q2 2026. Confidential.
