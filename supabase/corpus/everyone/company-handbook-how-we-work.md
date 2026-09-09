# How we work at Alderwick

Owner: Marcus Ilic
Last edited: 20 January 2026
Audience: everyone, and particularly anyone in their first fortnight

Thirty one people, one product, an office in Manchester and about a third of us
somewhere else. That is small enough that most things get decided by two people
talking and large enough that the other twenty nine find out too late. This page
is the set of habits we use to close that gap. It is not a policy document. If
something here stops being true, edit it, and tell me you edited it.

## The week

| When | What | Who | Length |
| ---- | ---- | --- | ------ |
| Monday 09:30 | Leads meeting | Diane, Marcus, Sofia, Priya, Elena, Hal | 45 minutes |
| Wednesday 14:00 | Weekly product sync | Product, design, engineering leads, support | 45 minutes |
| Thursday, every other week | Cycle planning | Whichever team is starting a cycle | 1 hour |
| Last Thursday of the month | All hands | Everyone | 40 minutes |

Linear cycles are two weeks and start on a Monday. Nothing else is on the
calendar by default. If you want a recurring meeting you have to say who it is
for and what decision it produces, and you have to put an end date on it.

Meetings that have no notes did not happen. The person who called the meeting
writes the notes, in Notion, within a working day. Notes can be four bullets.

## Decisions get written down

The rule: if a decision affects more than one team, or costs more than a week to
reverse, it gets a decision record in Notion before anyone starts building.

A decision record has a status, a date, an owner, the names of the people who
were in the room, what we were deciding, what we decided, why, what we
considered and did not choose, the risks we are accepting, and a date to look at
it again. That is the whole template. Copy the last one and change the words.

Two things people get wrong. The first is writing the record after the work is
finished, which makes it a report. The second is leaving out the options we
rejected, which is the part anyone reading it in a year actually needs. Write
down the thing you argued against and why it lost.

You do not need a decision record to fix a bug, pick a library, or rename a
function.

## Which tool is for what

**Notion.** Plans, specifications, decision records, meeting notes, anything
somebody will read six months from now. The Everyone space is readable by
everyone here. Leadership has one private space and it contains compensation and
pricing work, which is the only material in the company that is genuinely
restricted.

**Linear.** Issues and only issues. If it has an assignee and a state, it belongs
in Linear. Prefixes are `BIL` for billing, `SRCH` for search, `INF` for
infrastructure, `WEB` for the web client, `MOB` for mobile and `EDI` for the
parsers. Do not put a plan in a Linear description and expect anyone to find it.

**Slack.** Arguments, questions, the thing you noticed at 16:40 on a Friday.
Slack is where we disagree, and that is a use, not a failure. What Slack is not
is a record. When a Slack argument reaches an answer, somebody writes the answer
in Notion or Linear and posts the link back in the channel. The person who won
the argument does the writing.

**Google Drive.** Anything that came from outside the company. Contracts,
customer slide decks, PDFs, call transcripts, the spreadsheet a customer emailed
us. Do not retype those into Notion. Link to the file.

## On call

One engineer is on call per week. The rota is in Notion and runs six weeks
ahead, so you can swap without asking permission, as long as you swap with
somebody and update the page.

Support triages first. An alert or a customer report reaches Hal's team before
it reaches you, and they decide whether it is worth waking anyone. The severity
levels and the paging rules are Hal's to define and they live in the support
space. Read them in your first week.

What we expect of the person on call: acknowledge inside fifteen minutes during
working hours and inside thirty out of hours, get the customer back to working,
and write what happened. What we do not expect: a fix at 03:00. Stabilise, sleep,
fix it properly on Tuesday.

If you were paged out of hours, take the morning. Tell your lead you are taking
it, do not ask.

## Remote and the office

Core hours are 10:00 to 16:00 UK time. Outside those, work when you like.

The office is in Manchester and roughly two thirds of the company is near it.
Nobody is required to be in on a given day. What we do ask is that a meeting with
one remote person in it is run as if everyone is remote, which means everybody
joins from their own laptop rather than three people sharing a room camera and
one person watching the back of their heads.

Two company weeks a year, both in Manchester, both paid for. Attendance is
expected unless you have a reason.

Cameras optional. Nobody has ever complained about a black square.

## What a new joiner reads first

In this order, and it takes about two hours.

1. This page.
2. The Portside product overview in the Everyone space. What we sell, who buys
   it, what it deliberately does not do.
3. The current quarter's plan. It says what is happening and what is not.
4. The last three decision records, whatever they are. They tell you more about
   how the company thinks than anything I could write here.
5. Your team's onboarding checklist. Engineering has one, owned by Priya.

Then spend two hours in the support queue with Hal, whatever your job is.
Designers, salespeople and engineers all do this. It is the fastest way to learn
what Portside is actually used for.

## Things we are bad at

Written down here so nobody has to discover them.

- We start more work than we finish. I have asked for fewer things in flight for
  three quarters running and I am asking again.
- Decisions made in a leads meeting take too long to reach the people doing the
  work. The fix is the notes rule above and we are not good at it yet.
- We under communicate dates to customers and then over correct.
