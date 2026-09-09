# EDI-81 Retire the legacy 214 parser

Team: Integrations
Status: Todo
Priority: Medium
Assignee: Kenji Mori
Labels: edi, tech-debt, customer-notice-required
Created: 2026-08-03
Related: EDI-77, EDI-79

## Description

We run two parsers for EDI 214 shipment status messages. The current one was
written in 2024 and handles everything. The legacy one was written in 2021,
handles seven customers, and is kept alive because those seven send a variant
of the 214 that the current parser rejects: a segment order that was valid
under the older implementation guide their trading partners still use.

The legacy parser times out on two of the seven, which is `EDI-77`. Fixing the
timeout properly means rewriting the parser we are trying to delete.

Plan is to move all seven onto the current parser by adding a tolerant segment
order mode behind a per connection flag, then delete the legacy code path and
the cron that feeds it.

Engineering work is small. Two weeks, most of it test fixtures from real
message samples the seven customers have already sent us.

## Why we cannot do this sooner

Not an engineering constraint. A contractual one.

All seven of these accounts are on the older master services agreement, the one
Elena's team used before 2024. Clause 7.2 of that agreement requires ninety
days written notice before we change the format or the processing of any data
feed the customer sends us. Legal read it in July and the answer was that
switching parsers counts, because the tolerant mode changes which messages we
accept and which we reject.

Ninety days from the day the notice goes out. That is the whole constraint.

The second half of it is that we cannot send the notice yet. Two of the seven,
Marchetti Freight and Halvorsen Carriers, renew in the October window, and
leadership is sending a pricing note to every account in late September. Elena
was clear that a customer should not receive a price change and a "we are
changing how we process your data" letter in the same fortnight, because the
second one gets read as part of the first and turns a renewal conversation into
a negotiation.

So the sequence is: pricing note goes out, then a gap, then the parser notice,
then ninety days, then we switch.

The seven accounts:

| Account             | Sends variant | Times out | Renews  |
| ------------------- | ------------- | --------- | ------- |
| Marchetti Freight   | yes           | yes       | October |
| Halvorsen Carriers  | yes           | no        | October |
| Brody and Sons      | yes           | yes       | March   |
| Kestenbaum Transit  | yes           | no        | January |
| Nine Mile Haulage   | yes           | no        | June    |
| Port Ellery Group   | yes           | no        | April   |
| Rutherford Bulk     | yes           | no        | August  |

## Comments

**Kenji Mori, 3 August**

Filed so it stops living in my head. The switch off date is on the Q3 plan
page. I am not putting it here as well, because the last time we had a date in
two places one of them was wrong for six weeks.

**Elena Vargas, 4 August**

Thank you for writing the reason down. I have explained the ninety days three
times this month.

**Hal Winters, 6 August**

Support angle: when the notice goes out I will get seven tickets asking what it
means. Send me the draft and I will write one answer we all use.

**Kenji Mori, 6 August**

Will do.
