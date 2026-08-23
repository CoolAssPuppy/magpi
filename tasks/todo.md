# Magpi build plan

A desk companion for the Pimoroni Tufty 2350. Two badge apps, one gateway, one
website.

## 1. Repo skeleton

- [x] pnpm workspace, root package.json, .nvmrc, .gitignore
- [x] prettier and prettier ignore
- [x] husky pre-push hook
- [x] `scripts/pre-push-gate.mjs` with `--strict`
- [x] `.github/workflows/ci.yml`
- [x] Prove `pnpm gate` runs and fails loudly on a deliberate error

## 2. Shared constants

- [x] `device-constants.json` at the repo root
- [x] `scripts/gen-device-constants.mjs` writes three files
- [x] `pnpm constants:check` in the gate and CI

## 3. Design in Paper

- [x] Badge artboards: five Notifier pages
- [x] Badge artboards: five Notifier lifecycle states
- [x] Badge artboards: six Pomodoro states
- [x] Homepage artboards, both themes, origami magpies
- [x] Website artboards with empty, loading, and error states
- [x] Export a PNG per artboard to `design/`
- [x] Write `docs/DESIGN.md`

## 4. Database

- [x] Initial schema, RLS policies, rate limits, profile trigger, oauth states
- [x] page_configs, pomodoro_settings, provider_cache
- [x] Realtime publication: badges, page_configs, connections
- [x] `api/supabase/tests/rls.test.sql` pgTAP green

## 5. Auth and shell

- [x] Next.js 16 app, Tailwind 4, shadcn
- [x] Token layer: primitives, semantics, components
- [x] Token test: no raw colour, radius, or duration outside primitives
- [x] GitHub sign in, session, layout, both themes, theme toggle

## 6. Pairing end to end

- [x] device-start, device-poll, device-approve
- [x] SDK copied and stripped of conference branding
- [x] `/link` page with QR and code
- [ ] Pair a real badge (needs the hardware)

## 7. Gateway skeleton

- [x] `GET /gateway/desk` returning a hardcoded envelope
- [ ] Notifier renders it on hardware (needs the hardware)

## 8. Connections

- [x] providers table with `kind`
- [x] OAuth begin, callback, claim
- [x] API key form, encryption
- [ ] Connect Google and Vercel for real (needs registered OAuth apps)

## 9. The five pages

- [x] next_thing: builder, device page, web preview, tests
- [x] day_shape: builder, device page, web preview, tests
- [x] deploys: builder, device page, web preview, tests
- [x] counters: builder, device page, web preview, tests
- [x] one_number: builder, device page, web preview, tests

## 10. The pages screen

- [x] Enable, drag to reorder, per-page settings
- [x] Live previews at true size
- [x] `preview-fixtures.json` generated from the Python page modules

## 11. Pomodoro and settings

- [x] Pomodoro machine, view, firmware boundary
- [x] `/settings` writes intervals through Notifier

## 12. Tests and coverage

- [x] E2E tests
- [x] Coverage: web 95, API 90, device 95
- [ ] Full gate green (`pnpm gate --strict`)

## 13. Observability

- [x] Provider-agnostic analytics library with a PostHog provider

## 14. Docs

- [x] `docs/finish-dev-setup.md`
- [x] `device/DEPLOY.md`

## 15. Ship

- [x] Package both apps (`pnpm badge:package`, 27 files, dry run verified)
- [x] Write `badge/config.json` from the environment, and refuse without it
- [x] Badge icons at 24 square, RGBA, on a transparent ground
- [x] Rejoin the radio on a backoff instead of sitting on "No network"
- [ ] Install them on the badge (needs the hardware)

## Review

To be written when the build is done.
