# #product, 12 May 2026

Thread started by Hal Winters at 10:04.

**Hal Winters** (10:04)
I pulled every ticket from the first week of May that mentions finding a thread.
Sixty one of them. I read all sixty one because I wanted to stop guessing.

**Hal Winters** (10:05)
Forty four of those people knew exactly which thread they wanted. They had the
load number, or the carrier name, or they knew it was the one from the Tuesday
where the driver sent four photos. They were not browsing. They were hunting for
one specific thing and they could not get the list down to it.

**Hal Winters** (10:06)
Eleven were people who typed a word and got nothing back and the word was in the
thread. Actually in it. I checked six of those by hand.

The other six were people who wanted something we do not have, like searching
inside a PDF attachment.

**Nadia Osei** (10:19)
The eleven are the interesting number and I want to be careful about how it gets
read. Those are not ranking misses. Those are the index not containing what the
customer thinks it contains. We tokenise on whitespace and we drop anything under
three characters, so a load reference like AB7 is gone before it is ever stored.
Nothing downstream can fix that. You cannot rank a document that was never
written.

**Nadia Osei** (10:21)
And the reason I keep coming back to replacing the whole thing rather than
patching is that every fix we have shipped in the last year has been a rule
bolted onto a tokeniser that was written for English prose. Freight references
are not English prose.

**Sofia Berg** (10:44)
Hal, your own numbers say forty four and eleven. Forty four is the bigger pile
and it is the cheaper one. Those people are not failing at search. They are
failing at narrowing. Give them a carrier filter, a date range, a status filter,
and let them save the combination they use every morning, and most of that
forty four never types into the box at all.

**Sofia Berg** (10:45)
Filters are six weeks. The search rewrite is a quarter and it touches ingestion,
which means it touches the EDI feeds, which means Kenji.

**Nadia Osei** (10:52)
Six weeks of filters that sit on top of a list we are still building from the
same broken index.

**Sofia Berg** (10:53)
The list comes from the database, not the index. Filters do not go through search
at all.

**Nadia Osei** (10:55)
For the fields we have structured, yes. Carrier, date, status. Fine. And when
someone wants the thread where the shipper mentioned a lumper fee, they are back
in the box.

**Hal Winters** (11:20)
Both of those help me. I am not going to pretend one of them does not.

If you are asking which one takes tickets off me faster it is filters, and I say
that knowing it is the answer Sofia wants.

**Marcus Ilic** (13:38)
Late. Reading this as: the fuzzy search thing is real but it is not the thing most
of the sixty one people hit. Is that fair.

**Nadia Osei** (13:52)
It is fair for May. It will not be fair forever. Accounts get older and the index
gets worse in a way filters do not help with, because the threads people cannot
find are the ones from eight months ago.

**Sofia Berg** (13:55)
Which is an argument for doing it, just not for doing it first.

**Nadia Osei** (13:57)
It is an argument for doing it before the quarter where it is on fire.

**Hal Winters** (14:30)
Do you want the sixty one categorised into a doc or is the summary enough

**Sofia Berg** (14:41)
Doc please. Split out the eleven especially, I want to look at what they typed.
