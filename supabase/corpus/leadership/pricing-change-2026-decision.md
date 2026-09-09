# Pricing change, October 2026: decision

Status: decided
Date: 27 August 2026
Owner: Diane Ockley
Approved by: Diane Ockley, Marcus Ilic
Circulation: leadership only until 22 September

Confidential until the announcement. Elena gets the numbers on 15 September so
she can brief the account managers. Nobody else sees this page before the 22nd.

## The decision

Effective 1 October 2026:

- **Standard plan** goes from **$340 per month to $395 per month**. Includes
  five seats and 1,200 shipments a month, unchanged.
- **Growth plan** goes from **$890 per month to $990 per month**. Includes
  twenty seats, unchanged.
- **Shipment overage** goes from **$0.11 per shipment to $0.09 per shipment**,
  above the included allowance.
- **Additional seats** stay at $28 per seat per month on both plans.

New customers pay the new prices from 1 October. Existing customers move at
their next renewal, not on 1 October, and every existing customer gets at least
sixty days notice before their renewal date.

Announcement to customers: **22 September 2026**, by email from Diane, followed
by a help centre page Hal publishes the same morning.

## Why the plan fee goes up and the overage rate goes down

The plan fee has not moved in four years and the product has. That is the whole
argument for the plan fee.

The overage rate is the more interesting half. Today an account that goes 3,000
shipments over its allowance pays $330 in overage on top of $340 of plan fee,
which means the bill roughly doubles in a busy month. Elena has lost two deals
this year on that shape, and Ade's read of the billing data is that our heaviest
users are the ones most likely to be looking at alternatives, because they are
the ones whose invoice varies most.

Dropping the overage to $0.09 while raising the plan fee moves us toward a bill
that is higher and steadier. An account doing 1,200 shipments pays $55 more. An
account doing 4,200 shipments pays $5 less. The accounts that get more expensive
are the small quiet ones, which are also the ones least likely to leave over
$55, and the accounts that were most at risk get slightly cheaper.

We did model a flat rise with no overage change. It is worth more money on
paper and Elena's view, which we accepted, is that it puts the wrong accounts
in play.

## Accounts held at current pricing

Three accounts hold their current pricing for twelve months from 1 October,
regardless of renewal date:

| Account            | Reason                                                                 |
| ------------------ | ---------------------------------------------------------------------- |
| Bergstrom Logistik | Committed to the EU region on their March renewal and we have slipped it. |
| Marchetti Freight  | Two billing errors on their invoices in May, both our fault.            |
| Halvorsen Carriers | Renewing in the October window, and they are our largest single account.|

Elena has the authority to add a fourth if a renewal conversation goes badly.
She does not have the authority to add a fifth without asking Diane.

The six accounts on an annual commitment paid monthly keep their current rate
until their commitment ends. That is a contractual obligation rather than a
decision.

## What engineering needs from this

Priya needs the trueup job to apply a different overage rate per account from a
given date. That is already in scope for `BIL-241` and she confirmed on 20
August that the cutover on 1 October and the price change on 1 October are the
same billing run, which is either efficient or reckless depending on the day
you ask her.

The three held accounts and the six annual accounts are the awkward rows. Nine
accounts out of 214 with a non default rate.

## Risk we are accepting

October is also the billing platform cutover. If the cutover goes wrong, it
goes wrong on the first invoice that carries a new price, and every customer who
sees a strange number will assume the price rise is the cause. Ade hand checks
the October run before invoices send. Marcus has agreed the cutover can be
rolled back on 30 September without moving the price change.

## Not decided

- Whether we announce anything about the EU region in the same email. Current
  answer is no.
- Annual prepay discount. Ade wants one. Parked until January.
