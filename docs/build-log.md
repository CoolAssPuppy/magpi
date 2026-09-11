# Build log

One entry per phase: what shipped, what did not, what needs a human, how long it
took. First thing read in the morning.

## Phase 1: Scaffold

**Shipped.** pnpm workspace with `web` as the only Node package. Next 16 App
Router. Supabase design tokens vendored from `supabase/supabase` at
`83c33e903c` by `scripts/sync-tokens.mjs`, with the SHA in
`web/styles/supabase/UPSTREAM`. Three themes through `next-themes` on
`data-theme`. The whole declarative schema in `supabase/schemas/`, the generated
initial migration, storage policies and realtime publication as hand-written
migrations. Generated types committed. vitest with the spec's coverage
thresholds. Both gates, the workflow contract check, the raw color check, and
the light gate in CI. Doppler project `supabase-recall-demo` created and pinned.

**Did not ship.** Nothing.

**Needs a human.** Nothing.

**Notes.** Local Supabase ports moved to 552xx because a stack for another
project was already on 543xx. Both run at once.

## Phase 2: Auth and organizations

**Shipped.** The `password-based-auth-nextjs` and `social-auth-nextjs` blocks,
reorganized into an `(auth)` route group with one shared shell. GitHub social
sign-in alongside the password form. The Library's client split kept as the
canonical version, with the generated `Database` generic added. A trigger gives
every new user an organization, a personal space and an org space. Two Playwright
journeys.

**Did not ship.** Organization invite and accept. The `org_invites` table and its
policies exist; the UI is with the admin surface.

**Needs a human.** Nothing.

**Notes.** The shadcn primitives were rewritten onto the Supabase semantic tokens
before entering the tree, as the spec requires. `Card` lost its shadow, since a
border plus a soft wide shadow on one element is a banned pattern.

## Phase 3: Spaces

**Shipped.** Personal, team and org spaces with membership, the space list and
detail screens, the per-space dreaming switch, and 170 pgTAP assertions across
nine files covering signup, space isolation, conversations, admin access,
search, dreaming, plan limits, storage and function privileges.

**Did not ship.** Nothing.

**Needs a human.** Nothing.

**Notes.** pgTAP earned its place twice on the first run. It found that every
policy in the repo was unreachable because `supabase db diff` had stripped the
DML grants, and that every security-definer function was executable by PUBLIC
because the diff emits grants and never revokes. Both are written up in
`docs/lessons.md`.

## Phases 4 to 12, in parallel

Six workstreams ran at once against a shared tree, partitioned by directory.
That worked, and the two things that went wrong were both mine: a `git add -A`
that swept three workstreams into one commit, and `typedRoutes`, which broke
every dynamic href across three of them at once.

**Shipped.** Upload and ingest with visible failures. Hybrid search. Streaming
chat with citations resolved on read. Connections and dreams surfaces. Admin
analytics with five panels. Checkout, portal and plan limits. The MCP stub. 436
web tests, 183 pgTAP assertions, 7 integration assertions, 3 browser journeys.

**Did not ship.** The Stripe webhook has four parsing bugs, one of which puts
every paying subscription on the Team plan. The sample corpus is being written.
Nothing is measured yet.

**Needs a human.** Real OAuth credentials, a Stripe account, and the two
measurements: the Edge Function ceiling and recall at scale.

**Notes.** pgTAP earned its place four times. It found that every policy was
unreachable, that every security definer function was executable by anon, that a
dream run could write into a space it did not own, and that the fix for the
third broke deleting a dream output. The fourth is the one worth remembering:
the assertions that caught the regression were written before the bug existed.

The database now reports no drift. `supabase db diff` on a clean tree says "No
schema changes found", which took moving four hand-written migrations back into
`supabase/schemas/` so the shadow database matches the real one.

## Phases 13 and 14, and the close

**Shipped.** The MCP stub with `whoami` and the four intended tool contracts in
`docs/mcp.md`. The sample corpus: 70 documents across five simulated sources and
five spaces, with the decision that changed planted across three of them, two
questions whose answers exist only by combining two documents, and an
exact-match target that appears in exactly one chunk. `scripts/seed-demo.mjs`
takes an empty database to a working demo in one command.

**The full gate passes. All sixteen steps, nothing skipped.**

```
format check (web)        format check (functions)
lint (web)                lint (functions)
typecheck (web)           typecheck (functions)
web unit tests            function unit tests
workflow contract         raw color
web build                 mobile-spec contract
coverage thresholds       pgTAP
integration               e2e and lifecycle
```

905 web tests, 426 function tests, 209 pgTAP assertions, 10 integration
assertions, 3 browser journeys. Coverage 97.12 statements, 93.14 branches,
98.96 functions, 97.9 lines, read from `coverage-summary.json` rather than from
the text table, which omits rows. `supabase db diff` reports no schema changes.

**What needs a human, and it is the same two things it was at midnight.** The
Edge Function ceiling and recall at scale. Both are keynote slides, both need
the real runtime and a real corpus, and neither is guessable. Everything around
them is built: a timed-out job names its stage, the run page leads with it, and
the copy says a space this size is expected to fail. Only the numbers are
missing.

Plus the four things outside the code: OAuth apps for Notion, Slack, Linear and
Google, a Stripe account with three products, Google verification filed early
because it will not complete before 2 October, and real credentials into
Doppler.

**What the tests found, which is the part worth reading.** The pgTAP suite found
seven real bugs, a regression inside one of the fixes, and a gap in its own
tripwire that it found by auditing a claim it had made to me. Four of those were
invisible to every other check in the repo. Two were in code written immediately
after being warned about that exact class of mistake.

Three assertions turned out to be unable to fail, and none was found by reading
them. A fixture with `claimed_at = now()` could not falsify a window of any
width, because `now()` does not move inside a transaction. A search test passed
at any `iterative_scan` setting because at test-corpus size the planner picks a
sequential scan. Thirteen storage assertions ran zero times while the total read
196 instead of 209, and the only thing that caught it was somebody knowing the
number should be 209.

The lesson that came out of that is in `docs/lessons.md` and it is the most
useful thing in this repository: an assertion that cannot run and an assertion
that cannot fail look identical from the outside. Knowing what the passing
number should be catches the first. Breaking the thing underneath catches the
second. Neither catches both.

## Phase 15: The corpus grows, and three bugs it exposed

**Shipped.** The corpus went from 136 documents to 196. Colourways, eleven
markets in three tiers, six buyer segments from an 1,800 respondent panel,
packaging, accessories and the finance model behind all of it. `COMPANY.md`
gained a commercial section so the new facts have a reference to agree with,
including the first-quarter split of 180,000 units that every table in the
corpus reconciles to.

Three real bugs came out of writing it, none of which was visible at 136
documents because every document then looked like it came from one source.

`scripts/seed-corpus.mjs` never created connection rows, so every document had
a null `connection_id`. The dream's connections pass drops any pair whose halves
share a source, and with one source it dropped every pair. Zero links, and the
run reported success in under a second because it never reached the model. The
seed now creates one connection per space and provider and stamps
`connection_id` on each synced document.

`scripts/build-corpus-manifest.mjs` set a document's edit date to the latest
date mentioned anywhere in its body. A test plan saying "booked from
2026-09-14" was stamped as edited that day. Six documents sat past the end of
the corpus and sorted to the top of every recency window. It now reads the
document's own `Updated`, `Last edited` or `Created` stamp and clamps to the
corpus end date.

`dream_connections.ts` had two. It passed a whole chunk as the full-text query
to `public.search`, and `websearch_to_tsquery` ANDs every term, so a 1,279 token
chunk matched only itself, which the pass then skips. It contributed nothing and
raised `tsquery stack too small` on dense uploads, which is what killed the
Marketing run. It also capped candidate pairs at 20 before dropping same-source
ones, and a document's nearest neighbours are mostly its own source, so most of
the budget went on pairs headed for the bin. Company produced zero links from 20
candidates. Now it searches by embedding only, searches every document, filters,
ranks by similarity, then caps. Links went from 0 to 80 across four spaces, and
every source pairs with every other.

The connections page was rendering each connection twice, because
`ConnectionRow` draws the status, space, account and reason and then nests
`ScopeEditor`, which drew all four again. The channel and folder pickers were
also always open, 56 checkboxes on screen at once. The page went from 6893px to
3385px.

**Did not ship.** Nothing. The connections model change landed in phase 16.

**Needs a human.** `public.search` still raises `tsquery stack too small` for a
long enough `query_text`. The dream no longer sends one, but a user pasting a
wall of text into chat can. The fix is a guard inside the function, which means
a migration and a change to the live query path.

**Notes.** Two guards went into `scripts/check-corpus.mjs`, both because the
class of bug they catch had already happened. Manifest dates must fall inside
the corpus window, tested against the old code so it catches exactly the six
broken files. And no two documents may claim the same Linear issue id, which
happened three times in one afternoon and which nothing else would have caught.

The corpus was written by five agents in parallel off one file list. Two of them
stopped and asked rather than write the colliding issue numbers they had been
handed, which is the only reason the collisions were caught before the seed ran.

## Phase 16: A connection is an account, not a space

**Shipped.** `connections.space_id` is gone. A connection is one authorized
account, and `scope_selection.routes` maps each unit to a space, so one Slack
workspace sends `#hardware` to Engineering and `#finance` to Finance. The demo
org went from sixteen connections, four per provider with one per space, to
four.

The read rule moved with it. `routes_into_visible_space(jsonb)` is the new
predicate and `connections_select_visible` is now your own connection, or one
that routes into a space you are in. The view model then drops the routes to
spaces the reader is not in, so a whole row passing RLS does not leak the rest of
it. Checked against the seeded org under real RLS: Jane resolves all four
destinations on every connection, Sam resolves Company and Engineering and cannot
learn that a Finance teamspace or a `#finance` channel exists.

Nobody picks a space before the redirect any more, so `space_id` came off
`oauth_states` and `pending_connections` and out of both consume functions. The
connect button asks for nothing and the routing is set on the row afterwards.

`SourceDocumentRef` gained `unitId`, because only Slack could recover its unit
and only by accident, from `externalId` being `${channel}:${ts}`. All four
drivers now report it: Slack the channel, Linear the team off each issue, Notion
the workspace, Drive the folder the file was found under. Sync routes on it, and
a document from a unit with no route is dropped with a warning rather than filed
somewhere arbitrary. A rename keeps a document where it already sits, so
re-routing a unit does not silently move documents whose chunks would then
disagree.

The page went from 6893px to 1889px across the two passes. Each connection is
drawn once, the routing list is collapsed behind a chevron, and the destination
control is the app's own `Select` rather than the browser's.

A destination is checked when it is saved. `requireRoutableSpaces` refuses a
route whose target is not a space in the connection's own organization that the
caller is a member of. Without it a multi-org user could store a route that
`documents_space_in_org` then rejects inside a background sync, or file documents
into a space they cannot open. Out of org and not a member return the same
answer, so neither can be probed. Verified by breaking the guard and watching the
two tests that cover it fail.

**Did not ship.** Re-routing a unit does not move the documents already filed
under it. The routing decides where new documents land and nothing else.

**Needs a human.** `public.search` still raises `tsquery stack too small` for a
long enough `query_text`, unchanged from phase 15.

A user can belong to more than one organization, and nothing in the new connect
flow lets them say which one a connection is for. `requireOrgMembership` takes
the oldest membership so a reconnect is at least deterministic. That is a guess,
not an answer. Fixing it properly means an explicit org on the begin request,
carried through `oauth_states` and `pending_connections`.

A Drive file in two routed folders lands in whichever parent Drive lists first.
Arbitrary, and it wants a rule.

**Notes.** An empty routing now means a connection reads nothing. Drive used to
treat no folders picked as read the whole account, which under routes would be
documents with nowhere to land. Every new connection passes through that state
between authorizing and routing.

pg-delta generated the migration and got the column grants right,
which `docs/decisions.md` says `supabase db diff` would not. It did not emit the
`revoke ... from public, anon` that the declarative schema declares, so a new
`SECURITY DEFINER` function would have been executable by PUBLIC. Those three
revokes are hand-written into the migration. It also ordered the column drop
before a `REVOKE SELECT` naming that column, which fails; dropping a column drops
its grants anyway, so the revoke no longer names it.

`test/setup.ts` gained the pointer-capture and `scrollIntoView` stubs Radix needs
under jsdom. Without them any component using `Select` throws before it opens,
which is why the picker had been a bare `<select>`.

## Phase 17: One organization, folders for chats, and an audit that found real things

**Shipped.** An address has one account and that account has one organization.
`org_members_user_id_idx` is unique on the user alone. That broke the seed
immediately, which is the useful part: the signup trigger gives every account
its own organization, so joining another one was adding a second membership, and
the upsert doing it had no error check and failed silently. Joining now moves the
membership and deletes the organization nobody is left in. It also fixed
something that predates this, where everyone carried a stray Everyone space from
their old organization and three people had two Personal spaces each.

Chat folders. `conversation_folders` is a person's own filing for their own
chats, unique per person case-insensitively, with a colour from an enum and a
position. `conversations.folder_id` is null for the top level, which is a
destination and not a missing value. The sidebar groups conversations under their
folders with a colour dot, and keeps an empty folder visible because somebody
made it deliberately. Colours are stored as names and resolved through
`lib/chat/folder-colors.ts`, so the raw-colour check stays satisfied and a folder
keeps its meaning when the theme changes.

An unrouted Linear connection used to read the whole workspace, drop every issue
for having nowhere to land, and advance its cursor past them. It now answers with
its cursor untouched and asks Linear nothing, which is what Slack already did.

Two audits ran over the connection model. What they found and what happened to it
is in `docs/tech-debt-audit-2026-09-11.md`. The two that matter: a member of one
destination space could re-point a channel the owner had deliberately sent
somewhere else into a space only they could open, and `anon` and `authenticated`
held TRUNCATE on every table in `public`, which ignores row level security
entirely.

**Did not ship.** The nightly dream is still never enqueued. `dream-worker` runs
at 02:00 UTC and drains queued runs, and nothing queues any, so only the manual
button on a space page ever dreams.

**Needs a human.** `public.search` still raises `tsquery stack too small` for a
long enough question. The coverage gate is red at 94.31 percent against 95, and
two components with no tests at all are 59 of the 143 uncovered statements.

**Notes.** The folder key repeated `docs/lessons.md:146` exactly. A composite
`on delete set null` nulls every column in the key, `user_id` is not null, and
deleting a folder raised. The entry was written after the same mistake on
`dream_runs.space_id` and was available to read. It was not read.

The guards added the night before had tests that could not fail. `stubDb` ignores
the query and answers with whatever its closure returns, so every filter in both
guards could be deleted with all eleven tests green. The commit message said the
opposite had been verified, and what had actually been verified was the set
difference rather than the database filter. The stub now applies the request's
filters, and each filter has a test that dies without it. This is the second
entry in this log about an assertion that cannot fail, and the first one is the
most useful thing in the repository.

## Phase 18: The nightly dream actually runs

**Shipped.** `queue_nightly_dreams()` at 01:55 UTC, five minutes before the
worker that drains it. One run per space per kind, skipping a space whose run of
that kind is still queued or running, so a second call in one night does not
double the bill. Every pass returns early when nothing arrived in its window, so
a quiet space costs a row and no model call.

`dream-worker` had been scheduled at 02:00 since it was written and drains
`dream_runs` where `status = 'queued'`. Nothing ever created one except the
manual button on a space page, so the cron fired into an empty queue every night.
The worker, the schedule and three passes all existed; the queue filler did not.

Running it for the first time turned up two things nothing had exercised. Five of
seven entity passes failed on model output that would not parse, so the entity
and connections prompts now ask for a JSON object and set `response_format`,
which the provider guarantees. That left two, which turned out to be the answer
truncated at its 2000 token cap: valid text, invalid JSON, reported as an
unreadable model. `readCompletion` raises `model_answer_truncated` when
`finish_reason` is `length`, and the entity cap is 6000. Twenty-one of twenty-one
runs now succeed, writing 98 entities and 80 links.

`check-scheduled-workers.mjs` read a job's target from its name, so a job called
`dream-worker` that invoked a mistyped one would have passed. It now reads what
each job actually calls and checks an Edge Function or a SQL function
accordingly. Confirmed it fails on both.

**Did not ship.** The dream still covers 120 chunks per space per night, so a
large import is understood over months rather than nights. That is the right
shape for a daily trickle and the wrong one for a backfill.

**Needs a human.** `public.search` still raises `tsquery stack too small` for a
long enough question.

**Notes.** pg-delta omitted the revoke on the new function for the second time
tonight, leaving it executable by PUBLIC. `60_functions.test.sql` caught it,
which is the first time that tripwire has earned its keep in this log.
