# MOB-30 Offline drafts in the mobile app

Team: Mobile
Status: Backlog
Priority: Medium
Assignee: unassigned
Labels: mobile, deferred, needs-design
Created: 2026-07-20
Estimate: 4 to 6 weeks
Cycle: none

## Description

Let somebody write a reply on the phone with no signal, and have it sent when the
signal comes back.

Cut from the July release. Cut again from the September release. Written up here
on 20 July, after the fact, because the reasoning was living in a scope document
and in two people's memory and I have now answered the same question three times.

The feature is not the hard part. Keeping text on the phone is a day of work.
Everything below is about what happens when the draft comes back.

## Why this is not a normal sync problem

A Portside thread is not a document with one author. It is a shipment, and it
keeps moving while the phone is offline. The shipper's EDI feed posts a status
change. The carrier emails a revised rate. Somebody at the brokerage marks the
load closed. The draft written in a lorry park at 07:10 arrives at 11:40 and
attaches to a thread that has moved without it.

Underneath all of it: our replies go out as email, and email send is one way and
cannot be recalled. A conflict model that occasionally sends the wrong thing is
an annoyance in a document editor and is not acceptable here, because the wrong
thing is already in a carrier's inbox and the customer finds out when the carrier
replies to it.

That fact is why none of the three models below was picked.

## The three models

**1. Post it anyway, timestamped when written.** The draft sends on reconnect
with the time it was composed attached. Simple to build, one flag on the message
row, no new interface.

Rejected because a note reading "loading now, two pallets short" arrives forty
minutes after the load was marked delivered. The recipient reads it as current.
Hal's objection when we walked it through in June was that support gets the
ticket, and the ticket is a customer asking why Portside sent an email they did
not send.

**2. Hold it and ask on reconnect.** The draft waits. The app shows a banner and
the person reviews each held draft before it goes.

Rejected on who it fails. This feature exists for drivers and yard staff, and the
queue of review questions arrives when the phone reconnects, which is when they
are driving. A driver who wrote something important at seven finds it unsent at
eleven, which is the failure we would be building deliberately.

**3. Pin the draft to the message it was replying to.** The reply carries the
message it answers, so a reader can see what it was written against regardless of
what arrived since.

Not rejected. This is the right model. It needs a reply model that does not exist
on web either, which means it is not a mobile feature, it is a threading feature
with a mobile client on top of it.

## What this needs first

A reply model, on web. A real offline store on the phone rather than the cache we
have. A send queue with a state a person can see. Design for what a held draft
looks like in the list and in the thread.

Four to six weeks once those are settled, and the last two are the ones nobody
estimates correctly.

## Comments

**Sofia Berg, 20 July**

Filed so the June reasoning stops being an oral tradition. I cut this twice and I
will defend both cuts. Parked, not rejected. It is the first thing I would put in
a third mobile release.

**Hal Winters, 11 August**

Reopening in the sense of asking for it to stay looked at rather than asking for
a date.

Twenty three tickets since the app went out where somebody typed a reply, lost
signal and lost the reply. Nine are the same four accounts, and in all four the
person holding the phone is a driver or a yard person rather than a dispatcher at
a desk. A dispatcher losing a draft is annoying. A driver at a dock with one bar
losing the note about the damaged pallet is the thing we sold them the app for.

One of those four called it the app that only works in the office.

**Ruth Adeyemi, 11 August**

Putting the August version in here as a comment rather than a new issue, per
Sofia.

The draft should never silently become a message. It stays a draft with a state
on it, and the state is visible. Written offline at 14:02, sent at 15:40, shown
in the thread in its place with both times on it. The person reading it can see
it was composed before the load was closed and decide what that means.

The mistake in models one and two is that both try to produce the correct outcome
automatically, and the correct outcome depends on what happened to the freight,
which we cannot see. Show the timing and let the human read it. Smaller than
model three and honest about what we know.

It still needs a design for what a held draft looks like in the list.

**Sofia Berg, 11 August**

Better than anything in the June document and I want that said. Still not in the
September release, which is push reliability and camera roll upload, both
committed.

**Hal Winters, 11 August**

I am not asking for September. I am asking for this to not be a thing we decided
once and stopped looking at.
