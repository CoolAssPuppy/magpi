# Q3 2026 plan

Owner: Sofia Berg
Last edited: 29 June 2026
Status: agreed at the leads meeting on 26 June

This is what engineering, product and design are doing between 1 July and 30
September, and the dates we are holding ourselves to. Anything not on this list
is not happening this quarter. Marcus has asked three quarters running for
fewer things in flight and this is the quarter we try it.

## The four things

### 1. Billing migration

Move plan fees and seat counts onto Stripe subscriptions. Keep the month end
trueup as ours. Delete the proration logic and the ledger.

- Epic: `BIL-241`
- Owner: Priya Raman
- Work starts the week of 13 July, after Jonah's handover is written
- First dual run against production data: 14 September
- Cutover: the October billing run, 1 October

This is the biggest piece of work in the quarter and it is the one that cannot
slip, because it is tied to a billing run and billing runs do not move.
Everything else on this page gives way to it.

Jonah Kestrel moves to the search team on 1 July. His last billing task is the
handover document.

### 2. Search: filters and saved views

Sofia and Nadia have been arguing about search since April and the leads
meeting settled it for this quarter only. We build filters and saved views. We
do not replace the index.

- `SRCH-88`, the index replacement, moves to the Q4 shortlist
- `SRCH-95` and `SRCH-101` ship in Q3
- Owner: Nadia Osei, with Jonah from July
- Target: 28 August

Hal's ticket sample from May said most people who cannot find a thread know
which thread they want. Filters are the cheaper answer to that. Nadia has said
on the record that she thinks this buys us two quarters and no more, and that
is a reasonable thing to have said.

### 3. Mobile, second release

The July release went out without offline drafts. Second release adds push
reliability work and attachment upload from the camera roll.

- `MOB-34`, push token churn
- `WEB-161` if there is room, which there probably is not
- Owner: Ruth Adeyemi and Sofia Berg
- Target: 22 September

Offline drafts are not in this release either. See `MOB-30`.

### 4. Audit log writer

Rewrite the audit log writer so it does not assume a single primary database.

- `INF-318`
- Owner: Kenji Mori
- Target: 9 October

This one crosses the quarter boundary on purpose.

## What moved out of Q3

**The EU region.** Frankfurt moves to Q4. Target date is 2 November 2026. The
detail is in `INF-311` and Kenji has written it up there rather than here.
Elena has told both accounts that asked. Nobody is happy about it and it is
still the right call.

**The index replacement.** `SRCH-88`, see above. Q4 shortlist, not committed.

**Retiring the legacy 214 parser.** The switch off date is 1 December 2026.
Reasoning and the customer list are in `EDI-81`. It is not Q3 work but the
notice has to go out during Q3, so it stays on this page as a reminder.

**Attachment previews.** `WEB-161`. Nice to have. Will not happen.

## Pricing

There is a pricing change landing in October. It is a leadership item and the
numbers are not agreed yet. Do not build anything that assumes a price, and if
a customer asks, point them at Elena.

The one engineering dependency: whatever the new overage rate is, the trueup
job has to be able to apply a different rate to different accounts from a given
date, because the six annual commitment accounts hold their current rate until
renewal. Priya has that in scope for `BIL-241`.

## Dates in one place

| Date        | What                                     |
| ----------- | ---------------------------------------- |
| 1 July      | Jonah moves to search                     |
| 13 July     | Billing migration work starts             |
| 28 August   | Filters and saved views ship              |
| 14 September| First billing dual run                    |
| 22 September| Mobile second release                     |
| 1 October   | Billing cutover                           |
| 9 October   | Audit log writer done                     |
| 2 November  | EU region                                 |
| 1 December  | Legacy 214 parser switched off            |

## Things we did not decide

- Whether the search index replacement is a Q4 commitment or a Q4 hope
- Who owns mobile after Ruth's parental leave starts in November
- Whether we are doing anything at all about the API rate limits Rosa keeps
  raising, which
