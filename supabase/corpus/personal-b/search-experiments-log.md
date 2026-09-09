# Search experiments, running log

Local copy of the thread index, snapshot from 2 April. About 4.1m threads. All of
this is on my machine, none of it is a proposal.

**3 Apr.** Baseline. Hal's 120 ticket phrasings against current ranking, hit if
the right thread is top five. 61 of 120. Recency weight does most of the damage
past about four months.

**7 Apr.** Turned the recency weight back to where it was before November. 71 of
120. Broke the top result for eight queries that work today. Which is the whole
problem with the expression: you cannot move one number without paying somewhere
you are not looking.

**9 Apr.** pg_trgm on account name only. Halverson finds Halvorsen. Bergstrom
finds Bergström both directions. Costs a second index and the planner does
something stupid above about 40k candidate rows unless I force it. Kept.

**14 Apr.** Trigram on the whole thread body. No. Index size went somewhere I
would be embarrassed to show Kenji and precision got worse. Abandoned.

**22 Apr.** Pulled text out of 8,000 rate confirmation PDFs. Load numbers,
company names, and a lot of scanned pages that give you nothing. Roughly a third
are images with no text layer. Attachment search without OCR covers two thirds
and the two thirds are the easy two thirds.

**28 Apr.** Query log, 30 days. Median query is 2.1 tokens. Almost nobody uses
quotes. 14 percent of queries are a bare number, and we tokenise those and rank
them like a word, which is nonsense.

**6 May.** Special cased the bare number: load number, reference, invoice number,
then fall back. A day of work. Real difference on my sample. Not on any list.

**11 May.** Nobody knows what the ranking expression does. I mean this precisely.
I sat with it an afternoon and I can tell you what each term is and I cannot tell
you what the sum does.

**19 May.** The thing I am not going to put in the plan document.

Sofia is going to win this, filters will ship, the tickets will go down. I think
that is true. It worries me because it will be true for a reason that has nothing
to do with search getting better. People who cannot find a thread will learn to
click account plus date range, which works, and they will stop typing in the box.
Then the query log gets quieter and the tickets get quieter and the evidence that
ranking is broken goes away without the ranking being fixed. The 78 group already
stopped phrasing hard queries. Filters teach them that lesson properly.

And I agreed to the two month ticket test. On the record. So I agreed to a
measurement I think comes back clean for the wrong reason, and then I either
honour it or explain why the number I picked does not count. I did not think that
through and I do not know what I would replace it with.

**2 Jun.** Candidate index, one third of threads, ingest from a follower. Ingest
is not the hard part. Reconciling deletes is.

**8 Jun.** 104 of 120 on the same sample. Not fair, I tuned against the sample.
Retuned blind on a held out 40 and got 31. Still much better.

**16 Jun.** Two days mapping filter work against the candidate index, the thing
Sofia asked for in her page. Honest answer is closer to one week of rework than
two. Told her. Weakened my own case and it was the right call, and I was annoyed
about it for a day.

**24 Jun.** Stopping here until the leads meeting decides. Snapshot and scripts in
`~/scratch/idx`, do not delete
