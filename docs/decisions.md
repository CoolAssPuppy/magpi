# Decisions

One line per decision the spec did not answer, taken so the build kept moving.
A wrong choice recorded is fixable. A stalled run is not.

## 2026-09-09

**Local ports move to 552xx, not a shutdown of the other stack.** A Supabase
stack for another project was already on 543xx. The spec asks for ports away
from 54321, so Recall takes 55321 through 55329 and both stacks run at once.

**Node 24 locally, `.nvmrc` says 22.** The spec pins 22 and CI reads `.nvmrc`.
The machine running the build has 24 and Next 16 is happy on it, so local
development is on 24 and the pinned version is what CI uses.

**Next 16, not 14.** `create-next-app@latest` ships 16.3.4 with the App Router
and Turbopack. The spec says "Next.js best practices, App Router", and 16 is
that. Nothing in the spec depends on a 14-only behavior.

**pgcrypto and pg_net are not declared in `00_extensions.sql` output.** Both are
already installed in a stock Supabase project, so `supabase db diff` correctly
produced no statement for them. The declaration stays in the schema file as
documentation of the dependency.

**Storage policies and realtime publication are hand-written migrations.**
`supabase db diff` does not track the `storage` schema or publication
membership. Leaving them in `schemas/` would mean they exist during a shadow
diff and vanish on `db reset`.

**`replica identity full` on every realtime table.** Realtime evaluates RLS
against the old row on update and delete, and the default replica identity is
the primary key alone. Without this, a policy filtered on `space_id` cannot see
`space_id`.

**`tsv` is a generated column, not a trigger.** The spec lists `tsv tsvector` on
`chunks`. A stored generated column cannot drift from `content`, and it removes
a trigger from the ingest path.

**RRF constant k = 60.** The value from the original reciprocal rank fusion
paper. It damps low-ranked hits without needing a per-corpus tuning pass.

**Every new user gets an organization and a personal space in a trigger.** The
alternative is a signed-in state where a user has nowhere to put a document,
which every screen would then have to handle.

**Model ids pinned to the 2026-09-09 GA snapshots.** `gpt-4.1-2025-04-14` for
chat and dreaming, `gpt-4.1-mini-2025-04-14` for condensing and titling,
`text-embedding-3-small` for embeddings. The keynote lands the week after
OpenAI Dev Day, so at least one of these changes; it changes in
`web/lib/models.ts` and nowhere else.

**Table privileges are declared in `supabase/schemas/95_grants.sql`.** The first
generated migration left `authenticated` and `service_role` with no DML
privilege on any table, which made every policy unreachable. See
`docs/lessons.md`.

**The initial migration was regenerated from an empty database.** Adding the
grants file made the next diff propose dropping three tables, twenty indexes and
the whole realtime publication, because the hand-written realtime and storage
migrations read as drift. Nothing is deployed, so regenerating was safe and
cheaper than hand-editing a fifteen-hundred-line migration.

**Marketing route group ships, minimally.** Open question 3 in the spec. A
landing page and a pricing page exist because the repo is public and a stranger
cloning it lands on `/` before they land on `/sign-in`. It is one screen of
brand register, not a marketing site.

**Playwright fixtures create confirmed users through the admin API.** A journey
that is not testing signup should not have to walk the mail inbox to get a user.
Signup itself is covered separately.
