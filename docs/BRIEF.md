# Magpi

A desk companion for the Pimoroni Tufty 2350. Two badge apps, one gateway, one
website. Build it end to end in one pass.

## The name

A magpie collects bright things from everywhere and brings them to one place,
which is what the gateway does with Google, Vercel, PostHog and Linear. Dropping
the "e" leaves the Pi the thing runs on. It also decides the palette: magpies are
black and white with an iridescent blue-green sheen. The two themes are the bird.
The accent is the sheen.

Use "Magpi" in UI copy, page titles, and the web app name. Lowercase `magpi` for
the repo, the package names, and the Supabase project.

## Fill this in before you paste

| Value | Yours |
| --- | --- |
| Repo path | https://github.com/CoolAssPuppy/magpi |
| GitHub repo slug | `magpi_______` |
| Supabase project ref | `bxsgodfrrllijpmimsgs_______` |
| Supabase URL | NEXT_PUBLIC_SUPABASE_URL=https://bxsgodfrrllijpmimsgs.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_2mGoZ-Ycap2-ozm-0UUytg_GDwTiwjs` |
| Doppler project / config | `magpi` / `dev` |

Do not stop to ask for any of these. If one is missing, read it from the repo
(`git remote -v`, `api/supabase/config.toml`, `doppler configure get`) and carry
on.

## 0. The brief

A Pimoroni Tufty 2350 badge sits on a desk, plugged into USB, all day. It runs two
apps:

- **Notifier.** Always up. Joins WiFi once, polls one endpoint, and pages between
  five screens with UP and DOWN: what is next in the calendar, the shape of the
  day, deploy state, unread counts, and one number that matters.
- **Pomodoro.** Zero network. Opens instantly. A proper Pomodoro timer with
  physical buttons and the case LEDs.

A website is where you sign in with GitHub, connect third-party accounts, choose
which Notifier pages are on and in what order, configure each one, set the
Pomodoro intervals, and pair a badge.

A Supabase gateway sits between them. The badge holds one pairing token and
nothing else. Every provider credential lives on the server, encrypted.

### Why the apps are split this way

A cold WiFi join on this hardware takes 17 to 21 seconds. An app that touches the
radio pays that on every open. So the split is by whether the app needs the
network, not by topic. Notifier joins once and stays up. Pomodoro never joins, so
it opens in under a second, which matters because you open it at the moment you
decide to start working.

Pomodoro is still configured from the website. Notifier receives the Pomodoro
settings in the payload it is already fetching and writes them to
`/state/pomodoro.json` using `sb.store`. Pomodoro reads that file at open. If the
file is missing it uses the defaults and works anyway.

## 1. How to work

**Test-driven development, without exception.** Every line of production code is
written in response to a failing test. Write the test, watch it fail, write the
code, watch it pass. This applies to Python, TypeScript, and SQL.

**Plan first.** Write the plan to `tasks/todo.md` as checkable items before you
write code. Update it as you go. Add a review section at the end.

**Verify before claiming done.** Run the suite. Show the output. A step you
skipped is a step you say you skipped.

**Do not stub.** If something is genuinely blocked, finish everything else in
full and say plainly what is left and why. Do not leave a TODO where a feature
was promised.

**No `any` in TypeScript.** Strict mode. Explicit parameter and return types.
The build must pass in Vercel's environment.

**Follow the conventions of each community.** Next.js 16 App Router idioms,
React 19, Tailwind 4, Supabase, shadcn, and modern Python as those communities
actually write them. Do not invent a house style on top of a framework that
already has one.

**DRY, religiously.** The same rule written twice is a bug with a delay on it.
Write it once, test it once, import it everywhere. This applies across the
language boundary too: anything both the badge and the website must agree on is
generated from one source, never typed twice.

**Clean, organized, refactored as you go.** Files under 300 lines. Functions
under 40. One responsibility per file, class, and function. Imports grouped
external, then internal, then relative, with a blank line between groups.
Descriptive names, never `data`, `info`, or `temp`. Booleans start with `is`,
`has`, `can`, or `should`. Refactor while the tests are green, not in a pass at
the end that never happens.

**No unnecessary comments.** A comment restating the code is noise, so delete
it. Comment only a reason that cannot be recovered by reading the code, and keep
it to a line or two. The reference repo comments far more heavily than you
should: take its reasons, not its length.

**Device machines are pure Python.** No drawing, no network, no SDK import, no
firmware globals. They are handed a `fetch` callable and a clock. They are fully
testable off the badge.

**Fakes must refuse what the firmware refuses.** Every device bug in the
reference project was code acting on a firmware primitive that the test fake
returned a benign default for. When code acts on a firmware reading, especially
one that mutates durable state, test the adversarial reading, not the happy
default.

**Reader and writer of a persisted file share one path constant.** One module
owns the path, the other imports it, and a test asserts the shipped defaults are
equal. Override-based tests cannot catch a default that drifted.

**Writing rules for every word you produce**, in code comments, UI copy, commit
messages, and docs: no emoji, no em dashes, sentence case headers, plain English.
Never write "This isn't X, it's Y" or any negation-contrast in any costume. No
justification clauses in user-facing copy. No reassurance for an emotion the
reader has not expressed. Keep code comments terse.

**Commit messages are short.** Subject plus two or three lines. Never an essay.

## 2. The reference implementation

A working badge platform lives at:

```
/Users/prashant/Developer/supabase/select-badge
```

Read it before you design anything. It solves most of the hard parts already and
you should copy rather than reinvent. Read `CLAUDE.md` at its root first: the
"Lessons" section is a list of bugs already paid for.

### Copy close to verbatim

**Device SDK**, from `badge-platform/device/badge-sdk/sb/`:

| File | What it gives you |
| --- | --- |
| `app.py` | The frame loop. `BadgeApp`, `Env`, `RunSpec`. Pairing handover, WiFi settle, the B-hold escape, battery reading. |
| `net.py` | `DevicePort`, WiFi, token file, cert pinning, firmware version. |
| `pairing.py` | The device-code pairing state machine. |
| `poller.py` | Interval gating with exponential backoff and `retry_after` support. |
| `qr.py` | A full QR encoder. `qr_matrix(text)` takes any string. |
| `store.py` | Atomic per-app JSON under `/state`. Survives power loss mid-write. |
| `ui.py` | Palette, panels, meters, block text, status bar, hold indicator, ROM font names. |
| `images.py` | Picture loading and drawing. |
| `lights.py` | The four case LEDs, degrading to nothing on a firmware without them. |

Strip `brand.py` and the pairing screen copy down to your own product. Keep the
layout maths: the QR band sizing and the 4-module quiet zone are correct and
being frugal there costs a scan.

**Gateway and OAuth**, from `badge-platform/api/supabase/functions/`:

| File | What it gives you |
| --- | --- |
| `_shared/oauth.ts` | PKCE authorization flow, 356 lines, already correct. |
| `_shared/crypto.ts` | Token encryption at rest. |
| `_shared/provider_tokens.ts` | Token refresh, expiry, failure handling. |
| `_shared/providers.ts` | The provider registry. |
| `_shared/auth.ts` | `requireUser`, verified against the auth server rather than decoded locally. |
| `_shared/errors.ts`, `http.ts`, `env.ts`, `db.ts`, `validate.ts` | Error shapes, request parsing, env reading, typed queries, input validation. |
| `_shared/pairing.ts`, `pairing_port.ts` | Device-code pairing, server side. |
| `device-start/`, `device-poll/`, `device-approve/` | The three pairing endpoints. |
| `connections-begin/`, `connections-callback/`, `connections-claim/` | The OAuth endpoints. |

**Migrations**, from `badge-platform/api/supabase/migrations/`: take the shape of
`20260720120000_initial_schema.sql` (the `connections` and `providers` tables),
`20260720120100_rls_policies.sql`, `20260720120200_rate_limits.sql`,
`20260720120300_profile_on_signup.sql`, `20260720120400_oauth_states.sql`, and
`20260721150000_realtime.sql`. Read the comments in `oauth_states.sql`: the
single-use `consume_oauth_state` function and the deliberate absence of any
policy on that table are both correct and both worth understanding before you
copy them.

**Web**, from `badge-platform/web/`: `lib/supabase/*`, `lib/rows.ts` (Zod
`parseRows`, so a surprising row never becomes a rendered lie), `lib/db.ts`,
`lib/actions/with-session.ts`, `lib/redirects.ts` (`safeNextPath`, which is what
stops an open redirect), `lib/env.ts`, `lib/rate-limit.ts`,
`components/live-region.tsx`, `app/auth/`, `app/login/`,
`app/connections/complete/`.

**Scripts**, from `scripts/`: `pre-push-gate.mjs`, `gen-device-constants.mjs`,
`python-tests.mjs`, `python-coverage.mjs`, `db-test.mjs`, `package-badge.mjs`,
`device-suites.mjs`, `device-config.mjs`, `e2e-full.mjs`, `pick-port.mjs`,
`dev-web.mjs`. Also `.github/workflows/ci.yml` and `.husky/pre-push`.

### Do not copy

Slides, polls, trivia, sparkle, MAD, the admin surfaces, avatars, the Twitter and
Customer.io modules, the Select brand lockups, and the Select design tokens in
`web/globals.css`. None of it belongs in a personal desk tool, and the design
tokens in particular would make this look like a conference site.

## 3. Design first, in Paper

Before you write application code, design the screens using the **Paper MCP**.
The human will have it connected. Do not skip this and do not design in code.

### Badge artboards, each exactly 320 by 240

Notifier, one per page:

1. Next thing
2. Day shape
3. Deploy state
4. Counters
5. One number

Notifier, one per lifecycle state: connecting, no network, unpaired, stale data,
first run with nothing configured.

Pomodoro, one per state: idle, working, short break, long break, set complete,
abandon confirmation.

### Homepage artboards

The public homepage gets the most design attention of any screen, because it is
the only one a stranger sees. Design it around **abstract origami magpies**: birds
built from folded paper planes, not illustrations of birds.

Folded paper is flat planes meeting at hard creases, so each shape is two or
three flat values, a lit face and a shadowed face, with a crease line between
them. No gradients, no soft shadows, no rendered 3D. The bird reads at a glance
and falls apart into geometry when you look closely.

Design at least: the hero with the folded bird, a section showing the device with
a real page on its screen, a section on what connects to what, and the footer.
Design the hero in both themes, because the folded bird has to work as white
paper on black and as black paper on white.

The fold is also the motion vocabulary. Things open by unfolding along a crease
and close by folding back, quickly and with a hard stop, the way paper does.

### Website artboards

Sign in, dashboard, pages (configure and reorder, with the live previews),
connections list, connection detail for an OAuth provider, connection detail for
an API-key provider, link a badge, settings. Plus the empty, loading, and error
state of each one.

### What comes out

Export a PNG per artboard into `design/`. Then write `docs/DESIGN.md` recording
the token values, the type scale, the motion vocabulary, and every deliberate
deviation with its reason. Follow the format of
`badge-platform/web/DESIGN.md` in the reference repo. That file is what stops
the fifth screen you build from drifting back to defaults.

## 4. Design direction

Use **shadcn/ui** for every component. Do not let it look like a shadcn app.

### Where the personality comes from

This is a control panel for a physical object with a 320 by 240 screen, four
white LEDs, and five chunky buttons. That is the entire direction. It is
specific, it belongs to this product only, and it points at a real feature.

**The feature that supplies it: live previews at true size.** The configure page
renders each Notifier page at exactly 320 by 240, one to one, in the badge's real
palette, with the real ROM font metrics taken from `ui.py`:

```
ark 11px   sins 12   badgeware 14   memo 15   smart 16   badgewaremax 20
```

You reorder pages by dragging small screens. The four LEDs light in the preview
when a page uses them. It is the enjoyable part of the page and the most useful
part of the page at the same time, so it survives a deadline.

### Build the token system first, before a single component

The biggest tell of a shadcn app is an untouched `globals.css`. Build a complete
token system before you use one component, and consume it everywhere. Change
these first:

- **Radius is not uniform.** shadcn ships one radius on everything. Define a
  scale where some things are square and some are properly round, and use it
  deliberately.
- **The palette is the bird.** Black, white, and an iridescent accent that runs
  blue-green into violet. Not zinc, not slate, not neutral. The accent appears
  where something is live or selected, never as a background wash.
- **Two typefaces, and neither is Inter for headings.** A pixel or mono display
  face for numbers, headings, and anything mirroring the badge. A proper text
  face for prose. Tabular figures everywhere a number can change.
- **Borders vary.** A 1px muted border on every card is the second biggest tell.
- **Denser than the shadcn blocks.** This is a control panel, not a marketing
  dashboard.
- **Icons are drawn, not imported.** The badge has no icon set. A lucide glyph on
  every list row is a tell. Draw the shapes this product actually needs, folded
  from the same planes as the homepage birds.

### The colours are a real magpie

Take them from the bird's actual markings rather than inventing a brand palette:
glossy black on the head, breast and back; white belly and shoulder patches;
white primaries; and an iridescent blue-green running into violet across the
wing and tail.

That gives four primitives and nothing else:

| Primitive | From |
| --- | --- |
| `ink` | The glossy black of the head and back |
| `chalk` | The white belly and shoulder patch |
| `sheen` | The blue-green iridescence of the wing |
| `violet` | Where that iridescence turns on the tail |

Neutrals are derived from `ink` and `chalk`, never picked separately. `sheen` is
the accent and `violet` is the second accent, used for a selected or live state.
An accent never becomes a background wash: on the bird the iridescence is a
narrow band on a black wing, and that is the proportion to keep.

### The token system

Three layers, and code only ever touches the third.

1. **Primitives.** The four colours above with their numeric ramps, plus the raw
   type sizes, spacing steps, radii, durations, and easings. One file. Raw values
   appear here and nowhere else in the repository.
2. **Semantics.** `background`, `surface`, `raised`, `ink`, `ink-muted`,
   `border`, `border-strong`, `accent`, `accent-ink`, `positive`, `caution`,
   `critical`, `focus`. Each maps to a primitive. This is the layer the two
   themes remap, and it is the only layer they remap. A theme never redefines a
   primitive.
3. **Components.** shadcn components read semantic tokens only.

Everything is exposed as CSS custom properties through Tailwind 4's `@theme`, so
one vocabulary reaches Tailwind classes, the shadcn components, and any inline
style.

Also tokenise what most projects leave loose, because these are exactly the
values that drift: the spacing rhythm, the radius scale, the type scale with its
line heights, border widths, motion durations, and easing curves. The badge
preview has its own small token group for the device palette and the ROM font
metrics, generated from `device-constants.json`.

**Enforce it with a test.** A test walks `web/` and fails on any hex colour,
`rgb()`, `hsl()`, raw pixel radius, or hardcoded duration outside the primitives
file. Consistency that depends on remembering is consistency that ends after the
fourth screen.

### The homepage

The only page a stranger sees, and the one that decides whether this looks like a
template. Build it from the abstract origami magpies designed in Paper: flat
folded planes, hard creases, two or three values per shape, no gradients and no
soft shadows.

`/` is public. Signed-in visitors are redirected to `/dashboard`.

The fold is the motion vocabulary for the whole site. Panels, menus and sheets
open by unfolding along a crease and close by folding back, fast, with a hard
stop. Paper does not ease out slowly and neither does this.

### Light and dark, both complete

Both themes ship, and neither is the other one dimmed. Light is the white of the
bird: warm paper, near-black ink, the accent used sparingly. Dark is the black
of the bird: a true dark ground, not navy, with the accent brighter because it
is the sheen and a sheen only shows against black.

Mechanically: define the complete light palette as tokens on bare `:root`.
Redefine only the tokens that change under
`@media (prefers-color-scheme: dark)`, guarded as
`:root:not([data-theme="light"])`. Redefine them again under
`:root[data-theme="dark"]` so an explicit toggle wins in both directions. Never
give a colour its only definition inside a media query or a `[data-theme]`
block. Give `body` an explicit token background.

The toggle is reachable from every page including sign in, and the choice
persists. Check contrast in both themes, not just the one you built first. The
badge previews render in the badge's own palette in both themes, because the
badge does not have a light mode and a preview that recoloured itself would be
lying about what you will see on the desk.

### Banned, visually

Purple-to-blue gradients. Any gradient as a page background. Glassmorphism,
blurred orbs, aurora. Neon on black. A bento grid for no reason. Emoji as UI,
sparkles above all. A `rounded-2xl` card with a large shadow on a gray-50 page.
3D isometric illustration and blob shapes. Marketing hero copy on a page you have
to sign in to reach. A bottom-right toast as the only feedback an action ever
gets.

### What professional constrains

Motion is fast and mechanical. Nothing bouncy. Never animate a number that just
changed from real data: a control panel that wiggles when your calendar updates
is one you stop trusting. Keyboard reachable, focus visible, contrast checked,
`prefers-reduced-motion` honored, both themes complete.

UI copy follows the writing rules in section 1.

## 5. Architecture and layout

```
device/
  badge-sdk/sb/          the shared SDK, installed at /system/badge/sdk
  notifier-app/          launcher folder name: Notifier
  pomodoro-app/          launcher folder name: Pomodoro
  DEPLOY.md
api/
  supabase/migrations/
  supabase/functions/
  supabase/tests/        pgTAP
web/                     Next.js 16 App Router
scripts/
docs/
design/
tasks/
device-constants.json
```

The launcher lists every folder containing an `icon.png` and names the tile from
the folder, turning underscores into spaces and capitalising each word. There is
no title field. So the deployed folder name is the label, and the packager
deploys `notifier-app` as `Notifier` and `pomodoro-app` as `Pomodoro`.

### How a badge app is built

Three files, and the split is the point:

- `<name>.py` is the **machine**. Pure Python. No drawing, no network, no SDK
  import. Handed a `fetch` callable and a clock, it answers what the screen
  should say. Fully testable off the badge.
- `<name>_ui.py` is the **view**. `draw(machine)`. Reads machine state, draws it.
- `__init__.py` is the only file that imports the SDK and touches the firmware
  globals. It wires the machine, the view, and a `RunSpec`, and translates every
  SDK error into the app's own exceptions so the machine never sees `sb`.

BadgeOS injects globals into an app's namespace: `badge`, `screen`, `shape`,
`color`, `image`, `rect`, `rom_font`, `mat3`, `rtc`, and the `BUTTON_*`
constants. They are not importable modules. `__init__.py` captures them and
passes them in. A sibling module that writes `import image` fails on hardware and
passes in tests.

### Hardware facts you may rely on

320 by 240 colour LCD. Buttons `BUTTON_A`, `BUTTON_B`, `BUTTON_C`, `BUTTON_UP`,
`BUTTON_DOWN` on the front, `BUTTON_HOME` on the back and owned by the launcher.
Four rear white LEDs via `badge.caselights(level)` or four separate levels, each
0.0 to 1.0. A front light sensor, `badge.light_level()`, returning a raw u16.
`badge.battery_voltage()`, `badge.is_charging()`, `badge.usb_connected()`.
`badge.ticks` and `badge.ticks_delta` in milliseconds. `badge.sleep(seconds)`,
`badge.woken_by_button()`, `badge.woken_by_reset()`. An RTC that keeps running in
sleep with `rtc.set_alarm()`, `rtc.datetime()`, and `rtc.time_from_ntp()`.

There is no audio call anywhere in the badge API. The LEDs are the only
non-visual alert.

The authoritative docs are cloned at `vendor/badgeware-docs` and the firmware
source at `vendor/tufty2350-firmware` in the reference repo. Read them before
assuming how any primitive behaves. Do not guess.

## 6. The shared SDK

Copy `sb/` from the reference and strip the conference branding out of
`brand.py` and the pairing screen copy. Keep the pairing layout maths exactly:
the QR band sizing and the four-module quiet zone are correct.

Add one fetcher to `sb/__init__.py`, following the shape of `sb.deck()`:

```python
def desk(power=None):
    """GET /gateway/desk. The only route either app calls."""
```

Each app calls `_set_app_slug()` at its firmware boundary so the SDK reports
which app is talking.

Do not add a second network route. If you find yourself wanting one, the answer
is another field in the one payload.

## 7. Notifier

### Files

```
device/notifier-app/
  __init__.py         firmware boundary, RunSpec, error translation
  notifier.py         NotifierMachine, pure
  notifier_ui.py      NotifierScreen, page dispatch, status bar
  pages/
    __init__.py       the registry
    next_thing.py
    day_shape.py
    deploys.py
    counters.py
    one_number.py
  icon.png
  tests/
```

### The machine

States: `WAITING`, `LOADING`, `READY`, `STALE`, `OFFLINE`, `BUSY`, `UNPAIRED`.
`UNPAIRED` is the `unpaired_state` in the `RunSpec`, so the runtime opens
pairing on its own.

The machine holds the whole payload and the current page index. It does not know
how anything is drawn.

Cache the last good payload to `/state/notifier.json` with `sb.store`. On open,
load it and draw it immediately with an age marker rather than showing an empty
screen for the twenty seconds the radio takes. Persist the current page index in
the same file, so a reset returns to the page you were on.

Write the payload's `pomodoro` block to `/state/pomodoro.json`, **only when it
differs from what is already there**. This runs every poll, and rewriting an
unchanged file every thirty seconds for months is avoidable flash wear.

### The page registry

Each page module exports a `SLUG`, a `draw(ctx)`, an optional `leds(data,
now_ms)` returning four levels, and an optional `on_a(machine, now_ms)`. The
registry maps slug to module in one dict.

**The order and the enabled set come from the payload, not from the device.**
A slug the device does not recognise is skipped without an error, so the server
can add a page before the badge has been updated. This is the rule that lets you
ship a new page without touching a badge.

`ctx` carries `screen`, `shape`, `palette`, `data`, `state`, `age_ms`, `now_ms`.
Nothing else. A page that needs more is a page whose data is shaped wrong.

### Buttons

| Button | Does |
| --- | --- |
| UP | Previous enabled page, wrapping |
| DOWN | Next enabled page, wrapping |
| A | The current page's action |
| C | Refetch now, by resetting the poller's clock |
| B | The runtime's. Retry, and hold 1.5s to re-pair |

Set `claims_b=False` in the `RunSpec`. B is worth more as the escape that works
on every screen than as a third action.

### Polling

`Poller` with `interval_ms` from the payload, default 30000. Exponential backoff
on failure is already in `poller.py`, and a `RateLimited` error's `retry_after`
is honoured as a floor. Do not add your own retry logic on top.

### The five pages

Every page must define what it draws in four situations: data, empty, not
connected, and error. Draw the state, never a blank screen.

**1. Next thing.** `{title, start, end, location, minutes_until, all_day,
conferencing}`. Minutes until, in `badgewaremax`, filling the upper half. Title
in `smart`, wrapped to two lines. Location and clock time in `ark` beneath.
LEDs ramp with proximity: off above 15 minutes, 0.25 at 15, 0.5 at 5, a pulse
inside the last minute, off once the meeting has started. A toggles to the next
three items. Empty reads "Nothing until tomorrow".

**2. Day shape.** `{blocks: [24 values 0..3], current_hour, free_minutes,
meeting_count}`. Twenty-four cells across a 288 pixel band, 12 pixels each, 16
pixel margins, one per hour from 07:00. Fill level by how booked the hour is. A
marker under the current hour. One summary line beneath: "4 meetings, 3h 20m
free". A toggles today and tomorrow. No LEDs.

**3. Deploy state.** `{projects: [{name, state, commit, age_ms}]}` where state is
`READY`, `BUILDING`, `ERROR`, `QUEUED`, or `CANCELED`. The worst state among the
projects sets the top band. Up to four projects listed, the expanded one showing
its commit subject. LEDs full on `ERROR`, a slow pulse on `BUILDING`, off on
`READY`. A cycles which project is expanded.

**4. Counters.** `{counters: [{label, value, delta, recent}]}`. Up to four
numbers in a two by two grid with labels, and the most recent subject line from
the selected counter along the bottom in `ark`. The machine remembers the
previous values, so a count that went up blinks the LEDs once. A cycles which
counter's recent line is shown. Sources: Gmail unread on a filtered query, Linear
issues assigned to you, Slack mentions, GitHub review requests.

**5. One number.** `{label, value, unit, spark: [up to 30], delta_pct,
updated}`. The value as large as it will go, the label above it, a thirty point
sparkline below. Source is a PostHog insight, a Stripe figure, or a plain
webhook. One number per screen is the discipline that makes a small display
useful.

### Lifecycle screens

Connecting, no network, stale, and first run. First run says where to go:
"Open magpi.app to choose pages", using the real host. The status bar from
`ui.status_bar` carries the page name on the left, the clock in the middle, and
battery plus data age on the right.

## 8. Pomodoro

### It does not use BadgeApp

`BadgeApp` exists to handle pairing, the WiFi settle, and the token. Pomodoro has
none of those. Write a plain `update()` loop with the same three-file split, no
`RunSpec`, no `DevicePort`, no token read. This is what makes it open in under a
second.

### The technique, honoured

The Pomodoro Technique is specific and worth following rather than approximating:

- One pomodoro is 25 minutes of work.
- A 5 minute break follows each one.
- After four pomodoros, a longer break of 15 to 30 minutes.
- **A pomodoro is indivisible.** Interrupted means void. It does not count.

So there is no pause button. That is a deliberate design decision, not an
omission, and it is the reason the app is worth building rather than using a
phone timer.

### States and buttons

`IDLE`, `WORK`, `SHORT_BREAK`, `LONG_BREAK`, `SET_DONE`, `ABANDON_CONFIRM`.

| Button | Does |
| --- | --- |
| A | Start, or start the next pomodoro from a finished break |
| C | Held 1.5s, abandons the current pomodoro and voids it |
| UP / DOWN | Adjust the work length, in `IDLE` only |
| B | Unused. Leave it alone |

Work ending advances to the break automatically, because the technique says rest
immediately. A break ending waits for A, because starting the next pomodoro is a
decision you make.

Follow the reference's B-hold pattern for the C hold: read defensively, arm on a
release, fire on a sustained hold, and draw the progress for the whole hold. A
pin reading held from the first frame must never fire.

### Display

`MM:SS` as large as `badgewaremax` will draw it. The phase label above. Four dots
showing position in the set, filled as pomodoros complete. Today's completed
count small in the corner.

### LEDs

Off during work until the last 60 seconds, then all four ramp linearly from 0 to
1. A slow breathe during breaks. Off in idle. Respect the `leds` setting.

### State on disk

Settings from `/state/pomodoro.json`, written by Notifier, with defaults if the
file is absent. The day's tally in `/state/pomodoro_log.json`, rolled over at
local midnight using `rtc`.

## 9. The gateway

### One route

`GET /gateway/desk`. That is the entire badge-facing API.

Authentication is a bearer badge token. Only its sha256 is stored, and the
lookup is by hash. Copy this from the reference exactly. The same request
updates `badges.last_seen_at`, battery voltage, and charging state from the query
parameters the SDK already sends.

### The envelope

```json
{
  "v": 1,
  "server_time": "2026-08-22T10:14:00Z",
  "poll_interval_ms": 30000,
  "pages": [
    { "slug": "next_thing", "state": "ok", "age_ms": 4210, "data": {} },
    { "slug": "deploys", "state": "not_connected" },
    { "slug": "one_number", "state": "error", "message": "PostHog rejected the key" }
  ],
  "pomodoro": { "work_min": 25, "short_min": 5, "long_min": 20, "sessions": 4, "leds": true }
}
```

Page state is one of `ok`, `empty`, `not_connected`, `error`. **A dead provider
never fails the request and never blanks the screen.** It returns its own state
and the other pages carry on.

### Composition

One builder per page in `_shared/pages/`, each exporting a `slug` and
`build(ctx)`. One map registers them. Adding a page is one file and one map
entry on each side, and nothing else.

### Caching, because thirty seconds is not a rate limit

A `provider_cache` table keyed by user, provider, and a request key, holding a
`jsonb` payload and an `expires_at`. TTLs: calendar 60s, deploys 30s, counters
120s, the number 300s. A badge polling every thirty seconds must not become an
upstream call every thirty seconds.

Per-badge rate limiting, copied from the reference's `rate_limits`, returning 429
with `retry_after`, which `Poller` already honours.

### Payload discipline

Keep the whole response under 8 KB. Truncate every string server-side to what the
badge can actually draw. The limits live in `device-constants.json` and are
applied on the server, so the device never receives characters it will throw
away.

## 10. Providers and connections

### Two credential kinds, one code path

The `providers` table gains `kind`, either `oauth` or `api_key`. Both kinds store
their secret in the same `connections` row, encrypted by the same
`crypto.ts` path. There is one encryption code path, not two.

| Provider | Kind | Notes |
| --- | --- | --- |
| Google | `oauth` | `calendar.readonly` and `gmail.metadata`. Use `access_type=offline` and `prompt=consent` to receive a refresh token. |
| Linear | `oauth` | `read` scope. |
| Slack | `oauth` | User scopes for mentions. Ship behind the `enabled` flag. |
| GitHub | `oauth` | `read:user`. Optional, for review requests. |
| Vercel | `api_key` | Personal access token. OAuth would require publishing a Vercel Integration, which is not worth it for one user. |
| PostHog | `api_key` | Personal API key, plus host, project id, and insight id in `meta`. PostHog has no OAuth. |

`gmail.metadata` is deliberate. It permits `messages.list` and `messages.get`
with `format=metadata`, which returns headers including the subject. That covers
a count and one subject line without granting access to message bodies. Do not
request `gmail.readonly`.

### The registry drives the UI

The connections page renders from the `providers` table. Adding a provider is a
migration and a page builder, with no React changes. Enforce this: if adding a
provider requires editing a component, the registry is wrong.

### Rules that do not bend

- The website never decrypts a token. Only the gateway edge functions do.
- The encryption key reaches the edge functions and nothing else. It is not in
  the Vercel environment, because the web app has no reason to hold it.
- Every provider scope is read-only. Write access to any provider is a separate
  decision, made later, per provider.
- `oauth_states` has no policies and no client grants, deliberately. A user must
  never read their own pending PKCE verifier.
- Refresh on expiry with a margin, write the new token back, and set
  `status = 'error'` when a provider refuses, so the connections page can say
  "reconnect" instead of the badge silently showing an error page forever.

## 11. The website

Next.js 16 App Router, React 19, Tailwind 4, shadcn/ui, Supabase SSR, Zod,
Vitest. Server actions for every mutation.

### Routes

| Route | Holds |
| --- | --- |
| `/` | Public homepage. The origami magpies. Redirects to `/dashboard` when signed in |
| `/login` | GitHub first, email magic link beneath it |
| `/auth/callback` | Copy from the reference |
| `/dashboard` | Badge status, last seen, battery, what is connected, what is not |
| `/pages` | Enable, reorder, and configure the five Notifier pages, with live previews |
| `/connections` | Every provider from the registry, connected or not |
| `/connections/[slug]` | Detail. An authorize button for `oauth`, a key form for `api_key` |
| `/link` | Pair a badge by QR and code. List badges, rename, revoke |
| `/settings` | Pomodoro intervals, poll interval, theme |

### Server actions

One function per action in `lib/actions/`, pure and tested against a fake
database. The thin `"use server"` wrapper passes a revalidate path to
`withSession`. **Without that path the page is stale after the mutation and the
user refreshes by hand.** This is the single most repeated mistake in the
reference project.

`LiveRegion` on `/link`, because pairing approval arrives from the device's own
poll, and on `/dashboard` for badge last-seen and battery. Realtime needs three things:
the table in the publication, RLS that scopes the rows, and the component. Miss
the publication and the list silently never updates.

### The previews, and the one real risk

`<BadgePreview page={slug} config={...} data={...} />` renders a 320 by 240 box,
one to one, in the badge palette, using the ROM font metrics. It is the best part
of the site and it is also the one place this design can rot, because it draws
the same layout the device draws, in a different language, and the two will
drift.

Solve it the way the reference solved Sparkle. Generate
`preview-fixtures.json` from the Python page modules: for a fixed set of fixture
payloads, record the layout each page produces (the boxes, the font choices, the
strings after truncation). The web suite asserts every preview against that file.
Change a device layout, run `pnpm previews:fixtures`, and the web tests fail
until the preview catches up.

Two gotchas when porting layout maths between the two: Python's `%` is
non-negative for a negative left operand and JavaScript's is not, and Python's
`int()` truncates where `Math.round` does not.

## 12. Data model

Every table: RLS enabled and forced. Owner-only through `auth.uid() = user_id`.

| Table | Notes |
| --- | --- |
| `profiles` | Created by a trigger on signup. |
| `badges` | `token_hash bytea` unique. Plus `uid`, `fw`, `sdk`, `last_seen_at`, `battery_v`, `charging`, `revoked_at`. |
| `device_codes` | Pairing. Copy from the reference. |
| `providers` | The registry. `slug`, `display_name`, `description`, `kind`, `auth_url`, `token_url`, `scopes[]`, `enabled`, `docs_url`. Readable by authenticated, written only by `service_role`. |
| `connections` | Unique on `(user_id, provider)`. `access_token_enc`, `refresh_token_enc`, `scopes[]`, `expires_at`, `status`, `meta jsonb`. |
| `oauth_states` | No policies, no client grants, deliberately. |
| `page_configs` | Unique on `(user_id, page_slug)`. `enabled`, `position`, `settings jsonb`. |
| `pomodoro_settings` | One row per user. |
| `provider_cache` | Unique on `(user_id, provider, cache_key)`. `payload jsonb`, `expires_at`. Service role only. |
| `rate_limits` | Copy from the reference. Service role only. |

**`badges.token_hash` must not be selectable by `authenticated`.** Use a
column-level grant listing every column except that one. A token hash the client
can read is a token hash that can be tried.

Realtime publication: `badges`, `page_configs`, `connections`. Nothing else.

### pgTAP, in `api/supabase/tests/rls.test.sql`

Assert all of it, because RLS you did not test is RLS you do not have:

- `anon` reads nothing from any table.
- User A cannot read user B's badges, connections, page configs, or Pomodoro
  settings.
- `authenticated` cannot select `badges.token_hash`.
- `authenticated` cannot select anything at all from `oauth_states`,
  `provider_cache`, or `rate_limits`.
- Every table in `public` has RLS enabled and forced.
- The realtime publication contains exactly the three intended tables and no
  others.

## 13. Shared constants

`device-constants.json` at the repo root is the only place these are written.
`pnpm constants` generates three files, and `pnpm constants:check` fails on
drift in both the gate and CI. Never edit a generated file.

```
device/badge-sdk/sb/constants.py
web/lib/badge-constants.ts
api/supabase/functions/_shared/badge-constants.ts
```

It holds: `SCREEN_W`, `SCREEN_H`, `DEFAULT_POLL_MS`, `MIN_POLL_MS`,
`PAGE_SLUGS`, `TITLE_MAX`, `SUBJECT_MAX`, `COUNTER_MAX`, `SPARK_POINTS`,
`DAY_BLOCKS`, `DAY_START_HOUR`, `PAYLOAD_MAX_BYTES`, `LED_LEVELS`, and the
Pomodoro defaults.

Sizes the badge draws at, caps the server enforces, and limits the previews
respect are all the same numbers. If a number appears in two languages, it comes
from here.

## 14. Testing

Test-driven, every suite. Five suites, and the gate runs all of them.

```
node scripts/python-tests.mjs             # device
pnpm --dir web test                       # web
cd api && deno task test                  # gateway
node scripts/db-test.mjs                  # pgTAP
pnpm test:e2e                             # playwright
```

### Lifecycle tests, named explicitly

These are the ones that catch the bugs this hardware actually produces:

- `BadgeApp` boots into pairing when unpaired and running when paired.
- Pairing completes and hands over to running without calling `port.launch()`.
- The unpaired state holds its message, then opens pairing on its own.
- The B hold does not arm from the first frame, arms on a release, fires at
  1500ms, and only then wipes the token.
- The WiFi settle loads on connect and calls `no_network` on timeout.
- Notifier draws its cached payload before the first fetch returns.
- The current page index survives a reset.
- `/state/pomodoro.json` is written only when its content changed.
- A page slug the device does not recognise is skipped, not fatal.
- Pomodoro runs a full set of four with the long break in the right place.
- Abandon voids the pomodoro and it does not count.
- The LED ramp starts at exactly 60 seconds remaining.
- The daily tally rolls over at local midnight.

### Fakes must refuse what the firmware refuses

`caselights` raising, `held()` absent, a store write interrupted mid-way, a
firmware without `light_level()`. A fake that returns a benign default is how
every device bug in the reference project shipped green.

### Coverage

Web 95, API 90, device 95. Under the threshold fails.

### The pre-push gate

Copy `scripts/pre-push-gate.mjs` and `.husky/pre-push`. Steps in order: format,
constants check, script tests, web lint, web typecheck, web tests, API lint, API
typecheck, API tests, device tests, coverage, pgTAP, web build, e2e.

The reference gate skips a step when its tool is missing. Keep that, print every
skip loudly, and add `pnpm gate --strict`, which fails rather than skipping.
A gate that quietly skipped the database tests is a gate that passed for the
wrong reason.

## 15. CI

Mirror `.github/workflows/ci.yml` from the reference: separate jobs for format,
web, API, device, database, and coverage, plus a deploy job on push to `main`
that runs `supabase db push` and deploys the edge functions.

**A change to `_shared/**` redeploys every function.** The reference has
`scripts/functions-deploy-plan.mjs` for working out what to redeploy. Copy it.

Web deploys through Vercel's git integration, not through CI. It takes about
four minutes. Do not judge a deploy at one minute.

**A green build is not a deploy.** A gateway route added by editing `_shared`
only reaches production if CI redeployed the function that bundles it. After any
backend change, confirm the deploy job actually ran.

## 16. Build order

Work in this order. Each step is provable before the next begins.

1. Repo skeleton, pnpm workspace, prettier, eslint, husky, the gate script, the
   CI file. Prove `pnpm gate` runs and fails loudly on a deliberate error.
2. `device-constants.json` and the generator. Three generated files, and
   `constants:check` in the gate.
3. **Design in Paper.** Every artboard from section 3. Export to `design/`.
   Write `docs/DESIGN.md`.
4. Database: every migration, RLS, and the pgTAP file. `pnpm db:test` green.
5. Auth and the shell: GitHub sign in, session, layout, both themes, the theme
   toggle, the token layer from `DESIGN.md`.
6. Pairing end to end: the three device endpoints, `/link`, the SDK pairing, the
   badge QR screen. **Pair a real badge before writing a single page.**
7. Gateway skeleton: `GET /desk` returning a hardcoded envelope, and Notifier
   rendering it on hardware. This is the moment the whole path is proved, and
   everything after it is filling in.
8. Connections: the providers table, OAuth begin, callback and claim, the API key
   form, encryption. Connect Google and Vercel for real.
9. The five pages, one at a time, each complete before the next: the server
   builder, the device page, the web preview, and tests for all three.
10. `/pages`: enable, drag to reorder, per-page settings, live previews.
11. Pomodoro end to end, and `/settings`.
12. E2E tests, coverage to threshold, the full gate green.
13. `docs/finish-dev-setup.md`.
14. Package both apps and install them on the badge.

## 17. docs/finish-dev-setup.md

Once the build is in reasonable shape, write this file. **Be pedantic to the
point of tedium.** Numbered steps, exact console paths, exact values to paste,
exact secret names. Assume the reader is doing it at the end of a long day.

End every section with a line beginning "You will know this worked when", giving
a concrete observable result.

Cover, in this order:

1. **Google Cloud OAuth.** Create or choose the project. Enable the Google
   Calendar API and the Gmail API, with the exact console path for each. The
   OAuth consent screen: External, app name, support email, developer email. Add
   the two scopes, `calendar.readonly` and `gmail.metadata`, and explain that
   adding yourself as a Test User avoids the verification review that restricted
   scopes would otherwise require for personal use. Create an OAuth client ID of
   type Web application. The exact authorized redirect URI, written out in full.
   Where the client ID and secret go in Doppler, by exact name.
2. **Vercel.** Creating a personal access token, its scope, its expiry, where the
   optional team ID is found.
3. **PostHog.** The personal API key, the host (US or EU), the project ID, and
   the insight ID, with where each one is found in their UI.
4. **Linear.** Creating the OAuth application and its redirect URI.
5. **Slack**, if enabled.
6. **Supabase.** Creating the GitHub OAuth App for sign in, its homepage and
   callback URLs, and where its client ID and secret go in Supabase Auth. The
   Site URL and the redirect allowlist. Generating the encryption key
   (`openssl rand -base64 32`). Setting edge function secrets with
   `supabase secrets set`.
7. **Doppler.** Every secret name in one table. Which ones sync to Vercel and
   which must not: **the encryption key and the service role key never reach
   Vercel**, because the web app never decrypts anything. How to run
   `doppler setup` in the repo.
8. **GitHub Actions.** Every repository secret by name (`SUPABASE_ACCESS_TOKEN`,
   `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`). How to confirm the deploy job
   ran rather than assuming it.
9. **Vercel project.** Importing the repo, setting the root directory to `web`,
   the environment variables, the domain.
10. **Installing on the badge.** Disk mode: hold BOOT, tap RESET, the drive mounts
    as `TUFTY` and its root is the device's `/system`. Copy `notifier-app` to
    `apps/Notifier` and `pomodoro-app` to `apps/Pomodoro`. Copy the SDK to
    `badge/sdk/sb/`. Set `COPYFILE_DISABLE=1` and delete every `._*` file. Eject
    cleanly.
11. **First run checklist.** Sign in, connect one provider, enable one page, pair
    the badge, see real data.

## 18. Definition of done

- [ ] `pnpm gate --strict` passes with nothing skipped.
- [ ] Coverage at or above 95 web, 90 API, 95 device.
- [ ] CI green on every job, and the deploy job confirmed to have deployed.
- [ ] Both themes complete, contrast checked in each, toggle reachable from
      every page including sign in.
- [ ] `docs/DESIGN.md` written, with every token value and every deliberate
      deviation recorded.
- [ ] The token test passes: no raw colour, radius, or duration anywhere in
      `web/` outside the primitives file.
- [ ] The homepage origami works in both themes, as white paper on black and as
      black paper on white.
- [ ] All five Notifier pages render on real hardware with real data.
- [ ] Every page renders correctly in all four states: data, empty, not
      connected, and error.
- [ ] Pomodoro runs a full set of four with the long break, on hardware, with the
      LED ramp.
- [ ] A provider disconnected mid-session degrades that one page and no others.
- [ ] Pomodoro settings changed on the website reach the badge through Notifier
      and take effect.
- [ ] `docs/finish-dev-setup.md` written and followed start to finish once.
- [ ] `tasks/todo.md` complete, with the review section filled in.

## 19. Non-goals

Do not build these, and do not leave hooks for them:

- Push notifications. The badge polls. There is no wake-on-message.
- Audio alerts. There is no audio call in the badge API.
- Battery operation as a primary mode. A cold WiFi join on every wake makes an
  ambient display feel dead. This device lives on USB.
- Writing to any provider. Every scope is read-only.
- Multi-user sharing, teams, or an app store.
- A second badge-facing route.
- Any page that takes more than a glance to read.

## 20.Observability 

Build Posthog observability into the web app. Create a common library that is used throughout the app and within the library create a Posthog provider to write to Posthog. We should be able to switch providers without touching any application code.
