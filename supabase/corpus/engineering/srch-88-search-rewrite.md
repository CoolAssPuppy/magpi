# SRCH-88 Replace the thread search index

Team: Search
Status: Backlog
Priority: Medium
Assignee: Nadia Osei
Labels: search, rewrite, deferred
Created: 2026-05-04
Estimate: 1 quarter
Cycle: none, moved to the Q4 shortlist
Related: SRCH-95, SRCH-101

## Description

Replace the Postgres full text index behind thread search with an index built for
what our customers type, which is company names, place names and load references.

What we have now. There is a `tsvector` column on `thread` called
`search_document`, maintained by the `thread_search_refresh` trigger on insert
and update. The trigger builds the vector from four sources: the thread subject,
the message bodies, the internal notes, and the carrier and shipper names copied
off the load. Attachment contents are not in it and never have been. Ranking is a
hand written `ts_rank_cd` expression in `search/rank.sql` with a weight array
that four people have edited since 2023.

## Why patching the ranking does not fix this

The problems are in tokenisation, and ranking runs after tokenisation. You cannot
rank a document that was never written.

**Minimum token length.** The trigger passes text through a cleanup function that
drops tokens shorter than four characters before the vector is built. It was
added in 2023 to stop the index filling with the words a rate confirmation email
signature is made of. A load reference like AB7 is gone before it is stored. So
is MC. So is any two letter state or country code in a lane description. Around a
fifth of what Hal's sample shows people typing is under four characters.

**The English stemmer.** We call `to_tsvector('english', ...)`. Halvorsen stems to
halvorsen and Halverson stems to halverson, and those are two different lexemes,
so the query misses. Bergström with the diaeresis and Bergstrom without it are
also two different lexemes. There is no fuzzy matching anywhere in the path and
adding `pg_trgm` on top gives us a second, differently wrong ranking to reconcile
with the first.

**Field weighting.** `setweight` is applied at A for subject and B for everything
else, and the `ts_rank_cd` weight array is `{0.1, 0.2, 0.4, 1.0}`. In November
somebody multiplied the whole score by a recency term to fix a complaint that
week. Nothing in that expression can be reasoned about. It has four inputs and
nobody can predict what changing one does, so nobody changes it, so it stays bad.
SRCH-95 is me moving one weight and being able to show the before and after,
which is about the limit of what this shape allows.

## What replacing it means

An analyzer chain we control: lowercase, ASCII folding so the diaeresis stops
mattering, an edge n-gram field for references, and a keyword field for exact
matches on load numbers and carrier codes. Subject, body, notes and party names
as separate fields with weights a person can read. Attachment text extracted at
ingest and indexed as its own field.

Cost, honestly rather than optimistically: a quarter. It touches the ingestion
path, which means it touches the EDI feeds, which means Kenji. There is a tail
after the quarter and I would rather write that down than pretend there is not.

## Comments

**Nadia Osei, 4 May**

Filed so the argument has an issue number instead of a Slack scroll.

**Sofia Berg, 27 June**

Leads meeting settled Q3 and this is not in it. Filters and saved views, SRCH-95
and SRCH-101, target 28 August. This moves to the Q4 shortlist, which is a
shortlist and not a commitment, and I am not going to pretend otherwise in a
Linear comment.

Reasoning is on the Q3 plan page. Short version: Q3 already contains the billing
migration, that cannot slip because it is tied to a billing run, and a quarter of
search work next to it is how both slip.

**Nadia Osei, 27 June**

Accepted, and I am not going to relitigate it every fortnight.

On the record so that it is on the record. Filters buy us two quarters and no
more. Filters are the right thing and I would build them in this order too if the
index were merely mediocre. The problem is who they leave out. The group filters
do not help is the group whose accounts are old, and every month there are more
old accounts. A brokerage in its first year has four hundred threads and
scrolling works. A brokerage in its third year has nine thousand and the thread
they want is from eighteen months ago and they type a load reference into a box
that threw that reference away at write time.

The two quarters are Q3 and Q4. In Q1 this is the thing on fire, and the version
of it that happens then is worse and more expensive.

**Nadia Osei, 30 June**

One correction to my own comment. I said filters do not help the old account
group. That is too strong. A date range filter helps somebody who knows the
month. It does not help somebody who knows the reference, which is the more
common case in Hal's sample.

**Sofia Berg, 1 July**

Both halves recorded. That is a real commitment and I would rather have it in
writing than have you agree with me in a meeting.
