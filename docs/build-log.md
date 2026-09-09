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
