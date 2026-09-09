# #product, 11 August 2026

Thread started by Hal Winters at 09:12.

**Hal Winters** (09:12)
Reopening offline drafts. I know it was decided. I am reopening it because the
tickets have changed shape since July and I think the decision was made against
a version of the problem that is not the one we have.

**Hal Winters** (09:13)
Twenty three tickets since the app went out where somebody typed a reply, lost
signal, and lost the reply. Nine of those are the same four accounts. All four
are accounts where the person using the app is a driver or a yard person, not a
dispatcher at a desk.

**Hal Winters** (09:14)
A dispatcher losing a draft is annoying. A driver at a dock with one bar losing
the note about the damaged pallet is the thing we sold them the app for.

**Rosa Delgado** (09:31)
one of those four called it "the app that only works in the office"

**Sofia Berg** (10:08)
I cut it and I will defend the cut, and then I will say the part where I agree
with you.

The reason it is hard is not storage. Keeping text on the phone is a day. The
reason it is hard is what happens when the draft comes back.

**Sofia Berg** (10:10)
A Portside thread is not a document with one author. It is a shipment. While the
driver's phone is offline the thread keeps moving: the shipper's EDI feed posts a
status change, the carrier emails a revised rate, somebody at the brokerage marks
it closed. The draft reappears an hour later and attaches to a thread that has
moved on without it.

**Sofia Berg** (10:11)
So for every draft we have to answer whether it is still valid, and we cannot
know, because the meaning of the reply depends on what happened since.

**Sofia Berg** (10:13)
The three models we looked at in June, all in `MOB-30`:

Post it anyway, timestamped when written. Simple. Also means a note saying
"loading now" arrives after the shipment was closed.

Hold it and ask on reconnect. Safe. Also a queue of questions for someone driving.

Pin it to the message it was replying to. Best answer, and it needs a reply model
we do not have on web either.

**Ruth Adeyemi** (10:47)
The third one is right and I want to argue it is smaller than it sounds if we
scope it to the phone.

**Ruth Adeyemi** (10:49)
My position is that the draft should never silently become a message. It stays a
draft with a state on it. Written offline at 14:02, sent at 15:40, and the thread
shows it in place with that on it. The person reading it can see it was written
before the closure and decide what it means. We do not have to decide.

**Ruth Adeyemi** (10:50)
We are trying to build a rule that produces the correct outcome and the correct
outcome depends on freight, which we cannot see. Show the timing and let the
human read it.

**Sofia Berg** (11:02)
That is genuinely better than what was in the doc in June and I want to say so.

It is still not in the September release. That one is push reliability and camera
roll upload and both of those are committed.

**Hal Winters** (11:05)
I am not asking for September. I am asking for it to not be a thing we decided
once and stopped looking at.

**Sofia Berg** (11:09)
Then say it that way and I will not argue. Ruth, put the timestamp version into
`MOB-30` as a comment, not a new issue. I want the June reasoning and the August
answer in the same place.

**Ruth Adeyemi** (11:12)
Will do. It also needs a design for what a held draft looks like in the list.

**Nadia Osei** (16:24)
Very late and not my area, but the pin to the message it was replying to is the
same shape as the thing we would need for threading in search results.

**Sofia Berg** (16:40)
Noted and parked, we are not doing both in one quarter.
