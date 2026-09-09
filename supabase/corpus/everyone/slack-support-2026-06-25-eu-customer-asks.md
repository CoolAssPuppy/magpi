# #support, 25 June 2026

Thread started by Rosa Delgado at 08:51.

**Rosa Delgado** (08:51)
Bergstrom Logistik again. Third time this month. Their ops manager wants to know
when the data moves to Europe and she is now asking in writing rather than on a
call, which I think means somebody above her asked her to get it in writing.

**Rosa Delgado** (08:52)
I have been saying "later this year" and she has stopped accepting that.

**Hal Winters** (09:04)
Marchetti Freight asked me the same thing on Tuesday. Different flavour. Theirs
is not a procurement question, theirs is a customer of theirs asking them, so
they want something they can forward.

**Hal Winters** (09:05)
I did not send anything. I said I would come back to them.

**Rosa Delgado** (09:07)
good call, I nearly sent the Q2 slide

**Hal Winters** (09:08)
Please do not send the Q2 slide. The Q2 slide has a quarter on it that we are not
going to hit.

**Elena Vargas** (10:12)
Both of those accounts are mine and I have already spoken to both. Here is what
they have been told, word for word as near as I can remember it, so we are all
saying the same thing.

**Elena Vargas** (10:13)
Bergstrom: the European deployment has moved out of this quarter, it is going to
happen, and I will give them a date when engineering gives me one I believe. Her
exact response was that she would rather have a late date than a wrong date, and
I want everyone to notice how rare and how useful that is.

**Elena Vargas** (10:14)
Marchetti: same, plus I offered them the data processing addendum and the
subprocessor list, which is what their customer is actually asking about even if
nobody has said so. That went out on Monday.

**Elena Vargas** (10:15)
So: nobody quotes a quarter, nobody quotes a month, nobody forwards a slide.
"Moved out of this quarter, we will write to you with a date." If they push, send
them to me.

**Rosa Delgado** (10:22)
can I say why

**Elena Vargas** (10:24)
You can say it is blocked on infrastructure work that has to land first. Kenji
can say it better than I can.

**Kenji Mori** (11:47)
I can say it plainly. The audit log writer assumes there is one primary database
and it has assumed that since 2019. Everything that writes an audit event calls
into it and it writes into a single place with a single sequence.

**Kenji Mori** (11:48)
If I stand up Frankfurt without fixing that, the European customers' audit events
go back across to the primary in the UK, which is exactly the thing they are
asking us to stop doing, and we would be shipping a region that does not do what
the region is for.

**Kenji Mori** (11:50)
So the writer gets rewritten first. That is the whole reason for the slip. It is
not procurement, it is not the hosting provider, it is one file that four hundred
call sites depend on.

**Kenji Mori** (11:51)
The rewrite has an owner and a target. Frankfurt is after it. I am not putting a
date in this channel because the last time a date left this channel it came back
to me from a customer.

**Hal Winters** (11:58)
That is a good explanation and I would like to use most of it.

**Kenji Mori** (12:02)
Use everything up to the word "slip" and stop there.

**Hal Winters** (12:03)
Understood.

**Rosa Delgado** (13:19)
one more, Bergstrom asked whether they can be first when it does open

**Elena Vargas** (13:21)
Yes. They asked first, they get migrated first, and I have already told her that.
It is the only thing I have been able to give her.

**Rosa Delgado** (13:22)
noted, updating the macro
