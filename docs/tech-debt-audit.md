# Tech debt audit

Generated 2026-09-09, against `108ea20`, by four readers: one per module plus a
synthesis pass. Every finding carries a `file:line`. Findings marked **verified**
were reproduced independently rather than taken from a report.

## Executive summary

1. **A member can move a space into another organization, and can escalate a
   team space to `org` kind.** Both reproduced against the live database.
   `spaces_update_member` tests only membership and `95_grants.sql` grants the
   whole table, so `org_id` and `kind` are writable by anyone in the space. The
   content follows and is then metered and billed against an org it does not
   belong to. This is the worst finding.
2. **A caller can point a document at another space's storage object.**
   `storagePath` is validated as `z.string().min(1)` and handed to the service
   client verbatim; the ingest worker reads whatever path the row names with no
   space check. Cross-space read.
3. **Three production cron paths resolved to nothing.** Fixed in `108ea20`.
   Nothing ingested, synced or dreamed on a deploy, and no gate step looked at
   `vercel.json`.
4. **Two public Edge Functions would have answered 401.** Fixed in `108ea20`.
   No `[functions.*]` block, so `verify_jwt` defaulted true on the OAuth
   callback and the Stripe webhook.
5. **The retry budget is unreachable.** A transient provider error writes
   terminal `failed`, so `attempts < 3` in `claim_ingest_jobs` can never fire.
   The SQL comment describes retries that cannot happen.
6. **Two recovery mechanisms fight and the worse one wins.** A JS sweep and the
   SQL reclaim CTE cover the same rows with opposite outcomes; the sweep runs
   first, so a crashed job is retired instead of retried and the CTE is dead.
7. **Notion and Linear first passes can silently drop a backlog.** Both advance
   the cursor to the newest item seen rather than the page cursor, which is only
   correct if the provider sorts ascending. Notion's own query sorts descending.
8. **Eleven of eighteen functions are revoked only in a migration, not in
   `schemas/`.** The exact drift `docs/lessons.md` was written about, written by
   the person who wrote the entry.
9. **Two meters are read and never written.** `usage_events` with `kind =
'query'` and `documents.last_retrieved_at`, so the query plan limit is
   enforced by nothing and the dead-content panel reports everything as dead.
10. **Two docs assert things that do not exist.** `docs/retrieval.md` says four
    chunking rules are implemented and none is; `docs/mobile-spec.md` cites a
    string catalog module that was never written.

## Architectural mental model

Three tiers with a deliberate seam between them.

`web/` is a Next App Router app. Server components read through a per-request
Supabase client carrying the caller's JWT, so RLS is the authorization; server
actions all funnel through `withSession`; one route handler streams chat because
a server action cannot. The service-role client exists in `lib/supabase/service`
and is meant to appear only after the caller and their rights are already
established.

`supabase/functions/` is Deno. The design rule that matters: a job body is a
plain async function taking a record and injected clients, and the runtime entry
point is a thin wrapper, so moving off Edge Functions is a wrapper change. That
rule holds in the code. Four source drivers sit behind one contract and a
registry, and no provider slug appears in a branch outside it, which I checked
specifically.

`supabase/schemas/` is the source of truth; migrations are generated. The
permission model is spaces, and `space_id` is denormalized onto `chunks` so the
RLS filter is one indexed column. Composite foreign keys carry `space_id`
through every reference so a cross-space write is refused by the database rather
than by convention.

**Where the model and the code disagree**: the same `space_id` discipline was
never applied to `org_id`, which is finding F001. And the seam between the
generated schema and the hand-written migrations leaks in both directions,
which is F008.

## Findings

| ID   | Category       | File:Line                                                                                                     | Sev      | Eff | Description                                                                                                                                                                                                                                 | Recommendation                                                                                                                                                                     |
| ---- | -------------- | ------------------------------------------------------------------------------------------------------------- | -------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F001 | Security       | `supabase/schemas/90_policies.sql:52`, `95_grants.sql:25`                                                     | Critical | M   | **Fixed.** A space member could `update spaces set org_id = <other org>` and flip a team space to `kind = 'org'`, and nothing constrained `documents.org_id`, `chunks.org_id`, `connections.org_id`, `ingest_jobs.org_id` to match.         | Done. Grant narrowed to `(name, dreaming_enabled)`, `spaces (id, org_id)` unique added, and the four content tables now carry `org_id` in a composite key. Three pgTAP assertions. |
| F002 | Security       | `web/app/(app)/documents/actions.ts:11,49`                                                                    | Critical | S   | **Fixed.** `storagePath` was `z.string().min(1)`, written by the service client, and `jobs/ingest.ts:111` read that path with no space check, so a caller could index another space's object into their own.                                | Done. The action takes an `objectName` with no slash in it and builds the path from the space it already checked. `mimeType` is now `z.enum`. See also F071.                       |
| F003 | Correctness    | `supabase/functions/_shared/jobs/ingest.ts:296`                                                               | Critical | S   | **Fixed.** A transient `SourceError` wrote terminal `failed`, so the `attempts < 3` budget was unreachable and the driver message promising a retry was false.                                                                              | Done. `needsReconnect === false` writes `queued` and the attempt cap in `claim_ingest_jobs` retires it.                                                                            |
| F004 | Correctness    | `supabase/functions/ingest-worker/index.ts:37`, `schemas/80_functions.sql:318`                                | Critical | M   | **Fixed.** The JS `retireAbandoned` sweep and the SQL reclaim CTE covered the same rows with opposite outcomes, and the sweep ran first, so the CTE never matched.                                                                          | Done. The sweep is gone from `ingest-worker`; `dream-worker` still uses it and has no reclaim of its own.                                                                          |
| F005 | Correctness    | `supabase/functions/_shared/sources/notion.ts:190`                                                            | Critical | M   | **Fixed.** The first pass over a workspace larger than `MAX_REQUESTS` pages advanced the cursor to the newest page while search sorts descending, so the backlog was never read.                                                            | Done. `sources/cursor.ts` makes a cursor either a watermark or a backlog position, and both drivers have a two-pass test.                                                          |
| F006 | Correctness    | `supabase/functions/_shared/sources/linear.ts:211`                                                            | High     | M   | **Fixed.** The cursor advanced to the newest `updatedAt` from one page of 50, and `orderBy: updatedAt` carried no direction, so only our own fixture said ascending.                                                                        | Done. Paginates with the provider page token, same discriminated cursor as Notion, with a two-pass test.                                                                           |
| F007 | Correctness    | `supabase/functions/connections-claim/index.ts:90`                                                            | High     | S   | **Fixed.** `.eq('external_account_id', ...)` never matches a null, so a provider returning no account label created a fresh connection with a live token on every reconnect.                                                                | Partly done. The lookup uses `.is()` and moved to `connections-claim/store.ts`. The partial unique index is still owed.                                                            |
| F008 | Schema drift   | `supabase/schemas/80_functions.sql:13` and 10 others                                                          | High     | S   | **Fixed.** Eleven of eighteen functions were revoked only in `migrations/20260909161000`, so a shadow database built from `schemas/` alone left them executable by PUBLIC.                                                                  | Done. Revokes are in `80_functions.sql` beside each grant, with a pgTAP set comparison over `proacl` verified by breaking it.                                                      |
| F009 | Correctness    | `web/lib/analytics/queries.ts:281`                                                                            | High     | S   | **Fixed.** `usage_events` with `kind = 'query'` was read and written nowhere, so the meter read zero and `plan_monthly_query_limit` was enforced by nothing.                                                                                | Done. The answer path writes one row per answered question and `check_query_allowed` gates the chat route with a 402.                                                              |
| F010 | Correctness    | `web/lib/analytics/queries.ts:194`                                                                            | High     | M   | **Fixed.** `documents.last_retrieved_at` and `retrieval_count` were written by nothing, so the dead-content panel reported every document as dead.                                                                                          | Done. `record_retrieval` is called with the distinct document ids a search returned, scoped to the caller's own spaces.                                                            |
| F011 | Error handling | `web/app/(app)/chat/actions.ts:40,57,74`, `spaces/actions.ts:30,38,56,75`, `documents/actions.ts:44,62,71,90` | High     | M   | **Fixed.** Eleven paths returned the raw `PostgrestError` string, so a policy denial rendered as `new row violates row-level security policy for table "conversations"`.                                                                    | Done. `web/lib/actions/database-error.ts` logs the raw error and returns product copy, with an optional per-SQL-state map.                                                         |
| F012 | Correctness    | `web/lib/chat/answer.ts:103`                                                                                  | High     | S   | **Fixed.** `setCondensedQuery` and `setTitle` ran inside the try that yields the error event, after `done`, so a failed title write deleted a delivered answer from the screen.                                                             | Done. Own try around the post-`done` block, which logs and yields nothing.                                                                                                         |
| F013 | Testing        | `supabase/functions/_shared/jobs/dream_test.ts:230`                                                           | High     | S   | "A dream run writes nothing carrying another space" cannot fail: the stub returns the foreign chunk regardless of `space_id=eq.`, and the assertion greps for the wrong uuid.                                                               | Make the stub honour `space_id=eq.`; assert the filter on every space-scoped read.                                                                                                 |
| F014 | Testing        | `supabase/functions/_shared/sources/leak_test.ts:115`                                                         | High     | S   | Eight leak tests exercise `refresh` on drivers whose refresh returns `not_supported` without touching `deps`, so they pass against an empty function body.                                                                                  | Skip `refresh` for those drivers; assert separately that no request was made.                                                                                                      |
| F015 | Dead code      | `supabase/functions/_shared/oauth.ts:316`                                                                     | High     | S   | `OAuthDriver.refreshTokens` is dead in production, duplicates `refreshWithTokenEndpoint`, and its only caller is the test that makes it look alive. The surviving copy does not know the `basicAuthForToken` and `normalizePayload` quirks. | Delete it and its test, or route the live path through it.                                                                                                                         |
| F016 | Architecture   | `supabase/functions/_shared/sources/contract.ts:41`                                                           | High     | M   | **Fixed.** `ChangePage.hasMore` was computed by four drivers, asserted in eight tests, and read by no caller, so a partial sync never scheduled another pass.                                                                               | Done. `runSyncJob` walks until the driver is done, the budget is spent, or the cursor stops moving.                                                                                |
| F017 | Performance    | `web/app/(app)/admin/members/page.tsx:58`                                                                     | High     | M   | **Fixed.** One `auth.admin.getUserById()` per member inside `Promise.all`, over an unlimited query, at a stated scale of 4,000 people.                                                                                                      | Done. Fifty members a page, and `org_member_emails` reads their addresses in one query with its own admin test.                                                                    |
| F018 | Docs           | `docs/retrieval.md:100`                                                                                       | High     | S   | **Fixed.** Said "Status: implemented" over a 100-token merge, a 1,200-token ceiling, a heading rule and real tokenization, none of which exists.                                                                                            | Done. Rewritten from the code, with file:line for every claim.                                                                                                                     |
| F019 | Docs           | `docs/mobile-spec.md:46`                                                                                      | High     | S   | **Fixed.** Named `web/lib/strings/` as the string catalog and cited keys from it. The module has never existed.                                                                                                                             | Done. Rewritten to cite what exists.                                                                                                                                               |
| F020 | Correctness    | `supabase/functions/dream-run/index.ts:55`                                                                    | High     | S   | **Fixed.** Inserted a run as `queued` then ran it inline without claiming, so a cron tick could execute the same run twice.                                                                                                                 | Done. The insert writes `running` and its own `started_at`, so there is no window to lose rather than a claim to lose.                                                             |
| F021 | Security       | `web/lib/chat/prompt.ts:25`                                                                                   | Medium   | M   | Retrieved content, which is untrusted and reaches us from Slack and Notion, is injected at system role with no delimiting.                                                                                                                  | Move to user role, delimit the passages, state they are data. See open questions.                                                                                                  |
| F022 | Performance    | `web/lib/supabase/context.ts:22`                                                                              | Medium   | S   | **Fixed.** `getSessionContext` was not wrapped in `cache()`, so an admin page load made three `auth.getUser()` round trips plus three `org_members` selects.                                                                                | Done. Wrapped in `cache()`.                                                                                                                                                        |
| F023 | Correctness    | `web/components/documents/upload-panel.tsx:42`                                                                | Medium   | M   | The dedupe ref keys on file name only and `successes` never resets, so the same filename uploaded to a second space is silently never indexed. The effect also reads live `spaceId`.                                                        | Key on the full storage path; capture the space the upload started with.                                                                                                           |
| F024 | Performance    | `web/components/connections/sync-activity.tsx:51`                                                             | Medium   | S   | The effect depends on an array rebuilt every render, so every status change tears down and resubscribes the Realtime channel and loses events in the gap.                                                                                   | Depend on a joined key; read ids from a ref in the handler.                                                                                                                        |
| F025 | Testing        | `web/vitest.config.mts:11,16`                                                                                 | Medium   | M   | `hooks/**` is in neither the test include nor the coverage include, and has no tests. Roughly 450 lines, including the two hooks `decisions.md` records as deliberately rewritten. The 97/93/99/98 number excludes all of it.               | Add `hooks` to both globs and test the three changed behaviors.                                                                                                                    |
| F026 | Error handling | `web/app/(app)/connections/error.tsx:17` and 6 others                                                         | Medium   | S   | Seven of thirteen boundaries render `error.message`; in production Next substitutes generic digest text so the composed sentence reads as nonsense. Two have no reset button.                                                               | Fixed copy and a reset in all thirteen; log the digest.                                                                                                                            |
| F027 | Types          | `web/lib/spaces/spaces.ts:66`, `documents.ts:89`                                                              | Medium   | S   | **Fixed.** Two assertions bridged a query into a hand-written row type that shadowed the generated one.                                                                                                                                     | Done. Both hand-written types and both assertions are gone.                                                                                                                        |
| F028 | Types          | `web/app/auth/confirm/route.ts:10`                                                                            | Medium   | S   | **Fixed.** `searchParams.get('type') as EmailOtpType` asserted an untrusted query parameter and handed it to `verifyOtp`.                                                                                                                   | Done. Parsed with `z.enum` over the real set.                                                                                                                                      |
| F029 | Correctness    | `web/lib/documents/documents.ts:79`                                                                           | Medium   | S   | **Fixed.** The embedded `ingest_jobs` had no order or limit, so `row.ingest_jobs[0]` was arbitrary and the list could disagree with the detail page.                                                                                        | Done. Ordered and limited to match the detail page.                                                                                                                                |
| F030 | Performance    | `web/lib/chat/store.ts:113`                                                                                   | Medium   | S   | **Fixed.** `loadMessages` selected every message in a conversation on every POST and used eight turns of it.                                                                                                                                | Done. Both it and the chunks query take the limit the prompt builder uses.                                                                                                         |
| F031 | Design         | `web/styles/tokens.css:19`                                                                                    | Medium   | S   | **Fixed.** The named z-index scale had zero consumers; five overlay primitives used a raw `z-50` colliding with `--z-toast`.                                                                                                                | Done. The scale is applied to the overlay primitives.                                                                                                                              |
| F032 | Design         | `web/components/ui/dialog.tsx:41` and 5 others                                                                | Medium   | M   | **Fixed.** Six elements paired `border` with `shadow-lg`, which `DESIGN.md` bans by name, and used `rounded-md` where `--radius-panel` exists.                                                                                              | Done.                                                                                                                                                                              |
| F033 | Design         | `web/components/ui/*` (30+ sites)                                                                             | Medium   | M   | **Fixed.** The primitives were written against shadcn compat aliases that resolve only through `compat.css`, which upstream has marked for deletion.                                                                                        | Done. Rewritten onto the real tokens, so the next token sync cannot unstyle them.                                                                                                  |
| F034 | Consistency    | `web/app/(app)/documents/page.tsx:12`, `spaces/page.tsx:11`                                                   | Medium   | S   | **Fixed.** Two ways to get a server client in a page: four resolved `getSessionContext()`, two called `createClient()` directly and had no `orgId`.                                                                                         | Done. All six resolve `getSessionContext()`.                                                                                                                                       |
| F035 | Observability  | `web/lib/openai/call.ts:116`                                                                                  | Medium   | M   | A cancelled stream unwinds the generator at a yield, skipping the catch and the trailing report, so an abandoned answer writes no `model_calls` and no `usage_events`. Tokens billed by OpenAI go unmetered.                                | `try/finally`, report from the finally.                                                                                                                                            |
| F036 | Error handling | `web/app/api/chat/route.ts:105`                                                                               | Medium   | S   | **Fixed.** `consumeRateLimit` threw and nothing caught it, so the request 500d, contradicting the comment three lines above promising a typed JSON body.                                                                                    | Done. Caught, logged, and answered with a typed `server_error`.                                                                                                                    |
| F037 | Security       | `web/next.config.ts:9`                                                                                        | Medium   | S   | No security headers at all: no CSP, no `frame-ancestors`, no HSTS, on an app that renders untrusted ingested text.                                                                                                                          | Add a `headers()` block.                                                                                                                                                           |
| F038 | Security       | `web/app/auth/error/page.tsx:25`                                                                              | Medium   | S   | Renders an unvalidated `?error=` parameter as the app's own copy, populated with the raw GoTrue message. Escaped, so not XSS, but attacker-controlled text on a page any link reaches.                                                      | Map codes to fixed copy.                                                                                                                                                           |
| F039 | Correctness    | `supabase/functions/_shared/billing.ts:309`                                                                   | Medium   | S   | `applyCheckout` sets `plan: 'team'` unconditionally, discarding the argument `planForSubscription` makes forty lines earlier. Any product, or an unpaid session, gets Team.                                                                 | Read `metadata.plan`, the price, and `payment_status`.                                                                                                                             |
| F040 | Correctness    | `supabase/functions/_shared/jobs/ingest.ts:218`                                                               | Medium   | S   | No budget checkpoint before the fetch, so a job killed while downloading reports stage `extract`. The fetch is the stage most likely to run long.                                                                                           | Checkpoint `fetch` before `readSource`.                                                                                                                                            |
| F041 | Testing        | `supabase/functions/_shared/jobs/sync_test.ts:314`                                                            | Medium   | S   | The cursor-ordering test times out at the first checkpoint, before `listChanges` runs, so it cannot distinguish the behavior it names.                                                                                                      | Use the `jumpingClock` pattern; assert the stage.                                                                                                                                  |
| F042 | Error handling | `supabase/functions/connections-claim/index.ts:172`                                                           | Medium   | S   | `populatePicker` catches everything, so a decrypt failure returns a successful claim with an empty picker and no signal.                                                                                                                    | Narrow to `SourceError`; write `status_detail` on failure.                                                                                                                         |
| F043 | Performance    | `supabase/functions/token-refresh/index.ts:36`                                                                | Medium   | S   | Decrypts every connection it checks, including ones with time left: 20 AES-GCM decrypts per tick to answer a question `isSpent` already answered.                                                                                           | Split a `refreshIfSpent` that returns no token.                                                                                                                                    |
| F044 | Types          | `supabase/functions/connections-claim/index.ts:58`, `connections-callback/index.ts:79`                        | Medium   | S   | The two RPC results carrying `code_verifier` and `access_token_enc` are cast, not parsed, while the one carrying least is parsed.                                                                                                           | zod both.                                                                                                                                                                          |
| F045 | Error handling | `supabase/functions/ingest-worker/index.ts:51`                                                                | Medium   | S   | Raw `PostgrestError` and `ZodError` escape the `ApiError` envelope and become generic 500s. `dream-worker:40` likewise.                                                                                                                     | Wrap both.                                                                                                                                                                         |
| F046 | Performance    | `supabase/functions/_shared/jobs/dream_entities.ts:50`                                                        | Medium   | M   | Two sequential round trips per entity, up to 200 for a 100-entity answer, inside a 45 second budget, when both helpers already take arrays.                                                                                                 | One upsert, one insert.                                                                                                                                                            |
| F047 | Performance    | `supabase/functions/_shared/jobs/dream_connections.ts:74`                                                     | Medium   | M   | Three sequential awaits per document with one embedding call each, twenty deep: 60 round trips where 2 plus the searches would do.                                                                                                          | Batch the reads and the embeddings.                                                                                                                                                |
| F048 | Performance    | `supabase/functions/_shared/jobs/sync.ts:93`                                                                  | Medium   | S   | The relabel loop is `O(n²)` membership testing with one sequential PATCH per document.                                                                                                                                                      | Filter to changed refs, one upsert.                                                                                                                                                |
| F049 | Security       | `supabase/functions/_shared/http.ts:20`                                                                       | Medium   | S   | `clientIp` takes the rightmost `X-Forwarded-For`, which on the deployed runtime is likely the platform proxy, making every per-IP bucket one global bucket.                                                                                 | Measure on a deployed function; drop the IP rules if it is a fixed hop.                                                                                                            |
| F050 | Correctness    | `supabase/functions/_shared/sources/common.ts:104`                                                            | Medium   | S   | Two implementations of the refresh grant, neither knowing what the other knows. Latent until Slack rotation is enabled.                                                                                                                     | Route `refreshWithTokenEndpoint` through the quirks.                                                                                                                               |
| F051 | Consistency    | `web/app/(app)/chat/actions.ts:26`, `settings/actions.ts:18`                                                  | Medium   | S   | Zod parsing happens outside `withSession` in two action files and inside in two others, so a signed-out caller with bad input gets different answers.                                                                                       | Parse inside, always.                                                                                                                                                              |
| F052 | Correctness    | `web/app/(app)/documents/actions.ts:73`                                                                       | Medium   | S   | The `usage_events` insert result is discarded, and it is the row the document meter is computed from.                                                                                                                                       | Check the error.                                                                                                                                                                   |
| F053 | Consistency    | `web/app/(app)/admin/billing/page.tsx:60`                                                                     | Medium   | S   | Raw `process.env` read, a third convention alongside parsed env and parsed billing config, and a second source of truth for "is Stripe configured".                                                                                         | `isBillingConfigured()` in `lib/billing/config.ts`.                                                                                                                                |
| F054 | Dead code      | `web/components/ui/{badge,card,separator,sonner,tabs,tooltip}.tsx`                                            | Low      | S   | Six primitives with zero importers, plus four unused dependencies.                                                                                                                                                                          | Delete both.                                                                                                                                                                       |
| F055 | Dead code      | `web/hooks/use-infinite-query.ts` and 60 sites                                                                | Low      | S   | 32 unused exports and 29 unused exported types across the app.                                                                                                                                                                              | Prune.                                                                                                                                                                             |
| F056 | Dead code      | `supabase/functions/_shared/jobs/budget.ts:46`                                                                | Low      | S   | `remainingMs` and `isSpent` are implemented and called nowhere, tests included.                                                                                                                                                             | Delete.                                                                                                                                                                            |
| F057 | Dead code      | `supabase/functions/_shared/sources/contract.ts:52`                                                           | Low      | S   | `ScopeOption.kind` is set by four drivers and read by nobody; `scopeOptionSchema.url` is stored and never written.                                                                                                                          | Drop both.                                                                                                                                                                         |
| F058 | Consistency    | `supabase/functions/_shared/jobs/claim.ts:128`                                                                | Low      | S   | The connection is written to `syncing` twice per pass, a second round trip and a second realtime broadcast.                                                                                                                                 | Have the claim clear `status_detail`; delete the second call.                                                                                                                      |
| F059 | Docs           | `supabase/functions/_shared/model_client.ts:64`                                                               | Low      | S   | The comment says the usage insert is fire and forget; it is awaited on both paths.                                                                                                                                                          | Drop the await or fix the comment.                                                                                                                                                 |
| F060 | Consistency    | `supabase/functions/_shared/jobs/ingest.ts:100`                                                               | Low      | S   | Four `.update()` calls ignore their result; `finish` is the one that matters, because a failed terminal write leaves the job `running`.                                                                                                     | Check them.                                                                                                                                                                        |
| F061 | Config         | `.env.example`                                                                                                | Low      | S   | Six variables production code reads were undocumented. Fixed in `c1966f1`.                                                                                                                                                                  | Done.                                                                                                                                                                              |
| F062 | Architecture   | `web/lib/connections/edge.ts:12`                                                                              | Low      | S   | An unowned, undated TODO in a codebase whose rules ban them, and `lib/dreams/edge.ts` imports from a module named for another feature.                                                                                                      | Move to `lib/edge/invoke.ts`.                                                                                                                                                      |
| F063 | Duplication    | `web/lib/dreams/queries.ts:18`, `connections/queries.ts:30`, `spaces/spaces.ts:57,79`                         | Low      | S   | Four functions list spaces, four column sets, three error conventions.                                                                                                                                                                      | One `listSpaces(client, columns)`.                                                                                                                                                 |
| F064 | Duplication    | `web/components/connections/connect-panel.tsx:154`                                                            | Low      | S   | Two "pick a space" controls: a raw `<select>` with hand-written classes and the shadcn Select, plus a shadowing `SpaceOption` type.                                                                                                         | Use the Select in both; import the type.                                                                                                                                           |
| F065 | Consistency    | `web/lib/analytics/access.ts:34`, `web/app/api/stripe/session.ts:50`                                          | Low      | S   | Two independent admin checks with different result shapes and different failure handling.                                                                                                                                                   | One gate.                                                                                                                                                                          |
| F066 | Architecture   | `web/lib/openai/call.ts:58`                                                                                   | Low      | S   | The one circular dependency. Harmless as built, because the back edge is a dynamic import, but unnecessary: the only thing imported back is a pure switch.                                                                                  | Move `usageKindFor` to its own module.                                                                                                                                             |
| F067 | Docs           | `docs/decisions.md`                                                                                           | Low      | S   | The Stripe webhook was built as an Edge Function rather than the route the spec lists, which is defensible and unrecorded. `decisions.md` exists so a reader can tell a deliberate deviation from a gap.                                    | One line.                                                                                                                                                                          |
| F068 | Docs           | `docs/limits.md:161`                                                                                          | Low      | S   | Describes a pg_cron plus pg_net scheduler at different intervals from the Vercel crons that now exist.                                                                                                                                      | Reconcile.                                                                                                                                                                         |
| F069 | Consistency    | `supabase/functions/_shared/sources/linear.ts:251`                                                            | Low      | S   | `DISPLAY_NAME` is passed as the `provider` argument, so one log line prints a display name where every other prints a slug.                                                                                                                 | Split the parameter.                                                                                                                                                               |
| F070 | Consistency    | `web/lib/dreams/status.ts:2`                                                                                  | Low      | S   | `StatusTone` is imported from `lib/connections`, so dreams depends on connections for a design-system type neither owns.                                                                                                                    | Move it next to `StatusPill`.                                                                                                                                                      |
| F071 | Correctness    | `web/components/documents/upload-panel.tsx:19`                                                                | High     | S   | **New, found fixing F002. Fixed.** The dropzone offered `.docx` and `extract.ts` has no extractor for it, so a Word document uploaded, reported success, and failed three jobs later with a message about a mime type.                      | Done. One list in `web/lib/documents/uploads.ts`, and `scripts/check-upload-types.mjs` fails the build when it and the extractor's table disagree.                                 |

## Top five: if you fix nothing else

**F001, the cross-organization space move.** This is the only finding that
breaks the product's central promise. Reproduced:

```sql
set local role authenticated;
set local request.jwt.claims to '{"sub":"<member>","role":"authenticated"}';
update public.spaces set org_id = '<another org>' where id = '<my space>';
-- moved: 1
update public.spaces set kind = 'org' where id = '<my team space>';
-- kindnow: org
```

The fix is the same shape as the `space_id` work already in the tree:

```sql
revoke update on public.spaces from authenticated;
grant update (name, dreaming_enabled) on public.spaces to authenticated;

alter table public.spaces add constraint spaces_id_org_key unique (id, org_id);
alter table public.documents
  add constraint documents_space_in_org
  foreign key (space_id, org_id) references public.spaces (id, org_id) on delete cascade;
-- and the same for chunks, connections, ingest_jobs
```

**F002, the storage path.** One line closes it and a better fix removes the
class:

```ts
storagePath: z.string().regex(new RegExp(`^${spaceId}/`)),
```

**F003 and F004 together, the retry story.** Right now a transient failure is
terminal, a crashed worker is retired rather than retried, and the SQL comment
promising three attempts describes something no code path can reach. Delete the
JS sweep, write `queued` for a recoverable `SourceError`, and the cap becomes
real.

**F008, the eleven un-revoked functions.** Not current exposure. It is the next
regeneration, and it is the drift the lessons file already warns about.

**F009 and F010, the two dead meters.** A plan limit enforced by nothing and a
panel that says every document is dead. Both are one insert away.

## Quick wins

- [ ] F054 Delete six unused primitives and four unused dependencies
- [ ] F028 Parse the OTP `type` instead of asserting it
- [ ] F052 Check the `usage_events` insert result
- [ ] F036 Return a typed failure from the rate limiter
- [ ] F059 Fix the fire-and-forget comment that is awaited
- [ ] F056 Delete `remainingMs` and `isSpent`
- [ ] F057 Drop `ScopeOption.kind` and `scopeOptionSchema.url`
- [ ] F015 Delete the dead `refreshTokens`
- [ ] F029 Order and limit the embedded `ingest_jobs`
- [ ] F022 Wrap `getSessionContext` in `cache()`
- [ ] F066 Break the circular import
- [ ] F067 Record the webhook deviation

## Things that look bad and are actually fine

Kept from all three readers, because the reasoning is worth more than the list.

- **`requireWorkerCaller` returning early on unequal lengths.** The key length
  is not secret and comparing unequal buffers would read past the shorter one.
  Constant time for the property that matters.
- **The service role bypassing RLS in every handler.** Each one checks
  membership itself through `requireSpaceMembership`, which reads
  `space_members` directly, because `auth.uid()` is nobody under that key.
- **`dream_connections.ts:51` calling `search` outside the space-scoped
  writer.** Two independent checks rather than one: `space_filter` is the run's
  own space, and `documentsByIds` drops a foreign id before it reaches
  `insertLinks`.
- **`asRecord` returning `{}` rather than throwing.** A documented parse
  default so a provider's bad day is not a 500, not a swallowed error.
- **`maybePrune` sampling with `Math.random()`.** Housekeeping fired with
  `void Promise.allSettled`; determinism would make one unlucky caller pay.
- **`connections-callback` redirecting on every failure.** The caller is a
  browser mid-redirect and a JSON 500 in the address bar is worse.
- **Four drivers each holding their own reconnect message.** The display name is
  interpolated, the wording differs by design, and `leak_test.ts:220` enforces
  the property that matters across all four.
- **`report()` logging and continuing in `lib/openai/call.ts`.** A telemetry
  write must not turn a delivered answer into a failed request.
- **The `flatMap` drops in both view models.** They handle a torn read across two
  queries, and RLS already guarantees the pairing.
- **`lib/supabase/middleware.ts` listing `/api/stripe` as public.** Those routes
  skip the proxy and then do a stronger check themselves.
- **`page.tsx` and `components/ui/**` excluded from coverage.** Both arguments
  hold. The exclusion that is not argued anywhere is `hooks/**`, which is F025.
- **No side-stripe borders, no nested cards, no gradient text.** Looked for the
  banned patterns specifically. `grep border-l-|border-r-` across `*.tsx`
  returns nothing. The layout work is clean; the design findings are all
  confined to `components/ui/*`.
- **`pdf.ts` hand-rolling PDF parsing.** A megabyte of pdfjs and a cold start
  per ingest is the worse trade, and the caps bound a hostile file.

## Open questions

1. **F033, the compat aliases.** The spec says rewrite the primitives onto
   semantic tokens. What makes the two hand-edited hooks safe is that a lint
   rule fires when `shadcn add` overwrites them; there is no equivalent tripwire
   for token classes. Add a check that fails when `compat.css` disappears while
   those classes are in use and record a deliberate deviation, or do the rewrite
   and accept it can be silently reverted?
2. **F021, retrieved content at system role.** Moving to user role is one line,
   but the `[n]` citation discipline currently rides on a system message
   adjacent to the passages, and there is no eval harness to say whether the
   safer shape costs answer quality.
3. **F002, narrow or correct.** The regex is one line. Deriving the path
   server-side is correct but requires agreeing a naming scheme with a vendored
   hook, and forces a decision between versioning and collision on re-upload.
4. **Vercel crons or pg_cron.** Now implemented as Vercel crons. pg_cron keeps
   scheduling inside Supabase, which is the keynote's own argument and works for
   a stranger cloning the repo with no Vercel account.
5. **F017, the admin N+1.** A security-definer function returning id and email
   for an org is the clean fix but puts auth data behind a `public` function.
