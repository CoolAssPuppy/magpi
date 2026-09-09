# Lessons

A postmortem per correction, and the rule that prevents it happening again.

## pnpm 11 uses `allowBuilds`, not `onlyBuiltDependencies`

`pnpm install` failed the build with `ERR_PNPM_IGNORED_BUILDS` even with
`onlyBuiltDependencies` set in `pnpm-workspace.yaml`. pnpm 11 writes an
`allowBuilds` map into that file and waits for each entry to be `true` or
`false`.

**Rule.** When pnpm reports ignored builds, read what it wrote back into
`pnpm-workspace.yaml` before adding configuration of your own.

## `LayoutProps` is generated, so `tsc` fails on a cold checkout

`create-next-app` writes `LayoutProps<'/'>` into `app/layout.tsx`. That type
comes from `.next/types`, which does not exist until a build has run, so a cold
`tsc --noEmit` fails on a fresh clone.

**Rule.** Type layout and page props explicitly. The generated types are a
convenience for an already-built tree, not something a gate can depend on.

## `supabase db diff` silently strips the DML grants

Every policy in `90_policies.sql` was unreachable after the first migration. A
signed-in user could not read a single row and neither could the service role.
`information_schema.role_table_grants` showed `authenticated` and `service_role`
holding only `REFERENCES, TRIGGER, TRUNCATE` on every table.

A stock Supabase project's default privileges for new tables in `public` give
those roles nothing but those four, so RLS was doing its job and the outer gate
was shut. The tables that worked were the three where the schema ported from the
magpi badge project happened to carry an explicit `grant ... to service_role`
line.

**Rule.** Table privileges are declared, in `supabase/schemas/95_grants.sql`,
never inherited. A new table gets its grants in the same commit as its policies,
and a policy with no matching grant is a policy that does nothing.

## A hand-written migration makes the next generated one destructive

Adding `95_grants.sql` and running `supabase db diff` produced a migration that
dropped and recreated three tables, dropped twenty indexes, dropped nine
policies, and removed every table from the realtime publication. The diff
compares the schema files against the migrations, and the realtime and storage
migrations are hand-written, so from the diff's point of view they are drift.

**Rule.** Read every generated migration before committing it, and when the
diff proposes a drop of something a hand-written migration created, regenerate
from an empty database instead of accepting it. That is only safe while nothing
is deployed, so hand-written migrations that the diff cannot see are worth
keeping to the two the spec already names.

## `git add -A` while other work is in flight breaks atomic commits

A commit meant to carry the README swept in half-finished files from three
parallel workstreams, so its message describes a third of its diff. Nothing was
lost and nothing broke, but the commit stopped being one logical change and the
history stopped being useful for finding where something went wrong.

**Rule.** Stage explicit paths. `git add -A` is safe only when nothing else is
writing to the tree. The same applies to `pnpm format` at the repo root, which
rewrites files another workstream is mid-edit on.

## `typedRoutes` reintroduced the cold-checkout trap I had already written up

I turned on `typedRoutes` in `next.config.ts`, and every dynamic href across
three parallel workstreams stopped typechecking. `href={`/dreams/${id}`}` is a
template string, and the typed `Link` wants a member of a route union that Next
derives from `.next/types`. That directory does not exist until a build has run,
so `tsc --noEmit` on a cold checkout fails on work that is correct.

This is the same failure as the `LayoutProps` one two entries up, and I caused
it myself after writing that entry down.

**Rule.** No gate step may depend on a generated artifact that a build produces.
If `tsc --noEmit` does not pass on a freshly cloned tree with no `.next`, the
configuration is wrong, not the code. Broken links are the Playwright journeys'
job.

Clearing `.next` was also part of the fix: the stale generated types from the
build that ran while the flag was on kept the errors alive after the flag came
back off.

## Next 16 blocks its own dev chunks on 127.0.0.1, so nothing hydrates

The sign-in journey timed out waiting for `/chat`. The page rendered, the form
accepted input, and clicking Sign in navigated to `/sign-in?`, which is a native
GET form submission. `event.preventDefault()` had not run, because the client
component never hydrated.

The dev server was saying so the whole time, in a log line that reads like
advice rather than an error:

```
Blocked cross-origin request to Next.js dev resource /_next/hmr from "127.0.0.1".
```

The Supabase CLI prints `127.0.0.1` URLs and Playwright drives that host, while
the dev server treats anything other than `localhost` as cross-origin.

**Rule.** `allowedDevOrigins` in `next.config.ts` lists both spellings. When a
form does a native submit in a test, the component did not hydrate, and the
cause is upstream of the form.

## `router.push()` followed by `router.refresh()` cancels the navigation

With hydration fixed, sign-in returned 200, the session cookie was written, and
the browser stayed on `/sign-in` for six seconds. Navigating to `/chat` by hand
in the same session worked immediately, which ruled out the proxy and the
session.

The cause is the pair of calls. `router.refresh()` immediately after
`router.push()` aborts the pending soft navigation.

**Rule.** An auth transition uses `window.location.assign()`. A full document
request is the only thing guaranteed to carry a just-written session cookie to
the proxy on the very next hop, and the cost of one reload at sign-in is
nothing.

## `webServer.env` in Playwright replaces the environment, it does not merge

`env: { TEST_RUN_ID: runId }` starts the dev server with no Supabase keys at all.
It was not the cause of the failure above, but it would have been the next one.

**Rule.** Spread `process.env` into any `webServer.env`.

## A hand-written migration is only half the job

Three times now a fix landed as a hand-written migration and the schema files
were left behind, so `supabase db diff` saw the applied database as drift and
proposed dropping the fix. Storage policies, the realtime publication, the
function revokes and the connections column grants were all in that state at
once.

**Rule.** Anything applied by a hand-written migration is also declared in
`supabase/schemas/`, even when the diff cannot generate it. The shadow database
the diff builds has to match the real one, or the next routine schema change
turns destructive.

`supabase db diff` printing "No schema changes found" on a clean tree is the
check that this holds, and it is worth running deliberately rather than only
when generating a migration.

## `on delete set null` on a composite foreign key nulls every column

A composite foreign key added to keep a dream run inside its own space made
deleting a dream output impossible:

```
23502: null value in column "space_id" of relation "dream_runs"
       violates not-null constraint
```

`on delete set null` with no column list nulls the whole referencing key, so
deleting the output document tried to null `dream_runs.space_id` as well. That
column is not null, so the delete failed outright, and "a user can delete a
dream output" went from working to impossible.

Postgres 15 added the column list that says which column to null:

```sql
on delete set null (output_document_id)
```

**Rule.** A composite foreign key with a `set null` action names the column.
Only `cascade` is safe without one, because cascade removes the whole row and
there is no partial state to get wrong.

The wider lesson is that adding a constraint is a behavior change on the delete
path as much as the insert path, and only the insert path was being thought
about when this went in. The existing assertions caught it, which is the whole
argument for having them.

## Deno resolves its config from the working directory, not from the files

`deno check supabase/functions` from the repo root reported 136 type errors, 33
of them `Import "zod" not a dependency`, with a correct import map sitting in
`supabase/functions/deno.json` the whole time. Deno looks for its config by
walking up from the current directory, not up from the files it was handed, and
the repo root has no `deno.json`.

`cd supabase/functions && deno check .` reported zero errors on the same code.

The cost was not the fix, it was the reading. Those errors sat in the gate for
most of an hour looking like a workstream mid-build, and I nearly asked the
agent writing that code to account for errors that were mine.

**Rule.** Every Deno command in `package.json` passes
`--config supabase/functions/deno.json` explicitly. A tool that silently falls
back to a default when it cannot find its config will blame your code for your
invocation.

## Concurrent `supabase db reset` leaves the database with zero tables

Three workstreams each ran `supabase db reset` to pick up a migration, and the
local database twice ended up with no tables at all. pgTAP reported six files
as `Dubious, test returned 3` rather than as assertion failures, which is what
"the schema is not there" looks like from inside a test runner. The storage API
reported `DatabaseSchemaMismatch` at the same time.

Nothing was lost, because the schema files are the source of truth and one more
reset restored everything. The cost was the reading: two workstreams paused
thinking they had broken something, and a set of test failures had no relation
to the code being tested.

**Rule.** One owner for the database lifecycle. Agents that need a migration
applied ask for it rather than running the reset themselves, and a suite that
reports a whole file as dubious should check `select count(*) from
information_schema.tables` before anyone reads the diff.

## An assertion that cannot run and one that cannot fail look identical

Three of these turned up in one evening, in different costumes, and none was
found by reading the test.

**A fixture that makes the assertion unfalsifiable.** `31_ingest.test.sql`
asserted that a claim still inside its window is left alone, with the fixture
setting `claimed_at = now()`. `now()` is the transaction timestamp and does not
move inside a test, so `claimed_at < now()` is false at every interval including
zero. Rebuilding the function with `interval '0 seconds'` produced no failure at
all. The assertion existed to catch a window that steals jobs from healthy
workers and would have passed for a window of any width.

**A fixture too small to reach the code path.** `20_search.test.sql` measures
recall under an RLS filter. At test-corpus size the planner picks a sequential
scan, which filters perfectly, so the assertion passes whatever
`hnsw.iterative_scan` is set to. It needs `set local enable_seqscan = off` to
test anything.

**A missing precondition reported as a failure.** `storage.buckets` was empty, so
every object insert in `50_storage.test.sql` failed a foreign key and the file
aborted having run zero of its thirteen assertions. The runner reported a
failure, the total read 196 instead of 209, and the only thing that caught it
was somebody knowing what the number should be.

**Rule.** An assertion is not trusted until it has been watched to fail. Break
the thing underneath, in a transaction that rolls back, and confirm the
assertion names the break. Where a suite has a known total, check the total: a
file that runs zero assertions and a file that passes them all are the same
green from a distance.

A file that depends on infrastructure the migrations do not create should build
that infrastructure itself. The storage bucket comes from `config.toml` through
the CLI, not from a migration, so a reset whose storage step does not finish
leaves a database that looks correct with no bucket in it.

## An explicit glob bypasses `.prettierignore`

`.prettierignore` lists `supabase/functions`, because those are Deno files
formatted by `deno fmt` with different rules. Running
`npx prettier --write "supabase/functions/**/*.ts"` reformatted all of them
anyway: an explicitly named path is not filtered by the ignore file, only a
discovered one is. The next `deno fmt --check` failed on four files and the two
formatters would have fought over them indefinitely.

**Rule.** Sweep formatting with the repo's own scripts, `pnpm format`, which
runs each formatter over the paths it owns. Reach for an explicit glob only for
a single file, and never for a directory another tool formats.

## The check that verifies a check can be vacuous too

An agent proving a new guard worked reverted the thing it guards and grepped the
output for failures. The grep reported zero and the guard looked broken. The
pattern was `FAILED (`, and the real output carries ANSI colour codes between
the word and the bracket, so it could never have matched anything on any run.

The verification command could not distinguish a pass from a failure. That is
the vacuous-assertion problem one level up: not the test that cannot fail, but
the thing checking whether the test failed.

The first version of this entry said: verify with exit codes, not by grepping
output. That is right and incomplete, and the same agent proved it incomplete
within minutes by making the identical mistake inside the check for the mistake.
Confirming every test file was discovered, it grepped for `^running .* from` and
got zero files loaded, because the ANSI codes sit at the start of the line and
`^running` can never match. Stripping the escapes first gives 30 of 30.

Sometimes you genuinely have to inspect output. So the rule has two halves:

**Strip ANSI before matching.** The escape sequences sit inside and around the
words you are matching on, and they are invisible in a terminal.

**Make the check report a number you can sanity-check.** "0 files loaded" is
obviously wrong on its face and it is what caught the second instance. "0
failures" is not, and it is what nearly ended the first. A check whose failure
mode is indistinguishable from success is the thing to avoid; grep is only the
most common way to build one.

It happened three times in one evening in three disguises, and all three
reported success: a grep that could not match because of colour codes, a flag
set to its own default so the run proved nothing either way, and an
`alter function` silently refused on a permission error so the thing being
broken was never broken. A fourth nearly went unnoticed while writing this file
up, when a grep for a phrase in these very notes returned zero because the
phrase wraps across a line break.

## What a message writer needs from its renderer is whether anything goes in front of it

Four columns bit us in one evening, each in a different way, and all four were
the same question asked badly. `dream_runs.error`, `connections.status_detail`,
`ingest_jobs.error` and the dream input count are all written by an edge
function and rendered by the web app, and every round went: one side changed how
it wrote, the other side's rendering broke somewhere neither side's tests could
see.

- A message naming its own stage read "Timed out during synthesize. Ran out of
  time during synthesize after 148000ms."
- A clause joined after a full stop read "Timed out. the run was interrupted."
- A noun phrase spliced into a sentence read "It was reading No documents."
- A raw provider slug stood in for a product name: "google_drive refused this
  connection."

None of those failed a test on either side, because each side's tests were
correct about its own half.

**Rule.** When one side writes text another side renders, the only thing the
writer needs to know is whether the renderer puts anything in front of it.
Everything else follows. Joined onto a prefix the renderer owns, the message is
a clause and terminating it belongs to the renderer. Rendered standalone, it
arrives whole. Write that down when the column is created, not after the fourth
message about it.

`web/lib/text/sentence.ts` is the joiner, and it is idempotent on purpose. A
column that carries both shapes is then safe rather than lucky.

The wider point is about how these were found. Every one surfaced because one
side changed how it _consumed_ the other's output, never from testing either
side. Fixed copy sitting next to a wrong value stays quiet forever. A sentence
assembled from the data fails loudly when the data is wrong, which is the
argument for building copy out of measured values rather than asserting them.

## Do not ask an approximate index a question in a rolled-back transaction

`20_search.test.sql` asserted that a caller gets their own rows back once
`hnsw.iterative_scan` is on. It failed about one run in three inside the full
gate and passed every time it was run alone, which is the worst shape a test can
have: green when you investigate it, red when you are trying to ship.

Two fixes were tried and only the second was right.

The first weakened the assertion from exactly five rows to more than zero, on
the theory that HNSW assigns every element a random level as it is inserted, so
the graph is a different shape on each build and a test demanding an exact count
was asking an approximate index for an exact answer. That reasoning is sound and
it was not the cause: the weaker assertion still failed.

The cause is the tier. A pgTAP file is one transaction that rolls back, so the
thousand rows were inserted and queried without ever being committed, which is
not how the index is used in production. Asking an approximate index for a
guarantee about uncommitted entries is a question it does not answer at all.

**Rule.** A property that needs committed data does not belong in a rolled-back
transaction. That is the same argument the suite already accepted for not
testing the ingest worker's timeout path from pgTAP, and it applies to anything
whose behavior depends on an index rather than on a constraint.

What replaced it is deterministic and catches the regression that matters:
`public.search` carries `hnsw.iterative_scan` in its `proconfig`. Four
consecutive full-gate runs, no failures. The behavioral numbers belong in
`docs/retrieval.md` against a committed corpus, which was already a named task.

**One trap in verifying it, and it is the third instance tonight of a check that
could not tell a pass from a failure.** Removing the setting to prove the
assertion catches its absence needs a vector operation in the same session
first, or `alter function ... reset` is refused with a permission error on the
parameter and the break silently does not happen. A test that then passes looks
like a test that works.

## The observation was fine; the explanation attached to it was wrong

An agent investigating why the vitest text coverage table omits rows made three
corrections in a row, and named the pattern itself, which is the useful part.

1. It matched a truncated row to the wrong file, while documenting that
   truncated rows cannot be matched to files.
2. It stated a rule before checking it. The rule happened to be true.
3. It called a mechanism disproved on a test that could not have disproved it:
   passing `--coverage.skipFull=false` and seeing no change, when `false` is
   that option's default.

Its own summary: every one was a claim about _why_, layered on an observation
that was fine on its own. The observation never needed the explanation to be
useful, and the added part was wrong every time.

The second is the worst of the three and the reason this is written down. A
claim that is true but unchecked looks exactly like a claim that is true and
checked. Nothing about it reads wrong, so nobody goes and looks, and it gets
built on.

**Rule.** Report what you measured. If you want to say why, measure that too, or
mark it as a guess in the same sentence. "The table prints a row only for files
below 100 in at least one metric, 46 against 46 out of 137" is worth having.
"Because of `skipFull`" was not established and was not needed.

The discriminating test is the one that would come out differently if the belief
were false. Setting a flag to its own default cannot be one.
