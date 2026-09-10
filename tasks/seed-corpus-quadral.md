# Seed corpus rebuild: Quadral, the quad-fold phone company

Status: plan only. Nothing generated yet. Approve or amend before phase 1 starts.

## What exists today

One corpus, `supabase/corpus/`, 70 documents, fictional company Alderwick, a
freight and EDI SaaS. Grouped by space on disk (`everyone/`, `engineering/`,
`leadership/`, `personal-a/`, `personal-b/`) with `manifest.json` carrying
title, space, source, external id, url and updatedAt. Loaded by
`scripts/seed-corpus.mjs`, which writes a `documents` row, a storage object and
a queued `ingest_jobs` row per entry and stops. The ingest worker does the
chunking and embedding.

Everything outside the corpus that names Alderwick: `docs/corpus.md`,
`scripts/seed-demo.mjs`, `scripts/seed-corpus.mjs`. No test pins corpus content.
Replacing the corpus is cheap.

## The company

Quadral Devices. Ten people. They built the first four-panel folding phone, the
Quadral Fold Q1: three hinges, four panels, opens from phone to tablet to a
desk-sized surface. Pre-production, aiming at carrier certification and a pilot
line.

Names, all placeholders, override any of them:

- Device: Quadral Fold Q1
- Outer display layer: Meniscus
- Hinge assembly: Bellows
- Shell and window manager: Ori
- Org slug: `quadral`, email domain `quadral.test`

Ten people and their roles:

| Person                  | Role                                   |
| ----------------------- | -------------------------------------- |
| Mira Vasquez-Okonkwo    | CEO, co-founder                        |
| Teodoro Lindqvist       | CTO, co-founder, display and materials |
| Anneke de Vries         | Head of mechanical, hinge program      |
| Priyanka Raghunathan    | Display engineer                       |
| Sam Oyelaran            | Firmware and Android platform          |
| Hana Kobayashi          | UI engineer, multi-pane shell          |
| Rustam Achilov          | Industrial design                      |
| Grace Mbeki             | Supply chain and manufacturing ops     |
| Danny Provenzano        | Product manager                        |
| Lucia Ferreira-Sandoval | Go to market and comms                 |

## Spaces

| Space       | Kind     | Members                              |
| ----------- | -------- | ------------------------------------ |
| Everyone    | org      | all ten                              |
| Engineering | team     | Teodoro, Priyanka, Sam, Hana, Anneke |
| Hardware    | team     | Teodoro, Anneke, Priyanka, Grace     |
| Leadership  | team     | Mira, Teodoro, Grace                 |
| Personal    | personal | Mira, Teodoro, Danny, one space each |

Four shared spaces and three seeded personal ones. The remaining seven personal
spaces exist because the signup trigger makes them, and stay empty.

## Two tranches

**Tranche 1, 2026-08-10 to 2026-09-08.** Thirty days. Fully processed:
documents, chunks, embeddings, entities, entity mentions, dream runs, dream
digests, dream links, plus conversation history, usage events and model calls
backdated across the month.

**Tranche 2, 2026-09-09.** One day. Loaded as documents with queued ingest jobs
and nothing else. This is the input to tonight's dream, and running the dream
live is the demo.

Volumes:

| Source        | Tranche 1 | Tranche 2 |
| ------------- | --------- | --------- |
| Notion        | 70        | 5         |
| Linear        | 130       | 18        |
| Slack         | 105       | 16        |
| Google Drive  | 30        | 4         |
| Direct upload | 20        | 2         |
| Total         | 355       | 45        |

400 documents, plus roughly 28 dream outputs once the digests run. Tranche 1
spreads across thirty days at about twelve documents a day, which is what ten
people actually produce.

At this size nobody will have read all of it before a rehearsal, which is the
one property the current 70-document corpus has and this one gives up. Two
things compensate. The checker in phase 4 gets strict, because it is now the
only thing standing between a generated inconsistency and a wrong answer on
stage. And roughly forty documents carry the planted structure: those get read
by hand, listed by name in `docs/corpus.md`, and re-read whenever one of them
changes.

Linear structure: three initiatives, twelve projects, 148 issues across both
tranches. Each issue is one markdown file carrying its description and comment
thread.

1. Ship Q1 to carrier certification. Projects: Bellows hinge durability,
   Meniscus outer layer, thermal budget, FCC and carrier certification, drop and
   ingress testing.
2. Ori shell for four panes. Projects: pane manager, app continuity, multi-pane
   SDK preview, accessibility for four panes.
3. Build the pilot line. Projects: Shenzhen pilot line, yield and binning,
   supplier dual-source.

Slack channels: `#general`, `#hardware`, `#display`, `#firmware`, `#design`,
`#supply-chain`, `#support`, `#gtm`, `#random`, `#incidents`.

## The structure planted inside it

`docs/corpus.md` names four properties a corpus needs for this product. All four
get planted deliberately, plus three extras.

1. **One thing under three names.** Notion calls it the outer layer decision,
   Linear calls it `HW-212`, Slack calls it the crease thing. Entity extraction
   has something to canonicalize.

2. **A decision that changed.** 12 August: pick UTG-3 ultra-thin glass for the
   outer layer. 27 August: the fold-cycle rig cracks a unit at 43,000 cycles at
   the second hinge. 3 September: reverse to laminated polymer, Meniscus B,
   accepting a haze penalty and a 180 dollar bill of materials increase. The
   reasoning sits in a Notion decision record, in `HW-212` comments, and in a
   `#hardware` thread. A digest that averages the three is wrong. One that
   orders them is worth reading.

3. **A pair that is never linked.** A `#support` thread about a returned dev
   unit with ghosting near the second fold, and `HW-238`, panel driver refresh
   sync at the hinge boundary. High similarity, no reference either way. This is
   the entire input to the connections dream kind.

4. **A question answered only by combining two documents.** When does the
   Shenzhen pilot line start and why did it slip? The date is in `OPS-51`. The
   reason, a cover-glass supplier requalification caused by the Meniscus
   reversal, is in a Notion supply chain memo. Neither alone answers it.

5. **An exact-match target.** Fault code `HNG_TORQUE_DRIFT_0x8F12`, in exactly
   one chunk, in the on-call runbook. Part number `MEN-4L-00318` as a second.
   This is what proves the lexical arm of hybrid search is doing something.

6. **Dead content.** Badge printer replacement, parking allocation, a snack
   survey, a lapsed brand font licence, a 2025 offsite recap. Irrelevant to
   every demo question, so the dead-content panel has rows.

7. **The permission demo.** Both users ask: what is the Q1 launch price, and is
   it changing? Everyone holds a pricing FAQ saying 2,399 dollars. Leadership
   holds a board memo saying the Meniscus reversal added 180 dollars of bill of
   materials and the launch price moves to 2,599 with a decision date. Two
   answers, different, no error and no permission dialog on either side.

Tranche 2 is written so tonight's dream produces something worth watching:

- A `#hardware` thread where the rig passes 210,000 cycles on Meniscus B, which
  closes the risk the reversal opened.
- `HW-212` moved to done, with a comment naming the cycle count.
- A Notion week-five hardware status doc.
- A second unlinked pair: yesterday's `#support` ghosting recurrence and a Drive
  test report.
- One document that contradicts a month-old one, so the digest has to order
  rather than average.

## Layout on disk

Settled: `supabase/corpus/`, source-based subfolders, the Alderwick corpus
deleted.

```
supabase/corpus/
  COMPANY.md            the story bible, not loaded
  BRIEFS.md             per-document briefs, the generator input
  manifest.json         the only thing the loader reads
  tranche-1/
    notion/  linear/  slack/  drive/  upload/
  tranche-2/
    notion/  linear/  slack/  drive/  upload/
```

Grouping by source rather than by space, which is what you asked for. The space
comes from the manifest, so nothing on disk needs to encode it.

The manifest grows four fields: `tranche`, `author`, `createdAt`, and a
`channel` or `project` label for Slack and Linear entries.

## How it gets generated

I write the bible and the briefs. A cheap model writes the prose.

The briefs are the whole trick. Every fact that has to be consistent across
documents lives in `BRIEFS.md`: dates, numbers, ticket ids, part numbers, who
said what, which document contradicts which. A generating model that invents
those produces 400 documents that do not agree with each other, and the demo
questions stop having fixed answers.

Phase 3 fans the briefs out to Haiku 4.5 subagents, batched by source and by
week, roughly twelve documents per call, each carrying the bible and its own
briefs. Forty batches or so. Then a checker script verifies the output against
the briefs rather than trusting it.

## Getting tranche 1 into the database already processed

Three ways, and I recommend the first.

**Run the real pipeline once.** Load tranche 1, let the ingest worker chunk and
embed it, let the dream worker run, then backdate the timestamps. Genuine
embeddings, genuine entity extraction, genuine dream output. Costs
under a dollar of embedding at 400 documents and a few dollars of dream calls,
and takes ten to fifteen minutes.
The README already says a fresh clone reproduces the demo with no network call
except the embedding model.

**Commit the dream text, re-embed at seed time.** Same as above, but the dream
digests, entities and links get read back out, hand-checked, and committed as
seed data so the keynote runs against known-good output rather than whatever
GPT-4.1 produces that morning. The embeddings still get computed at seed time.
Worth doing for the digests specifically.

**Commit the vectors too.** About 12 MB of floats in the repository, and a seed
with no network call at all. Fallback only, if the venue network is a risk.

Two things need to happen after the workers finish either way:

- **Backdating.** Workers write `now()`. A month of history needs
  `chunks.created_at`, `dream_runs.created_at`, `usage_events.occurred_at`,
  `model_calls.occurred_at` and the conversation timestamps spread across the
  thirty days per the manifest. Without it the admin analytics charts are one
  tall bar on today.
- **Retrieval counts.** `documents.last_retrieved_at` and `retrieval_count` need
  seeding, or the dead-content panel cannot tell dead content from a fresh
  clone.

One thing caught while reading the schema: `plan_document_limit` caps the free
plan at 200 documents. 400 plus dream digests goes well past it. The seeded org
has to be on the `team` plan, limit 25,000, which also gives the billing page
something real to show. Nightly digests get limited to the trailing seven days
per space, 28 documents, rather than thirty nights across four spaces.

## Phases

1. **Bible and briefs.** Write `COMPANY.md` and `BRIEFS.md`. Every planted fact
   fixed here first, starting with the decision that changed, because everything
   else is easier once it exists. No prose generated yet. Check in.
2. **Manifest.** Generate `manifest.json` from the briefs, so the loader input
   and the generator input cannot drift.
3. **Generate.** Haiku 4.5 subagents write the 400 markdown files from the
   briefs, in batches by source and week.
4. **Check.** `scripts/check-corpus.mjs`: every manifest entry has a file, every
   referenced ticket id exists, every date sits inside its tranche, the planted
   facts appear in the documents that are supposed to carry them, the
   exact-match strings appear exactly once, no real company names.
5. **Loader.** Update `scripts/seed-corpus.mjs`: manifest-driven spaces instead
   of the hardcoded two team spaces, a `--tranche` flag, and personal spaces for
   however many people the manifest names.
6. **Ten people.** Update `scripts/seed-demo.mjs` to create ten users, put them
   in the right spaces, and set the org to the team plan.
7. **Process tranche 1.** Run ingest and dream workers, read the dream output,
   commit the digests worth keeping.
8. **Backdate.** `scripts/backdate-corpus.mjs` for timestamps, retrieval counts,
   usage events, model calls and a month of conversation history with citations
   pointing at real chunk ids.
9. **Verify.** Ask the demo questions by hand, both users, and write the answers
   into `docs/corpus.md`. Delete the Alderwick corpus and rewrite that document
   around Quadral.

## Decisions taken

1. Alderwick is replaced. `supabase/corpus/` is deleted and `docs/corpus.md` is
   rewritten around Quadral. One story, one set of demo questions.
2. The files stay at `supabase/corpus/`, next to the loader and the seed, with
   source-based subfolders under a tranche folder.
3. Haiku 4.5 subagents write the prose from briefs I write. No new key, no new
   model id in `web/lib/models.ts`.
4. 400 documents. See the note under two tranches on what that costs.

Still open, and none of it blocks phase 1:

- Company and device names. Quadral, Fold Q1, Meniscus, Bellows, Ori are
  proposals and any of them can change up to phase 3 at no cost.
- Whether the hand-checked dream digests get committed as seed data, which is
  the second option under processing tranche 1. Decide after seeing what the
  first dream run produces.
