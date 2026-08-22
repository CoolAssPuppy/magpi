# Magpi build plan

A desk companion for the Pimoroni Tufty 2350. Two badge apps, one gateway, one
website. Built from the brief in `docs/BRIEF.md`.

## 1. Repo skeleton

- [ ] pnpm workspace, root package.json, .nvmrc, .gitignore
- [ ] prettier and prettier ignore
- [ ] husky pre-push hook
- [ ] `scripts/pre-push-gate.mjs` with `--strict`
- [ ] `.github/workflows/ci.yml`
- [ ] Prove `pnpm gate` runs and fails loudly on a deliberate error

## 2. Shared constants

- [ ] `device-constants.json` at the repo root
- [ ] `scripts/gen-device-constants.mjs` writes three files
- [ ] `pnpm constants:check` in the gate and CI

## 3. Design in Paper

- [ ] Badge artboards: five Notifier pages
- [ ] Badge artboards: five Notifier lifecycle states
- [ ] Badge artboards: six Pomodoro states
- [ ] Homepage artboards, both themes, origami magpies
- [ ] Website artboards with empty, loading, and error states
- [ ] Export a PNG per artboard to `design/`
- [ ] Write `docs/DESIGN.md`

## 4. Database

- [ ] Initial schema, RLS policies, rate limits, profile trigger, oauth states
- [ ] page_configs, pomodoro_settings, provider_cache
- [ ] Realtime publication: badges, page_configs, connections
- [ ] `api/supabase/tests/rls.test.sql` pgTAP green

## 5. Auth and shell

- [ ] Next.js 16 app, Tailwind 4, shadcn
- [ ] Token layer: primitives, semantics, components
- [ ] Token test: no raw colour, radius, or duration outside primitives
- [ ] GitHub sign in, session, layout, both themes, theme toggle

## 6. Pairing end to end

- [ ] device-start, device-poll, device-approve
- [ ] SDK copied and stripped of conference branding
- [ ] `/link` page with QR and code
- [ ] Pair a real badge

## 7. Gateway skeleton

- [ ] `GET /gateway/desk` returning a hardcoded envelope
- [ ] Notifier renders it on hardware

## 8. Connections

- [ ] providers table with `kind`
- [ ] OAuth begin, callback, claim
- [ ] API key form, encryption
- [ ] Connect Google and Vercel for real

## 9. The five pages

- [ ] next_thing: builder, device page, web preview, tests
- [ ] day_shape: builder, device page, web preview, tests
- [ ] deploys: builder, device page, web preview, tests
- [ ] counters: builder, device page, web preview, tests
- [ ] one_number: builder, device page, web preview, tests

## 10. The pages screen

- [ ] Enable, drag to reorder, per-page settings
- [ ] Live previews at true size
- [ ] `preview-fixtures.json` generated from the Python page modules

## 11. Pomodoro and settings

- [ ] Pomodoro machine, view, firmware boundary
- [ ] `/settings` writes intervals through Notifier

## 12. Tests and coverage

- [ ] E2E tests
- [ ] Coverage: web 95, API 90, device 95
- [ ] Full gate green

## 13. Observability

- [ ] Provider-agnostic analytics library with a PostHog provider

## 14. Docs

- [ ] `docs/finish-dev-setup.md`
- [ ] `device/DEPLOY.md`

## 15. Ship

- [ ] Package both apps and install them on the badge

## Review

To be written when the build is done.
