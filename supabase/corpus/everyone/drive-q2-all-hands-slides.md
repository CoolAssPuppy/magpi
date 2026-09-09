# Q2 all hands

Alderwick Systems Ltd.
Q2 all hands, 1 July 2026

--- Page 1 ---

Q2 all hands

1 July 2026
Diane Ockley

Manchester office and video. Deck exported for the eight people who
could not make it live.

Alderwick Systems Ltd.
Q2 all hands, 1 July 2026

--- Page 2 ---

Agenda

- What shipped
- Numbers
- The billing decision, and the second billing decision
- Q3
- What customers said
- Questions, and there will be time for them

Alderwick Systems Ltd.
Q2 all hands, 1 July 2026

--- Page 3 ---

What shipped in Q2

Thread merge Two threads for one shipment, joined. Ruth's design.
Attachment grid Photos from the dock, laid out. Support asked for two years.
Bulk status update Dispatchers select many, set one status.
EDI 204 tolerant mode Fewer rejected tenders. Kenji.
Invoice PDF redesign Ade stopped getting the "what is this line" email.
Saved recipients Small. Everybody who does quoting mentioned it.

Alderwick Systems Ltd.
Q2 all hands, 1 July 2026

--- Page 4 ---

What did not ship in Q2

- Offline drafts on mobile. Cut. This was Sofia's call and it was the
right one, and I want to say that in front of everybody because I know
support disagrees.
- The proration rewrite. More on this in four slides.
- Frankfurt. Moved to Q4.
- and

Alderwick Systems Ltd.
Q2 all hands, 1 July 2026

--- Page 5 ---

Numbers

We are 31 people. Nineteen in engineering, product and design. The rest
is sales, support, and the two people who hold up finance and
everything else between them.

Two joins in Q2, no leavers. About a third of us are remote and that has
not moved in a year.

214 live accounts. Most of our revenue is Standard accounts going over
on shipments, which has been true for four years and I no longer expect
it to change.

We have never raised more than a seed round. Somebody counted and I have
said this at eleven consecutive all hands. I am going to keep saying it.

Alderwick Systems Ltd.
Q2 all hands, 1 July 2026

--- Page 6 ---

Mobile

The app goes out this month.

Push, threads, attachments, status updates. Not offline drafts.

Ruth and Sofia have a second release scoped for September that does push
reliability and camera roll upload. Offline drafts are not in that one
either and I would rather say so now than have it discovered in
September.

Alderwick Systems Ltd.
Q2 all hands, 1 July 2026

--- Page 7 ---

The billing decision

In March we decided to keep our own billing service and rebuild it,
rather than move to Stripe Billing.

We had three reasons and they were good ones on the day:

- Our billing model has exceptions that do not fit a subscription
product cleanly
- The mid cycle upgrade rule is ours and we would have to teach any
platform to do it
- Jonah wrote the code, owns the code, and estimated five or six weeks

I signed that off. It is on the record with my name on it.

Alderwick Systems Ltd.
Q2 all hands, 1 July 2026

--- Page 8 ---

The second billing decision

In June we reversed it.

All three reasons had moved. The exception accounts turned out to be a
smaller share of the book than we wrote down, and a shrinking one. The
mid cycle rule turned out to be one rule that can be expressed as a one
off invoice item rather than a ledger. And Jonah moved to the search
team, which was a good move for Jonah and for search and which removed
the third reason entirely.

Nine weeks in, the five or six week rewrite had produced three bug
fixes and no rewrite.

We are moving plan fees and seat counts onto Stripe subscriptions. The
month end trueup stays ours, because the shipment count comes out of our
database and always will.

Alderwick Systems Ltd.
Q2 all hands, 1 July 2026

--- Page 9 ---

What I want you to take from that

March was a decision that stopped being true. What we got wrong was how
narrow the constraint was.

Seventeen accounts out of 214 drove a decision, and we did not ask hard
enough whether seventeen should.

Two things I would like us to keep:

- Marcus wrote the reversal up as a decision, not as an apology. Read
it. It is in the Everyone space.
- Nobody spent a week defending March. Priya took the list of three
reasons and went through them in order, in public, in about eight
minutes.

If you are ever sitting on a decision of mine that has stopped being
true, that is the eight minutes I want.

Alderwick Systems Ltd.
Q2 all hands, 1 July 2026

--- Page 10 ---

Q3, four things

1. Billing migration. Priya. Cutover is the October billing run.
2. Search filters and saved views. Nadia, with Jonah from today.
3. Mobile second release. Ruth and Sofia. September.
4. Audit log writer rewrite. Kenji. It crosses into October on purpose.

Four. That is the whole list.

Marcus has asked for fewer things in flight three quarters running.
This is the quarter he gets it, and the deal is that when something new
arrives, it displaces one of these four rather than joining them.

Alderwick Systems Ltd.
Q2 all hands, 1 July 2026

--- Page 11 ---

Also happening, not on the list of four

- Frankfurt is Q4. It slipped because the audit log writer assumes one
primary database, which is why item 4 exists. Elena has told both
accounts that asked.
- There is a pricing change coming in October. The numbers are not
agreed and they are not mine to hand out early. Elena has written a
page about what to say and I would like everyone to read it rather
than ask her in the kitchen.
- The old EDI 214 parser gets retired. Not Q3 work, but the customer
notice has to go out during Q3 and Kenji owns the sequencing.

Alderwick Systems Ltd.
Q2 all hands, 1 July 2026

--- Page 12 ---

What customers said in Q2

From Hal's inbox and Elena's calls. Lightly trimmed, otherwise
verbatim.

"The photo grid is the first thing you have shipped that my drivers
noticed." Dispatcher, Brody and Sons

"I found the thread in four seconds and then I sat there for a while
because I did not expect to." Operations manager, Port Ellery Group

"Invoice made sense this month. That is not a compliment, it is a
report." Ade forwarded this one and would not say who from

"I still cannot find anything from last year." Three separate accounts,
in three separate weeks

"Please stop moving the archive button." Dispatcher, Nine Mile Haulage

Alderwick Systems Ltd.
Q2 all hands, 1 July 2026

--- Page 13 ---

Questions

The floor, then the video call, then Slack for the ones we run out of
time for.

I will answer anything about billing. I will not answer anything about
the pricing numbers, and I would rather say that up front than dodge it
in the room.

Alderwick Systems Ltd.
Q2 all hands, 1 July 2026
