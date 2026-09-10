# Supaphone

Everything in `supabase/corpus/` is fiction. Supaphone does not exist, the Fold
S1 does not exist, and none of the people named here are real. The documents
were written for Magpi so the demo has something with structure in it. This file
is the reference the rest of the corpus is consistent with. Read it before
adding a document, and change it first if a fact needs to move.

The name is deliberately obvious. Nobody watching should wonder for a second
whether this is a real customer's data.

## What the company makes

Supaphone makes the Fold S1, a four-panel folding phone. Three hinges, four
panels, opening from phone to tablet to a desk-sized surface. Seven people. The
device is pre-production, heading for carrier certification and a pilot line in
Shenzhen.

Three names that appear constantly and mean specific things:

- **Meniscus** is the outer display layer, the part a user touches when the
  phone is folded shut.
- **Bellows** is the hinge assembly, all three hinges together.
- **Ori** is the shell and window manager, the software that decides what shows
  on how many panels.

Org slug `supaphone`. Email domain `example.com`, because these are demo
accounts and nothing else should look plausible enough to type into a real form.

## The people

| Person | Email | Role |
| --- | --- | --- |
| Jane Okonkwo | jane@example.com | CEO, co-founder |
| Sam Lindqvist | sam@example.com | Hardware, hinge and display |
| Ben Achilov | ben@example.com | Firmware and the Ori shell |
| Maya Restrepo | maya@example.com | Head of marketing |
| Priya Raghunathan | priya@example.com | Product marketing |
| John Mbeki | john@example.com | Finance lead |
| Dana Provenzano | dana@example.com | Supply chain and manufacturing ops |

Every account has the password `supabasedemo`. They are demo accounts in a demo
company and the password is in the README.

## The spaces

| Space | Kind | Members |
| --- | --- | --- |
| Company | org | all seven, enrolled by the signup trigger |
| Marketing | team | Jane, Maya, Priya, Ben |
| Engineering | team | Jane, Sam, Ben, John |
| Finance | team | Jane, John, Dana |
| Personal | personal | one per person, seeded for Jane, Sam and John |

Jane is the only person in every shared space, which is the whole reason she is
the account the demo signs in as. She is not privileged: there is no role in
this product that reads across a space boundary. She sees everything because she
is a member of everything, and the moment you remove her from Finance she stops
seeing Finance.

The two walls that matter:

- **Sam is not in Finance.** Anything about cost, margin or the launch price is
  invisible to him.
- **John is not in Marketing.** Anything about the launch date, the embargo or
  the carrier deal is invisible to him.

Ben is in Marketing and Engineering but not Finance. Dana is in Finance but not
Engineering. Every question in `docs/corpus.md` names which of these people can
answer it and which cannot.

## The timeline

Two tranches, and the split is the demo.

**Tranche 1 runs 2026-08-10 to 2026-09-08.** Thirty days, loaded fully
processed: documents, chunks, embeddings, entities, mentions, dream runs,
digests, links, plus backdated conversations and usage.

**Tranche 2 is 2026-09-09.** One day, loaded as documents with queued ingest
jobs and nothing else. This is the input to tonight's dream, and running that
dream on stage is the point.

## What is planted in it

Four properties, planted on purpose. A document that contradicts one of these is
a bug in the corpus.

**1. One thing under three names.** The outer layer decision is called the
outer layer decision in Notion, `ENG-212` in Linear, and the crease thing in
Slack. Entity extraction has something real to canonicalize.

**2. A decision that reversed.** On 12 August the team picked UTG-3 ultra-thin
glass for Meniscus. On 27 August they reversed it to Meniscus-C polymer after
the hinge cycle test failed at 180,000 cycles on unit B7. Both decisions are
written down. Asking what Meniscus is made of has to come back with the polymer,
and the glass has to be findable as the thing that was superseded.

**3. A fact only Finance holds.** The Fold S1 unit cost landed at $1,140, which
is what set the $1,899 launch price. That number appears only in Finance
documents. Jane and John can answer a question about margin. Sam gets a shorter
answer with no error and no dialog about it.

**4. A fact only Marketing holds.** The launch is 2026-11-04 under embargo, with
two carriers signed. That date appears only in Marketing documents. John cannot
see it.

## Where the documents come from

Five sources, and each one has to read like an export from that tool rather than
like a memo. A citation to a Slack thread that looks identical to a citation to
a Notion page teaches the audience nothing.

- **Slack** is threaded messages with handles and timestamps, in
  `#general`, `#hardware`, `#display`, `#firmware`, `#design`,
  `#supply-chain`, `#gtm`, `#finance`, `#incidents`, `#random`.
- **Linear** is issue bodies with a status line, labels, an assignee and a
  comment thread. Prefixes: `ENG`, `HW`, `ORI`, `OPS`, `GTM`.
- **Notion** is nested pages with headings, tables and decision records.
- **Google Drive** is longer prose: memos, board updates, test reports.
- **Direct upload** is what a person dragged in: a PDF report, a spreadsheet
  export written out as a table, a scanned supplier quote.

## Detail the corpus settled on

Written down after the fact, because documents already depend on these and a new
one that disagrees would be the inconsistency this file exists to prevent.

- **Suppliers are places, not companies.** UTG-3 came from the Kyoto vendor,
  Meniscus-C from the Suwon vendor. Carriers are A and B and never named.
- **The cycle spec is 200,000**, for a two year life. Test units are B5, B6, B7
  and B9 on glass, B11 and B12 on polymer.
- **Four panels**, numbered from hinge 1. Hinge 2 is the middle one. Fold states
  are phone, tablet and desk. A pane is a whole panel.
- **The crease is measured** on a 60 degree gloss meter against a 2.5 GU gate,
  with a three-observer panel behind it.
- **Certification** is FCC Part 15B, SAR limit 1.6 W/kg, accredited lab booked
  for the week of 21 September.
- **Finance only.** Unit cost $1,140, launch price $1,899, about 40 percent
  gross margin. Panels are 41 percent of the bill of materials, Bellows 14
  percent. Polymer tooling $214k against $267k for glass.
- **Marketing only.** Embargo lifts at 10:00 on 2026-11-04, retail 4 and 7
  November, two carriers signed.

## Rules for adding a document

- Every fact must agree with this file. If it cannot, change this file first.
- Authorship follows membership. An author, owner, assignee or commenter must be
  a member of the space the document lands in. A Finance document written by Sam
  is a bug, and so is a Slack thread in an Engineering channel with Dana posting
  in it.
- Being mentioned is not the same as taking part. An Engineering page can say
  "Dana reordered the tooling" even though Dana is not in Engineering, because
  people talk about colleagues on other teams constantly. She just cannot be the
  one writing it.
- Dates fall inside a tranche. Nothing is dated after 2026-09-09.
- No document explains the permission model. The corpus is the company's work,
  not a tutorial about Magpi.
