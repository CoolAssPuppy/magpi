# Billing rebuild: decision record

Status: decided
Date: 11 March 2026
Owner: Priya Raman
In the room: Priya Raman, Jonah Kestrel, Marcus Ilic, Ade Fashola, Diane Ockley

## What we are deciding

Portside bills a monthly plan fee plus a per shipment charge above an included
volume. Today that runs on a service Jonah wrote in 2023 that calls Stripe for
the charge and does everything else itself: the invoice line items, the
proration when somebody changes plan mid month, and the month end trueup that
counts shipments and adds the overage.

The service is four hundred lines of proration logic and a cron job. Every time
a customer changes plan we hold our breath. The question in front of us is
whether to keep building on it or move the whole thing onto Stripe Billing and
let subscriptions and metered pricing do the work.

## The decision

We keep the billing service and rebuild it properly. We do not move to Stripe
Billing.

Concretely: Jonah rewrites the proration logic against a single ledger table
instead of recomputing from invoice history, the trueup job moves off cron onto
the job queue so a failure is visible, and we add a reconciliation report Ade
can read on the first of the month. Stripe keeps doing what it is good at,
which is taking the money. Everything about what to charge stays with us.

Target: end of Q2.

## Why

Three reasons, in the order they mattered in the room.

**Our billing model does not fit a subscription product cleanly.** A Portside
account has a plan fee, an included shipment allowance, and an overage that is
only known after the month closes. Eleven of our accounts have a negotiated
allowance that is not the plan default. Six have an annual commitment paid
monthly, which means the plan fee and the commitment drift apart whenever
somebody adds seats. Ade priced out expressing that as a subscription with a
metered component and came back with a shape that needed two subscriptions per
customer and a manual adjustment every month. That is not obviously better than
what we have.

**Mid cycle plan changes have rules that are ours.** When a customer upgrades on
the 14th we do not prorate the shipment allowance. They get the whole new
allowance for the month. Elena sells it that way and has sold it that way for
four years. Any billing platform we adopt has to be talked into that, and the
talking usually ends in a webhook and a manual credit.

**Jonah knows this code and is not going anywhere.** He wrote it, he is on the
billing team, and a rewrite he owns will take five or six weeks. A migration to
a different platform is a quarter of work plus a data migration for 214 live
accounts, and at the end of it we still write the trueup ourselves because the
shipment count comes from our database.

## What we considered and did not choose

**Move to Stripe Billing.** Rejected for the reasons above. The honest summary
is that the negotiated allowances and the mid cycle rule are the blockers, not
the platform.

**Buy a billing vendor.** Ade got two quotes. Both were more than we spend on
all our infrastructure. Not now.

**Leave it alone and fix bugs as they come.** This is what we have been doing
since January. Three of the last six support escalations that reached
engineering were billing. Doing nothing is a decision to keep paying that.

## Risks we are accepting

- The proration rewrite touches money. If we get it wrong, customers see it on
  an invoice before we do. Ade will hand check the first two billing runs after
  the change.
- Jonah is the only person who has read this code end to end. Priya will pair
  with him on the ledger table so that is no longer true.
- If our billing model changes shape, for example if we ever sell usage only,
  this decision gets revisited. We think that is a year away at least.

## Review

Revisit in June, or sooner if the proration rewrite runs past the end of Q2.
