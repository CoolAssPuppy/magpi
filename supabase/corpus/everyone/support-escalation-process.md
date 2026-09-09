# Support escalation process

Owner: Hal Winters
Last edited: 30 March 2026
Status: in force. This version replaces the one from October.
Audience: support, engineering on call, anyone who talks to a customer

This page says when we wake an engineer up, who we wake, and what we are allowed
to tell a customer while we do it. Rosa and I wrote it after a fortnight in
January where we escalated eleven things and four of them turned out to be
working correctly.

Support triages first. Always. An alert or a customer email reaches us before it
reaches engineering, and deciding whether it goes further is our job and not the
customer's.

## Severity levels

| Level | Definition | Who gets paged | Response time |
| ----- | ---------- | -------------- | ------------- |
| S1 | Portside is down, nobody can log in, or a customer can see data that is visibly wrong or is not theirs | On call engineer, immediately, any hour. Marcus told, not asked | 15 minutes |
| S2 | A core workflow is broken for one or more accounts and there is no workaround | On call engineer during working hours. Ticket to the owning team the same day | 1 hour |
| S3 | Something is broken and there is a workaround the customer can live with | Nobody paged. Linear issue on the owning team | Same working day |
| S4 | Annoyance, cosmetic problem, feature request | Nobody. Linear issue, reviewed weekly | Acknowledge to the customer within a day |

Core workflow means: sending or receiving a message in a thread, the EDI feed
posting status events, uploading or opening an attachment, logging in, search
returning anything at all.

Two judgement calls that come up often. A single customer who cannot work is an
S2 even if the rest of the world is fine. And an S3 that has been open for three
weeks becomes an S2, because the workaround stops being a workaround somewhere
around the second week.

If you are not sure whether it is S1 or S2, it is S1. I have never been annoyed
at somebody for over calling it and I have been annoyed the other way.

## Who gets paged

The on call engineer, through the pager, and only through the pager. Do not
message an engineer directly because you know they are good at this and you know
they are awake. That is how we ended up with three people who get every
escalation and twelve who get none.

For an S1, post in `#support` and `#eng` at the same time as you page, with the
account name, what is broken and the time it started. Keep updating the same
thread. The thread is the record.

If the on call engineer has not acknowledged in fifteen minutes, page the
secondary. If the secondary has not acknowledged in ten more, ring Marcus. His
number is in the rota page and he has said, in writing, that he would rather be
rung.

## Billing escalations go to Ade first

Any ticket about an invoice, a charge, a proration, a plan change or the month
end trueup goes to Ade Fashola before it goes to engineering. No exceptions and no
severity level skips this.

The reason is arithmetic. Over the last two quarters, most billing tickets we
sent to engineering were the system doing exactly what it was designed to do on
an account whose setup nobody had explained to the customer. A negotiated
allowance, an annual commitment, a plan change mid month that does not prorate the
shipment allowance. Ade can read the account and answer in twenty minutes.

What happens: you send Ade the account name, the invoice, and the customer's
sentence about what they expected. Ade either explains it, in which case you
explain it to the customer and close the ticket, or Ade says the number is wrong.
If Ade says the number is wrong it becomes an S2 and goes to the billing team
with Ade's working attached, and Ade stays on the thread.

If Portside has charged a customer money it should not have charged, that is an
S1 and it still goes through Ade, at the same time as the page rather than
before it.

## What we may and may not promise

**May promise:**

- That we have reproduced it, if we have.
- The issue number, and that we will tell them when it changes state.
- A named time when we will come back to them, even if the answer at that time
  is "still working on it". Then keep it.
- That we have escalated it and to whom, by role.
- A workaround, if we have tested the workaround ourselves.

**May not promise:**

- A fix date. Not a week, not a quarter, not "the next release". Engineering does
  not give us dates and we do not invent them.
- A refund or a credit. Ade approves those. You may say you have asked.
- Anything about pricing, including the direction of a change. There is a page
  about this from Elena. Read it. The short version is that you say pricing is
  under review and you send Elena the account name.
- That a feature is coming. "It is on our list" is a promise to a customer even
  when it is not meant as one.
- Anything about another customer, including that they exist.

If a customer pushes hard for a date, the honest answer is that we do not give
dates because a date we miss costs them more than not having one, and that you
will come back to them on Thursday either way.

## Template for handing a ticket to engineering

Paste this into the Linear issue. An issue without it goes back to support and
that is not a punishment, it is that the engineer cannot start.

```
Account:              (name, plan, seat count, anything unusual about the setup)
Reported by:          (person's name and role at the customer)
Severity:             S1 / S2 / S3 / S4, and why
Started:              (time and date the customer first saw it)
Still happening:      yes / no / intermittent
What they did:        (steps, in the customer's words if we have them)
What they expected:
What happened:
Reproduced by us:     yes / no. If yes, on what account and what browser
Steps to reproduce:
Evidence:             (screenshots and files in Drive, link here, do not paste)
Ticket:               (support ticket number)
Customer waiting:     (who is waiting, how they want to hear back, and by when
                       we said we would come back to them)
```

The last line is the one people leave out and it is the one that matters at
17:30 on a Friday.

## After it is resolved

Support closes the loop with the customer, not engineering. The engineer tells us
it is fixed, we tell the customer, in our own words, in the thread they started.

For every S1, I write four paragraphs in `#support` the next working day: what
happened, who it affected, what we told people, and the one thing we would do
differently. Not a formal post mortem, engineering does those. Ours is about the
conversation with the customer.

Anything that reached S1 or S2 twice in a quarter gets raised by me at the leads
meeting with the ticket numbers.
