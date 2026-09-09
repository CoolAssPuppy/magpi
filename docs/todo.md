# Recall: progress ledger

One ledger, checkable items. A phase is done when it works end to end, has a
test, and is committed.

## Phase 1: Scaffold

- [x] pnpm workspace, Node 22, `.nvmrc`
- [x] Next 16 App Router in `/web`
- [x] Doppler project `supabase-recall-demo`, `doppler.yaml` pinned
- [x] Supabase design tokens vendored, `scripts/sync-tokens.mjs`, UPSTREAM SHA
- [x] Theme switching with `next-themes`, three themes, `data-theme` on `<html>`
- [x] `supabase/schemas/` declarative model, first generated migration
- [x] Storage policies and realtime publication as hand-written migrations
- [x] Generated database types committed
- [x] vitest with coverage thresholds
- [x] Gate scripts, workflow contract check, light gate in CI
- [x] Supabase agent skills installed at project scope
- [x] shadcn initialised against the Supabase Library registry
- [x] `impeccable` skill at `.agents/skills/impeccable`
- [x] Table privileges declared in `95_grants.sql`
- [x] Function and column privileges as a hand-written migration
- [x] Raw color check, and the gate step that runs it

## Phase 2: Auth and organizations

- [x] `password-based-auth-nextjs` and `social-auth-nextjs` blocks
- [x] Sign up, sign in, callback, sign out
- [x] Org and personal space created by a trigger on signup
- [x] Invite and accept
- [x] Auth lifecycle journey in Playwright

## Phase 3: Spaces

- [x] Personal auto-created, team and org spaces
- [x] Membership management
- [x] pgTAP proving isolation, 170 assertions across nine files

## Phase 4: Upload and ingest

- [ ] `dropzone-nextjs` to Storage
- [ ] Extract, chunk, embed, write chunks
- [ ] Realtime progress and visible failures
- [ ] Edge Function ceiling measured, written into `docs/limits.md`

## Phase 5: Search

- [x] Hybrid search RPC
- [ ] Recall measured at 10k, 100k, 1M with a 1 percent filter, in `docs/retrieval.md`

## Phase 6: Chat

- [x] Streaming route handler, citations resolved on read
- [x] Question condensing, conversation titling, history sidebar
- [x] Two-user permission lifecycle journey
- [x] Dropped-connection test: the question survives, no orphaned answer

## Phase 7: Connections

- [ ] magpi OAuth flow ported: begin, callback, claim
- [ ] Notion end to end

## Phase 8: Remaining providers

- [ ] Linear
- [ ] Slack
- [ ] Google Drive

## Phase 9: Token refresh and incremental sync

- [ ] `refresh()` called, tested against an expired token
- [ ] Cursors per provider
- [ ] Connection status visible in the UI

## Phase 10: Dreaming

- [ ] Entities
- [ ] Digest
- [ ] Connections
- [ ] Per space, cited, visible, switchable off

## Phase 11: Admin analytics

- [x] Ingest health, search volume and latency, top questions, dead content, usage
- [x] Storage metered through usage_events rather than a scan

## Phase 12: Billing

- [x] Checkout and portal as route handlers
- [x] Plan limits enforced in the database
- [ ] Webhook: price id is never read, so every paying subscription becomes Team
- [ ] Webhook: three schemas stricter than Stripe's real payloads, each a permanent 400

## Phase 13: MCP stub

- [ ] `supabase/functions/mcp-server/` with `whoami`, `docs/mcp.md`

## Phase 14: Polish

- [ ] Sample corpus
- [ ] Deploy button
- [ ] README
- [ ] Five-minute clone-to-answer path

## Blockers

**The Stripe webhook does not read the price id.** `supabase/functions/_shared/billing.ts`
maps any paying status to the Team plan, and `SB_STRIPE_PRICE_TEAM` appears
nowhere under `supabase/functions/`. Three further schema fields are stricter
than Stripe's real payloads and turn a recoverable event into a permanent 400:
`customer` and `subscription` reject an expanded object, `checkout.session.completed`
ignores `client_reference_id`, and `quantity` is required where Stripe omits it
on metered items. With the edge-functions workstream.

**The Edge Function ceiling is unmeasured.** Every row in the table in
`docs/limits.md` reads `not measured`. It needs the real runtime and a real
corpus, and it is a keynote slide.

**Recall at scale is unmeasured.** `docs/retrieval.md` has the method written
down and no numbers. No latency claim goes on a slide before it does.

## Post-demo

Things deliberately out of scope for "done", recorded so they are not
rediscovered as gaps.

- Penetration testing, SOC 2 controls
- SSO and SCIM
- Abuse and rate limiting beyond the per-user windows already specified
- i18n beyond a string catalog
- Accessibility beyond what the Supabase components give us
- Load targets above what the keynote needs
