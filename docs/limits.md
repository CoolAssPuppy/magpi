# Limits

The measured ceilings of this application. Every number on this page is either
measured against the real runtime, or marked `not measured`. Nothing here is an
estimate, because these numbers go on a keynote slide.

A row that says `not measured` is correct and useful. A row with a plausible
number that nobody ran is worse than an empty one, because it gets quoted.

## Models

Pinned in `web/lib/models.ts`. That file is the only place a model id appears in
the codebase, so a model change is a one-file change plus a line in this table.

| Purpose               | Model id                  | Date pinned | Context window           | Max output      | Cost per 1M input | Cost per 1M output |
| --------------------- | ------------------------- | ----------- | ------------------------ | --------------- | ----------------- | ------------------ |
| Embeddings            | `text-embedding-3-small`  | 2026-09-09  | 8,191 tokens, unverified | 1536 dimensions | $0.02             | not applicable     |
| Chat, the answer turn | `gpt-4.1-2025-04-14`      | 2026-09-09  | 1,047,576 tokens         | 32,768 tokens   | $2.00             | $8.00              |
| Question condensing   | `gpt-4.1-mini-2025-04-14` | 2026-09-09  | 1,047,576 tokens         | 32,768 tokens   | $0.40             | $1.60              |
| Conversation titling  | `gpt-4.1-mini-2025-04-14` | 2026-09-09  | 1,047,576 tokens         | 32,768 tokens   | $0.40             | $1.60              |
| Dreaming              | `gpt-4.1-2025-04-14`      | 2026-09-09  | 1,047,576 tokens         | 32,768 tokens   | $2.00             | $8.00              |

Prices are OpenAI's published standard-tier list prices, read from
`developers.openai.com/api/docs/pricing` on 2026-09-09. Cached input and batch
rates are lower and Magpi uses neither today, so the standard rate is the one
that applies to every call the app makes.

Two caveats on that table:

- The embedding model's maximum input length is marked unverified because the
  model page did not state it on the date above. It gates nothing today: the
  chunker targets a size two orders of magnitude below any plausible value.
- Changing the embedding model changes `chunks.embedding` from `vector(1536)` to
  something else, which is a migration and a full re-embed of every chunk in
  every tenant. Treat that id as the expensive one to move.

The keynote is on 2 October, one week after OpenAI Dev Day, so at least one of
these ids will change before then. When it does, `web/lib/models.ts` and this
table change in the same commit.

Actual spend per call comes from `usage_events`, which every model call writes
through the shared wrapper. This table is the list price.

## The Edge Function ceiling

All background processing runs on Edge Functions: ingest, embedding, and
dreaming. The implementation is the natural one. Nothing is batched into
artificially small units to dodge the limit, and there is no chunked resume
protocol. A single document import runs as one job.

At some input size the function exceeds its CPU and wall-clock budget and the
job fails with `ingest_jobs.status = 'timeout'` and the stage it died in.
Finding the exact point where that happens is a deliverable of this build.

`stage` is one of `fetch`, `extract`, `chunk`, `embed`, `store`, from the
`public.ingest_stage` enum. `outcome` is `completed` or the terminal
`ingest_jobs.status`.

| Scenario                        | Input size   | Stage it died in | Wall clock   | Outcome      |
| ------------------------------- | ------------ | ---------------- | ------------ | ------------ |
| 10-page PDF                     | not measured | not measured     | not measured | not measured |
| 50-page PDF                     | not measured | not measured     | not measured | not measured |
| 400-page PDF                    | not measured | not measured     | not measured | not measured |
| Batch of 10 documents           | not measured | not measured     | not measured | not measured |
| Batch of 100 documents          | not measured | not measured     | not measured | not measured |
| Dream digest over 20 documents  | not measured | not measured     | not measured | not measured |
| Dream digest over 200 documents | not measured | not measured     | not measured | not measured |

`input size` records three things about the fixture actually used: file bytes,
extracted character count, and resulting chunk count. All three stay
`not measured` until the fixture exists, because the page count in the scenario
column describes the shape of the test and not the size of the input.

### How this table gets filled in

The measurement runs against the real Edge Functions runtime on a deployed
Supabase project. It does not run against `supabase functions serve`, because
the local runtime does not enforce the same CPU and wall-clock budgets, and a
local number would be a different number wearing the same units.

The date each row was taken goes in this table beside the value. A row without a
date is a row nobody can reproduce. When the runtime's budgets change, the dates
are how we know which rows went stale.

Dreaming is where the ceiling shows most clearly. A digest over a whole space
has to hold many documents at once and make many sequential model calls, and no
amount of batching makes that fit. Build it on Edge Functions anyway, let it work
on a small space and fail on a large one, and record both numbers.

## Analytics against the primary

Admin analytics queries run against the primary database today. Ingest health,
search volume and latency, top questions, dead content, and usage against plan
all read the same Postgres instance that serves user traffic.

The observation to make is the point at which those queries start competing with
that traffic. Two signals, both taken while an admin has the analytics page
open:

| Signal                                                                               | How it is read                     | Value        |
| ------------------------------------------------------------------------------------ | ---------------------------------- | ------------ |
| p95 chat answer latency during an analytics page load, compared with p95 without one | `messages.latency_ms`, two windows | not measured |
| Primary CPU during an analytics page load                                            | Supabase project metrics           | not measured |

This matters because the dead-content query and the top-questions query both
scan history rather than an index over a recent window, and their cost grows
with the tenant rather than with the page. A 4,000-person organization runs the
same query as a one-person free plan against several orders of magnitude more
rows. That crossover is the setup for the Pipelines part of the keynote, so the
measurement has to exist before the claim does.

## PostgREST aggregate functions

Two admin panels count in the database rather than in the web process, and both
stop working if a deployment turns off PostgREST's aggregate functions.

| Query                                         | Where                                               | What it uses       |
| --------------------------------------------- | --------------------------------------------------- | ------------------ |
| Documents pulled, per connection              | `fetchIngestHealth`, `web/lib/analytics/queries.ts` | `documents(count)` |
| Documents, questions and storage against plan | `fetchPlanUsage`, same file                         | `quantity.sum()`   |

Supabase enables aggregates by default, on the platform and in the CLI, so
neither this repo nor a normal self-hosted install has to do anything. A
self-hosted PostgREST with `db-aggregates-enabled = false` is the case that
breaks, and it breaks loudly: the two queries return an error rather than a
wrong number, and the panels around them fall to their error states.

The alternative was to fetch the rows and count them in Node, which is what
section 12 of the spec forbids for usage and what the ingest health panel would
have to do to every document in the organization on every page load. The
aggregate is the correct query. This note exists so that someone self-hosting
knows which switch to look at rather than reading it as a bug.

## Google OAuth verification

Google Drive read scopes are sensitive scopes. Verification takes weeks, and it
will not complete before 2 October.

The demo therefore runs an unverified Google Cloud app with a fixed list of test
users added in the OAuth consent screen. Any account not on that list sees
Google's unverified-app warning and cannot complete the flow. The list is a
manual step before every rehearsal and before the recording.

The verification request is filed anyway, because the repository is public and
people will clone it. Anyone running their own copy registers their own Google
Cloud project and their own OAuth client, so their instance is not affected by
where ours sits in Google's queue.

Notion, Linear and Slack apps are faster to register than Google and none of
them requires this kind of review for the scopes Magpi asks for.

## Running the background workers

Four functions do background work and none of them is a user surface:
`ingest-worker`, `sync-worker`, `dream-worker` and `token-refresh`. Each refuses
any caller whose bearer token is not the service role key, compared in constant
time. A signed-in user's JWT gets a 403, which is deliberate: a worker is
machinery, and anyone reaching one directly is either confused or making the
platform do unpaid work.

That means the scheduler has to send the key. With `pg_cron` and `pg_net`, the
statement is:

```sql
select cron.schedule(
  'ingest-worker',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/ingest-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := '{"batch": 5}'::jsonb
  );
  $$
);
```

The key must not be pasted into the schedule. `cron.job` is readable by anyone
who can read the catalog, and a literal there is a service role key in a table.
Set it once as a database setting and read it with `current_setting`, or use
Vault.

Suggested intervals: `ingest-worker` every minute, `sync-worker` every fifteen,
`token-refresh` hourly, `dream-worker` nightly and staggered by organization id
so every tenant does not wake at midnight UTC together.

`ingest-worker` claims through `claim_ingest_jobs()`, which marks rows running
behind `for update skip locked`, so two overlapping invocations take different
jobs. That matters as soon as a batch runs longer than its interval, which is
the normal case for a large document.

A manual run needs no cron: `connections-sync` and `dream-run` do the same work
from the web app under the caller's own JWT.

## Post-demo, explicitly out of scope

The bar is feature complete rather than production hardened. Every path in the
spec works end to end, with tests, against real data. These are deliberately
outside that bar and are recorded here so they are not rediscovered later as
gaps:

- Penetration testing
- SOC 2 controls
- SSO and SCIM
- Abuse and rate limiting beyond the per-user Postgres fixed windows already
  specified in `consume_rate_limit()`
- Internationalization beyond a string catalog
- Accessibility beyond what the Supabase components provide
- Any load target above what the keynote needs

When one of these comes up during the build, it goes in `docs/todo.md` under
"post-demo" and the work continues.
