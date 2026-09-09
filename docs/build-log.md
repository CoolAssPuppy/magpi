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
assertions, 3 browser journeys. Coverage 95.4 statements, 90.2 branches, 96.1
functions, 95.6 lines. `supabase db diff` reports no schema changes.

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
