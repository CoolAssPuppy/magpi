# Budget review, second half of 2026

Owner: Ade Fashola, with Diane Ockley
Date: 12 June 2026
Status: agreed. Reviewed monthly on the first working day
Circulation: leadership

This covers what we spend between 1 July and 31 December on infrastructure,
tools, the office, and the incremental cost of the hiring plan. It does not
cover existing payroll, which is set in the compensation cycle in July and is
not a thing we review in June, and it does not cover revenue, which is in the
board pack.

A note on currency, because it catches people every time. We invoice in dollars
and we pay almost everything in pounds. Every figure here is in pounds at the
planning rate, which I hold flat for the half and reconcile in January. When the
rate moves against us it looks like infrastructure getting more expensive, and I
have had that conversation four times.

## Infrastructure

Monthly, current run rate, and the H2 total at that rate.

| Line | Monthly | H2 |
| ---- | ------- | -- |
| Managed Postgres: primary, replica, backups | £4,120 | £24,720 |
| Application hosting and workers | £2,880 | £17,280 |
| Object storage and egress, mostly attachments | £1,940 | £11,640 |
| Email provider, inbound and outbound | £1,310 | £7,860 |
| Metrics and logs | £780 | £4,680 |
| Continuous integration | £410 | £2,460 |
| Error tracker | £340 | £2,040 |
| Feed ingress and SFTP | £220 | £1,320 |
| Pager | £190 | £1,140 |
| **Total** | **£12,190** | **£73,140** |

Two things I want visible rather than buried.

**Object storage keeps climbing.** Up about nine percent a quarter, and it is
the only line that does that, because we never delete an attachment and our
customers photograph everything. Nobody has asked me to do anything about it and
I am not asking either. I am putting it here so that when it is the second
largest line in two years, this page shows we knew.

**Frankfurt is a second region and a second bill.** Once live it adds roughly
£3,800 a month. I have budgeted two months of that in H2. If it moves again,
that is £7,600 that does not get spent and I will not be surprised.

## Software and tools

£3,450 a month at 31 people, £4,050 once the hiring plan is in. Notion, Slack,
Linear, Google Workspace, 1Password, Figma, the accounting package, payroll. H2
total £22,500.

Most of these are priced per person, which means the hiring plan costs more than
the hiring plan says it does, in about six places, in amounts too small for
anybody to notice. That is why this line has its own heading.

## Office and everything else

| Line | H2 |
| ---- | -- |
| Manchester office, rent and services | £41,400 |
| Travel, mostly Elena and the two customer visits in October | £9,800 |
| Accounting, legal, insurance | £14,600 |
| Recruitment agency fee, infrastructure role only | £13,500 |
| Equipment for five new starters | £9,250 |
| **Total** | **£88,550** |

The agency fee is the line Diane will look at twice. We have tried that role on
our own twice and got nowhere.

## Incremental people cost

Existing payroll is not reviewed here. The two payroll numbers that belong in an
H2 budget are the ones that are new.

| Item | H2 |
| ---- | -- |
| Five hires, at the start dates in the hiring plan, fully loaded | £96,000 |
| Effect of the September compensation cycle, four months | £17,300 |
| **Total** | **£113,300** |

The £96,000 looks small and is not. In a full year those five roles are roughly
£330,000, and they arrive between September and January, so H2 sees less than a
third of it. We decide against the £330,000.

## The two billing vendor quotes from March

Both rejected. I am not putting the figures in here and I want the reason on the
record rather than assumed. Both quotes came under a confidentiality term, both
vendors are still in the market and might be the right answer in two years, and
a leadership page with a named vendor and a number on it ends up in a
negotiation it was not written for.

The shape is what mattered in the room in March. Both came in above what we
spend on our entire infrastructure. Both priced on a percentage of billed volume
rather than a flat fee, which means the better we do the more it costs, and
neither would take the mid cycle allowance rule without custom work quoted
separately.

The June reversal moves plan fees onto Stripe subscriptions, which is a
different decision from buying a billing platform, and nothing about it reopens
these two.

## What the reversal costs us in engineering time

Diane asked for this specifically and it is the number I am least confident in,
so treat it as an estimate with a name on it rather than an accounting figure.
I am using £1,450 per engineer week fully loaded.

**Written off.** Roughly five engineer weeks, about £7,300. Three of Jonah's
nine went into the ledger design and the start of the proration rewrite, which
is being deleted. One of Priya's went into pairing on the ledger table. The rest
of Jonah's nine were BIL-198, BIL-201 and BIL-204, live bugs that would have
been fixed under either decision.

**Still to spend.** The migration itself, through Q3. Priya for most of a
quarter, a second engineer for six weeks once the billing hire starts, and my
own time in the dual run and the cutover. Seventeen to nineteen engineer weeks,
£25,000 to £27,500.

**What we get back.** A day and a half of my month, every month, which I spend
hand checking a run. Eighteen days a year. And the escalation rate: three of the
last six support escalations that reached engineering were billing, and if that
halves it is worth more than the eighteen days.

There is a fee on the subscription volume in the Stripe order form. It is in my
model and not on this page, because it is a rate under a commercial agreement.
It does not change the conclusion.

Net position: reversing in June rather than in March cost us about £7,300 and
three months. That is the price of finding out, and I would rather pay it than
have paid a quarter of Priya's time building the thing we were about to delete.

## Contingency

Five percent of the non payroll H2 budget, held back and not allocated. £9,200.

What it is for: an incident, a customer situation needing a credit larger than I
can approve alone, and the October billing cutover going somewhere nobody
predicted.

The rule. I release up to £2,000 on my own and tell Diane afterwards. Anything
larger is Diane before, not after. Unspent contingency does not roll into
January and does not become a reason to buy something in December.

## What I am watching

1. The object storage line.
2. Whether the five hires land on their start dates. Two of them slipping a
   month is £16,000 back and a plan that stops meaning anything.
3. The October billing run. First one on the new platform, first one carrying a
   price change, hand checked before invoices send. Not a budget item. It is the
   risk I would name if somebody woke me up and asked.
