# Mobile app, first release scope

Owner: Sofia Berg
Last edited: 16 June 2026
Status: agreed. Build in progress. Ships July.
Linear: `MOB` project. Offline drafts are `MOB-30`.

This is what is in the first mobile release and what is not, and why the cuts
are the cuts. It is written after the fact in the sense that the team started
building three weeks ago, and I am writing it now because two people have asked
me the same question about offline drafts and both times I answered from memory.

## Why July

Because I said July out loud on the customer advisory call on 14 May, in front of
five customers, and Elena repeated it to Halvorsen Carriers the following week.

That is the whole reason. There is no engineering reason for July and no
commercial reason beyond the one I created. I would rather write that down than
have anyone believe there is a plan underneath it.

The consequence is that the date does not move and the scope does. Everything on
this page follows from that.

## What the first release is for

One person, at a small brokerage, away from their desk, who needs to know what has
happened on a load and to answer a carrier. That is it. Not dispatching, not
managing an account, not doing the day's work on a phone.

Owen Trask at Nine Mile described the two people at his company who are not at a
desk after four in the afternoon. Those two people are the release.

## In and out

| Feature | In or out | Note |
| ------- | --------- | ---- |
| Log in with the existing session | In | Same accounts, same permissions, no separate mobile login |
| Open a thread and read the full history | In | Messages, status events, notes, in one timeline |
| Reply to a thread by email | In | Online only. The reply sends or it visibly fails |
| Push notification on a followed thread | In | Best effort. See risks |
| Attach a photo taken with the camera | In | Take the photo inside the app and send it |
| Mark a thread read or unread | In | |
| Basic search by load number and carrier name | In | The same search the web client has, no better |
| Internal notes, read and write | In | |
| Offline drafts | **Out** | `MOB-30`. Reason below |
| Upload from the camera roll | Out | Second release. Camera only for now |
| Filters and saved views | Out | Not built on web yet |
| Admin, seats, billing screens | Out | Not on a phone, possibly not ever |
| EDI feed configuration | Out | Not on a phone, definitely not ever |
| Creating a new load | Out | Second release at the earliest |
| Offline reading of previously loaded threads | Out | The cache exists but we are not promising it works |

## Why offline drafts are cut

This is the decision people will ask about, so here is the actual reasoning
rather than "no time", although there is also no time.

The sync conflict model is not settled. A reply written offline is a reply to a
thread as it was when the phone last synced. By the time the phone reconnects,
which for the people we are building this for might be three hours later in a
lorry park, the thread has moved. Somebody at the office may have already
answered the carrier. The load may have been marked delivered. The rate may have
been renegotiated by phone.

We sketched two models and neither survived a conversation with Hal.

**Last write wins.** The draft sends when the phone reconnects. The person who
wrote it does not see what changed in the meantime, and neither does the carrier,
who gets an email that reads as a reply to a conversation that has moved on. Hal's
objection: support will get the ticket, and the ticket will be a customer asking
why Portside sent an email they did not send.

**Hold the draft and show a conflict.** The draft waits, the app shows a banner
asking the person to review it. Better, and it means a driver who wrote something
important at seven in the morning finds it unsent at eleven, which is the failure
we would be building on purpose.

Underneath both is the thing that makes this harder than a normal sync problem.
Our replies go out as email. Email send is one way and cannot be recalled. A
conflict model that occasionally sends the wrong thing is fine in a document
editor and not fine here.

Doing it properly means a real offline store, a merge model for threads, and a
send queue with a review step, plus the interface for all three. Four to six
weeks, and the last two of those weeks are the ones nobody estimates correctly.
That does not fit before July, and July does not move.

`MOB-30` is parked, not rejected. It is the first thing I would put in a third
release, and I would want the sync model designed before anybody opens an editor.

## What we tell support and customers

Support already know and Hal has written the line: the first release is for
reading and answering while you have signal. If you are somewhere without signal,
the app will tell you, and it will not pretend to have sent something it has not
sent.

The failure state matters more than the feature here. A reply that fails must
fail loudly, keep the text on screen, and let the person try again. If we get
that right, the missing feature is an inconvenience. If we get it wrong, we have
built the thing we cut, badly.

Nobody promises offline anything to a customer. Not on a call, not in a renewal.

## Risks I am carrying

- **Push reliability.** Tokens churn, especially on one platform, and we have not
  operated push at any volume. I expect this to be the first thing that breaks
  and the second release to be mostly about it.
- **The header on a narrow viewport.** Ruth has flagged that the thread header
  collapses awkwardly below 640px and that the controls that end up in the
  overflow menu are not obviously distinct from each other. Web team is aware.
  Not a blocker for July.
- **We are shipping search that we already know is bad**, on a smaller screen,
  where scrolling as a fallback is worse. The relevance work is a separate
  argument and it does not get solved by this release.
- **Nobody owns mobile after Ruth's leave starts in November.** Raised, not
  answered.

## Second release, provisionally

Push reliability, camera roll upload, and whatever the first two weeks of real
usage tells us. Targeting late September. Scope agreed nearer the time and not on
a customer call.
