# Search index: how it works today

Owner: Nadia Osei
Date: 11 May 2026
Status: reference. Nothing on this page proposes anything

Sofia's page puts both cases for what we should do next. This page is the other
half of that: what the index actually is, in enough detail that somebody who has
not read the query can argue about it honestly. My opinions are in the last
section, where they are labelled.

## What is indexed

One row per thread. There is no per message document anywhere.

`threads.search_vector` is a `tsvector` column. It is built from four things:

| Source | Weight | Notes |
| ------ | ------ | ----- |
| Thread subject | A | The subject of the first inbound message, or what the broker typed |
| Reference number and load number | A | Concatenated, not tokenised specially |
| Message bodies, concatenated | B | Plain text extraction, all messages, oldest first |
| Account name and contact names on the thread | C | Denormalised at index time |

Weight D is unused. Somebody removed whatever was in it in 2024 and the array is
still four long.

Not indexed: attachment contents, status event text from the EDI feed, and
anything the user cannot see, because visibility is a filter applied after
ranking rather than part of the index.

## How a thread becomes a document

A trigger, `threads_search_vector_update`, fires after insert or update on
`messages`. It does not append. It rebuilds the entire vector for the thread
from scratch, every time, by selecting every message body on the thread,
concatenating them, and running `to_tsvector` over the result.

Two consequences, and the second is the important one.

First, a thread with two hundred messages rebuilds a two hundred message
document on the two hundred and first insert. On our busiest accounts the
trigger is a visible share of insert time and Kenji has asked about it twice.

Second, the part almost nobody knows. The concatenated body is truncated before
it reaches `to_tsvector`. There is a `left(body_concat, 100000)` in the trigger,
added in 2023 when a customer forwarded a mail archive into a thread and the
insert failed on the tsvector size limit. Messages are concatenated oldest
first, so on a long thread the oldest messages are indexed and the newest ones
fall off the end.

That is backwards from what anybody wants and it has been true for three years.
On the fourteen threads I sampled that exceeded the limit, the last four to
eleven months of the conversation were not indexed at all.

## Tokenisation

The text search configuration is the stock `english` one. Snowball stemmer,
English stop words, default parser.

What that means for the words our customers actually type:

- **Company names are not stemmed usefully.** Halvorsen and Halverson produce
  two different lexemes and neither finds the other. There is no fuzzy matching
  of any kind. `pg_trgm` is not installed on the primary.
- **No `unaccent`.** Bergström lowercases to `bergström` and does not match the
  account we spell Bergstrom. One extension and a reindex, and the reason it has
  not been done is that nobody owns it.
- **Load numbers get split.** The parser sees `PS-88421` as a hyphenated word
  and emits the whole token plus the two parts, so searching `88421` finds it.
  That is the one piece of accidental good behaviour in here. `PS 88421` with a
  space does not, because the phrase does not line up.
## Ranking, and why the title loses

The query ranks with `ts_rank(weights, search_vector, query)` and multiplies by a
recency term added in November, which divides by the age of `last_message_at` in
days. The weight array is `{0.1, 0.2, 0.4, 1.0}` for D, C, B, A, the Postgres
default, never changed, whatever people say about four people adjusting the
ranking. What the four adjusted was the recency term and which fields went into
which weight.

The mechanism people find surprising.

`ts_rank` is not a match or no match score. It accumulates across occurrences.
One occurrence at weight A contributes 1.0 and then the saturation curve
flattens, but twenty occurrences at weight B still add up to more. We pass no
normalisation flag, so document length is not divided out at all.

So a thread whose subject is "Marchetti Rotterdam" and whose body never mentions
Marchetti again scores lower on the query `marchetti` than a thread where the
word appears thirty one times across a long argument about a detention charge.

This is the complaint we get in the form "I searched for the exact name of the
thread and it was fourth". It was fourth because three longer threads mentioned
the word more times, and then the recency multiplier put an imprecise recent
thread above a precise old one on top of that.

## What would have to change

Four levers, in increasing order of cost. Not a plan.

**Pass a normalisation flag.** `ts_rank` takes an integer where bit 1 divides by
the logarithm of document length and bit 2 divides by the length itself. Setting
it makes the title win in exactly the case above. It is one argument, and it
also changes the order of every search result in the product on the day we ship
it, with no way to tell in advance whose search gets worse. It needs an
evaluation set and we do not have one.

**Fix the truncation direction.** Concatenate newest first, or index the newest
N messages plus the subject. Small change, real improvement, and it makes older
material less findable rather than more, which somebody other than me should
agree to.

**Install `unaccent` and `pg_trgm`.** Handles the diaeresis case outright and
gives us a similarity fallback for misspellings, at the cost of a trigram index
on a column that is already the largest thing on the thread table. Cheapest real
answer to the twenty two spelling tickets in Hal's sample.

**One document per message, with the thread as the unit of return.** The
structural change. Removes the rebuild on every insert, removes the truncation,
lets us weight recent messages without a global recency multiplier, and makes
attachment text an obvious thing to add later. It does not fit in the current
schema and it is most of what `SRCH-88` means.

## My opinion, labelled as such

The first three are patches on an index whose document model is wrong, and I
have watched us patch it four times. The truncation is the proof: a sensible fix
to a real failure in 2023, quietly making long threads unfindable ever since,
and I found it by reading the trigger in April rather than from any signal we
collect.

We collect no signal. We do not log which result was clicked, we do not log a
search that returned nothing, and we cannot tell you whether search got better
or worse in November. Whatever we do next, that is the part I would do first,
because it is the only thing on this page that makes the argument settleable
with evidence rather than by who is more insistent.
