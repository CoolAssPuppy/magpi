# Search relevance work, 2026

Owner: Sofia Berg, with input from Nadia Osei
Last edited: 5 May 2026
Status: open. Nothing on this page is decided.

Nadia and I have been having the same argument since the first week of April,
mostly in `#product` and twice in a leads meeting, and neither of us has moved.
This page exists so that the argument is written down somewhere other than a
Slack scroll, with both cases put fairly, before it goes to the leads meeting in
June.

In Slack everyone calls this the search rewrite, or occasionally the fuzzy search
thing. On this page I am calling it the search relevance work, because "rewrite"
is one of the two answers and using it as the name of the problem hands the
argument to one side before anyone has spoken.

Nadia has read this page and corrected two things in my summary of her position.
If I have still got it wrong, that is my fault and not hers.

## The problem, as customers state it

They cannot find old threads.

That is the sentence, near enough word for word, in the renewal call notes for
four accounts and in a large share of Hal's queue. What is underneath the
sentence is where we disagree.

## Hal's ticket sample

Hal read every support ticket from March and April that mentioned search or
finding a thread. There were 120. He put each one into a category based on what
the person said they were looking for.

| Category | Count | What the ticket looks like |
| -------- | ----- | -------------------------- |
| Knew exactly which thread they wanted | 78 | "The Marchetti load from February, the one that went to Rotterdam" |
| Spelling or variant made the term miss | 22 | Searched Halverson, the thread says Halvorsen |
| Genuinely browsing, no target in mind | 20 | "Show me everything that went wrong in Q1" |

The 78 is the number that decided my position and the 22 is the number that
decided Nadia's, and both of us think the other one is reading the sample
generously. Hal's own view, when I asked, was that the 78 group mostly gave up on
search and scrolled, and that some of them would have used a filter if there had
been one to use. He also said, and I am quoting him because it stuck with me,
that a person who searched twice and then scrolled does not open a ticket, so
whatever this sample says the real number is worse.

## Nadia's case: replace the index

`SRCH-88`.

Search today is Postgres full text. There is a `tsvector` column on the thread
table, it is maintained by a trigger, and ranking is a hand written `ts_rank`
expression with weights that four different people have adjusted since 2023. The
last adjustment was in November and it made recency matter more, which fixed the
complaint we had that week and quietly made older threads harder to reach.

Nadia's argument, as she puts it:

- There is no fuzzy matching and no stemming worth the name for the things people
  actually type, which are company names, place names and load numbers. Halverson
  does not find Halvorsen. Bergström with the diaeresis does not find the account
  spelled Bergstrom. These are not edge cases, they are 22 out of 120.
- Attachment contents are not indexed at all. A broker who remembers a number that
  was on a rate confirmation cannot find the thread by it.
- The ranking expression cannot be reasoned about. Nobody can predict what a
  change to it will do, so nobody changes it, so it stays bad.
- Every filter we build now is built against this index. When we replace the index
  the filters get rebuilt. Doing the cheap thing first means doing the expensive
  thing twice.
- Her estimate is a quarter, and she says a quarter honestly rather than
  optimistically, which I believe.

Nadia's strongest point, and I want it recorded as hers rather than buried: the
78 group is not evidence that ranking is fine. It is evidence that people have
learned our search does not work and have stopped phrasing queries that need it.

## My case: filters and saved views first

`SRCH-95` and `SRCH-101`.

- A filter answers the 78 group directly. If you know it is a Marchetti load from
  February, then account plus date range plus status gets you there in three
  clicks and no relevance ranking is involved.
- Saved views mean the dispatcher who checks the same six things every morning
  stops searching for them. Hal's sample has people searching for their own open
  loads, which is a list, not a query.
- Six weeks, one engineer, no second datastore, no migration, no new operational
  thing for Kenji to keep alive.
- Q3 already contains the billing migration, which cannot slip because it is tied
  to a billing run. Putting a quarter of search work next to it is how both slip.
- Filters change what we can measure. Right now we know what people type. After
  saved views we would know what people repeatedly look at, and that is the input
  a ranking change should be tuned against.

## Where we actually disagree

We agree on more than the Slack thread suggests.

We agree the current index is bad and will be replaced eventually. We agree the
22 spelling cases cannot be fixed with filters. We agree that Hal's sample
undercounts. We agree that filters and saved views are worth building whether or
not the index is replaced.

The disagreement is about sequence and about one factual question: whether
filters built against the current index would need substantial rework after a
replacement. Nadia says yes and estimates a fortnight of the six weeks thrown
away. I think most of the filter work is query building, view storage and user
interface, and that the part coupled to the index is small. Neither of us has
sat down and checked, which is embarrassing given how many times we have argued
about it.

## What would change my mind

If someone spends two days mapping the filter work against a candidate index and
comes back with more than two weeks of rework, my sequence argument gets much
weaker and I would want to talk about doing `SRCH-88` first.

## What would change Nadia's

She says: if filters ship and the search tickets drop by more than half over two
months, she will accept that the ranking problem is smaller than she thinks. She
also says she does not expect that to happen. I have written both halves down
because the second half is the part that makes the first half a real commitment.

## Open questions

- Does Jonah join search in Q3? Marcus has said it is likely and not confirmed.
  It changes the arithmetic on both options and neither of us should plan around
  it until it is real.
- Attachment indexing. It came up under `SRCH-88` and it is arguably separate work
  that could be done against either index.
- What happens to relevance for the seven accounts still on the legacy 214 parser,
  whose status events

## Not decided

This goes to the leads meeting. I am not going to resolve it on a Notion page I
wrote most of.
