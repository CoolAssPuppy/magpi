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
was shut. The tables that worked were the three where the ported magpi schema
happened to carry an explicit `grant ... to service_role` line.

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
