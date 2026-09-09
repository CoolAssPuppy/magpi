# Search relevance review

Alderwick Systems Ltd. Confidential.
Search relevance review, 27 May 2026

[Page 1 of 11]

Search relevance review

Nadia Osei, staff engineer, search
27 May 2026

Follow up to the #product thread of 12 May. This is the technical half
of that argument. It is not a proposal and there is no ask on the last
slide.

Alderwick Systems Ltd. Confidential.
Search relevance review, 27 May 2026

[Page 2 of 11]

What the index does today

- One index. Every thread is one document.
- The document is: subject line, then every message body concatenated,
then attachment filenames. Nothing else.
- Tokeniser splits on whitespace and strips punctuation.
- Minimum token length is three characters. Anything shorter is
dropped at index time.
- Scoring is term frequency over the whole document with a length
normalisation.
- and
- No field weighting. This is slide 4.

Alderwick Systems Ltd. Confidential.
Search relevance review, 27 May 2026

[Page 3 of 11]

The tokeniser is the first problem

We wrote this for English prose in 2022 and freight references are not
English prose.

Dropped at index time AB7, C12, PO9, any two character carrier code
Split into pieces BOL-5093-A becomes bol 5093 a, then the a is dropped
Survives intact MARCHETTI, deadhead, detention
Case folded fine No complaints here

A customer who searches for AB7 gets zero results back, because the
token was never written at index time. Nothing downstream of the index
can repair that.

Alderwick Systems Ltd. Confidential.
Search relevance review, 27 May 2026

[Page 4 of 11]

Why title matches lose to body matches

Every thread is a single flat document. The subject line is
concatenated into the same text as the message bodies before scoring.
So a term in the subject is worth exactly as much as the same term
buried in the eleventh reply.

Now add length normalisation. A thread with four messages and a thread
with ninety messages are scored against their own length, which is
correct in general and wrong here, because our long threads are
long for a reason: they are the busy loads, and the busy loads are the
ones people go looking for.

Result: a thread titled "Marchetti 5093 detention" ranks below a
ninety message thread where somebody typed the word detention twice in
a row while complaining about it.

Alderwick Systems Ltd. Confidential.
Search relevance review, 27 May 2026

[Page 5 of 11]

Example one, ticket 4118

Customer typed: AB7

What they wanted: the thread for their own load reference AB7, from
February.

What happened: zero results. The customer sent a screenshot of the load
reference sitting in the subject line of the thread they could not
find.

Filters fix this? No. There is no structured field holding a customer's
own load reference. It lives in the subject line the dispatcher typed.

Alderwick Systems Ltd. Confidential.
Search relevance review, 27 May 2026

[Page 6 of 11]

Example two, ticket 4203

Customer typed: lumper fee

What they wanted: one thread from October where a shipper mentioned a
lumper fee in the middle of a long message.

What happened: 61 results. The right one was 34th. Every thread above
it was longer and mentioned fees more often.

Filters fix this? Partly. A date range would cut 61 down to maybe 9. It
would not move the right thread up the list, it would just make the
list short enough that the customer reads all of it.

Alderwick Systems Ltd. Confidential.
Search relevance review, 27 May 2026

[Page 7 of 11]

Example three, ticket 4266

Customer typed: halvorsen photos tuesday

What they wanted: the thread where the driver sent four photos at the
dock.

What happened: 8 results, none of them the right one. The word photos
does not appear anywhere in the thread. The attachment filenames were
IMG_0412.jpg and three like it.

Filters fix this? No, and neither does the index as designed. We do not
index attachment content and we do not have an attachment type facet.
This is a third thing, and it is the one Hal's sample counted as
"wanted something we do not have".

Alderwick Systems Ltd. Confidential.
Search relevance review, 27 May 2026

[Page 8 of 11]

What filters would fix

Genuinely fixed by filters and saved views:
- I know the carrier and roughly the week
- I want everything still open for this shipper
- I want the same list every morning without typing
- I want to narrow 200 results to 12 and read them

That is most of the forty four in Hal's sample. I am not arguing with
that number. It is a real number and filters are the cheaper answer to
it.

Alderwick Systems Ltd. Confidential.
Search relevance review, 27 May 2026

[Page 9 of 11]

What filters would not fix

- Short reference tokens. Nothing structured to filter on.
- Ranking inside a filtered list. A filter narrows the set. Ordering
inside the set is still the same scoring.
- Anything where the customer remembers a phrase and not a field.
- Threads older than about eight months, which is where the complaints
concentrate, because the older the account the longer its threads.

The second one matters more than it sounds. Filters push the problem
from "200 results, wrong order" to "12 results, wrong order". That is a
better afternoon for the customer and it is the same defect.

Alderwick Systems Ltd. Confidential.
Search relevance review, 27 May 2026

[Page 10 of 11]

Things we could do to the current index

Ranked by effort, not by how much I like them.

Field weighting Split subject into its own field, weight it up. Two weeks.
Min token length Drop to one character. Reindex everything. Index grows.
Reference pattern Detect load reference shapes and index them whole. Fragile.
Recency boost Cheap. Helps the wrong queries. People want old threads.

The honest note on all four: each one is a rule bolted onto a tokeniser
that was written for something else. We have shipped four of those in
the last year already.

Alderwick Systems Ltd. Confidential.
Search relevance review, 27 May 2026

[Page 11 of 11]

Where I have got to

Filters are the right thing to do next. I have said that in the thread
and I will say it here.

My position on the index has not changed and I want it written
somewhere that is not Slack: patching buys us two quarters and no more.
The threads people cannot find are the ones from eight months ago, and
every month we add a month.

`SRCH-88` is the index replacement. It is not a Q3 ask.

Alderwick Systems Ltd. Confidential.
Search relevance review, 27 May 2026
