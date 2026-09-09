# Decisions

One line per decision the spec did not answer, taken so the build kept moving.
A wrong choice recorded is fixable. A stalled run is not.

## 2026-09-09

**Local ports move to 552xx, not a shutdown of the other stack.** A Supabase
stack for another project was already on 543xx. The spec asks for ports away
from 54321, so Magpi takes 55321 through 55329 and both stacks run at once.

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

**`auto_expose_new_tables` stays off, and grants stay explicit.** `config.toml`
leaves it commented out, which is the current always-revoked default, and that
is the reason no table in `public` had a DML grant. Turning it on would have
fixed the symptom by granting every future table automatically. Explicit grants
in `95_grants.sql` are the posture we want: a new table gets its privileges in
the same commit as its policies, and a reviewer reading that one file sees the
whole client-facing surface.

**The two vendored Library hooks were fixed rather than exempted.**
`use-infinite-query` and `use-supabase-upload` failed the new React hooks rules
in eslint-plugin-react-hooks 6, and carried seven `any` types between them. The
easy answer was an ESLint override scoped to vendored files. The fixes turned
out to be smaller than the override would have been:

- The infinite query hook's `IfAny` fallback existed for projects whose client
  carries no `Database` generic. Ours does, so it resolved to one line and six
  `any`s. Deleting it removed all six.
- Its `trailingQuery` ref is gone. The store outlives any single render and is
  the thing that fetches, so it owns the handler and takes a setter. No ref
  crosses into render scope.
- The upload hook's too-many-files reconciliation moved from an effect into
  `onDrop`, where the array is built and the answer is already known.
- Its error-clearing effect became a derived value. An upload error belongs to a
  file, so with no files there is nothing for one to be about.

None of this is a fork of upstream in any meaningful sense: the behavior is
unchanged and the diffs are readable. If a future `npx shadcn add` overwrites
either file, the lint failure is how we will know.

A third fix followed, once the hooks came under test. The upload hook's retry
built its list by concatenating the files in the error list with the files
missing from the success list. A file that failed is in both, so every retry
sent that object twice at once, and with `upsert` off the second write came back
as an error about a file that had just landed. It is now one filter with an
`or`, which is the same set in the same order with nothing in it twice. This is
the only one of the three that changes behavior, and it is the one the tests
found rather than the linter.

**The Stripe webhook is an Edge Function, not the Next.js route the spec lists.**
Stripe signature verification needs the exact bytes of the request body, and it
needs to run whether or not the web app is deployed. An Edge Function gets both:
`supabase/functions/stripe-webhook` reads the raw body once and verifies against
`SB_STRIPE_WEBHOOK_SECRET`, and billing keeps working during a Vercel outage or
a bad web deploy. The route in the spec would have shared a runtime with the
thing most likely to be broken when a payment lands.

It also keeps the secret out of the web app's environment entirely. The Vercel
project has no Stripe signing secret to leak, and the one place that can verify
an event is the one place that writes to `organizations.plan`.

The cost is that `verify_jwt = false` has to be set for that function in
`config.toml`, so the signature check is the only thing standing between a
stranger and the billing tables. That check is tested against recorded Stripe
payloads in `supabase/functions/_shared/billing_test.ts`, including a replayed
event and one signed with a different secret.
