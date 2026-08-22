# Design

Magpi has no upstream design system. This file is the system: every token
value, the type scale, the motion vocabulary, and every deliberate deviation
with its reason. Read it before you build a screen. It is what stops the fifth
screen drifting back to shadcn defaults.

The design was drawn in Paper before any application code was written. Every
artboard is exported to `design/` as a PNG.

## Where it comes from

A magpie is black and white with an iridescent blue-green sheen across the wing
that turns violet on the tail. That bird supplies the entire palette. Nothing
was invented for brand reasons.

The other half of the direction is the object: a 320 by 240 screen, four white
LEDs, five chunky buttons. That is a control panel for a physical thing, so the
site is dense, square where a control panel is square, and shows the badge
screen at true size wherever it can.

## Layer one: primitives

Raw values appear here and nowhere else in the repository. A test enforces
that (`web/tests/tokens.test.ts`).

### Colour

Four primitives with ramps. Neutrals derive from `ink` and `chalk`; none is
picked separately.

| Token                | Value     | From                                     |
| -------------------- | --------- | ---------------------------------------- |
| `--color-ink-950`    | `#08090B` | The glossy black of the head and back    |
| `--color-ink-900`    | `#0F1114` |                                          |
| `--color-ink-800`    | `#15181C` |                                          |
| `--color-ink-700`    | `#22262B` |                                          |
| `--color-ink-600`    | `#33383F` |                                          |
| `--color-ink-500`    | `#4A5058` |                                          |
| `--color-ink-400`    | `#6E757E` |                                          |
| `--color-ink-300`    | `#9AA0A8` |                                          |
| `--color-ink-200`    | `#C6C9CE` |                                          |
| `--color-ink-100`    | `#E2E4E7` |                                          |
| `--color-chalk-400`  | `#E4E1D9` | The white belly and shoulder patch       |
| `--color-chalk-300`  | `#EFEDE7` |                                          |
| `--color-chalk-200`  | `#F7F6F2` |                                          |
| `--color-chalk-100`  | `#FBFAF7` |                                          |
| `--color-chalk-50`   | `#FFFFFF` |                                          |
| `--color-sheen-800`  | `#0A6157` | The blue-green iridescence of the wing   |
| `--color-sheen-700`  | `#0A7C6E` |                                          |
| `--color-sheen-600`  | `#0C9B89` |                                          |
| `--color-sheen-500`  | `#0FBFA8` |                                          |
| `--color-sheen-400`  | `#2ED3BC` |                                          |
| `--color-sheen-300`  | `#6FE3D3` |                                          |
| `--color-violet-700` | `#4E33B4` | Where that iridescence turns on the tail |
| `--color-violet-600` | `#6242E0` |                                          |
| `--color-violet-500` | `#7A5CFF` |                                          |
| `--color-violet-400` | `#8E78FF` |                                          |
| `--color-violet-300` | `#A896FF` |                                          |
| `--color-amber-500`  | `#C8871A` | Caution only                             |
| `--color-rust-500`   | `#C2402F` | Critical only                            |

On the bird the iridescence is a narrow band on a black wing. That is the
proportion the accent keeps. An accent never becomes a background wash.

### Type

| Token            | Value           | For                                             |
| ---------------- | --------------- | ----------------------------------------------- |
| `--font-display` | JetBrains Mono  | Numbers, headings, anything mirroring the badge |
| `--font-text`    | Instrument Sans | Prose                                           |
| `--font-screen`  | Silkscreen      | Badge previews, standing in for the ROM fonts   |

Neither is Inter. Tabular figures everywhere a number can change.

| Token         | Size |
| ------------- | ---- |
| `--text-2xs`  | 11px |
| `--text-xs`   | 12px |
| `--text-sm`   | 13px |
| `--text-base` | 14px |
| `--text-md`   | 16px |
| `--text-lg`   | 18px |
| `--text-xl`   | 21px |
| `--text-2xl`  | 28px |
| `--text-3xl`  | 38px |
| `--text-4xl`  | 52px |
| `--text-5xl`  | 72px |

Line heights: `--leading-flat` 1, `--leading-tight` 1.15, `--leading-snug`
1.35, `--leading-prose` 1.6. Tracking: `--tracking-display` -0.03em for large
display type, `--tracking-normal` 0, `--tracking-label` 0.08em for small caps
labels. Weights: 400, 500, 700, 800.

### Spacing

2, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, as `--spacing-3xs` through
`--spacing-5xl`. Denser than the shadcn blocks throughout: list rows are 12 to
16px of vertical padding, panels 20 to 24px.

### Radius

Not uniform. shadcn ships one radius on everything and that is the first tell.

| Token               | Value   | Used on                                           |
| ------------------- | ------- | ------------------------------------------------- |
| `--radius-square`   | `0px`   | Screens, previews, inputs, table cells            |
| `--radius-hairline` | `2px`   | Chips and small marks                             |
| `--radius-panel`    | `4px`   | Panels and buttons                                |
| `--radius-round`    | `10px`  | Sheets and dialogs, the only properly round thing |
| `--radius-pill`     | `999px` | LED dots and status pills                         |

Form inputs are square on purpose. They are the part of the site that most
resembles an instrument, and a rounded text field there reads as a web form.

### Borders

Borders vary. A 1px muted border on every card is the second biggest tell.

| Use             | Treatment                                           |
| --------------- | --------------------------------------------------- |
| Panel           | 1px `--color-border`                                |
| Selected panel  | 1px `--color-accent`                                |
| Status on a row | 2px left edge in the status colour, no other border |
| List separator  | 1px bottom only, never a full box per row           |
| Empty state     | 1px dashed                                          |
| Input           | 1px, becoming `--color-focus` when focused          |

### Motion

| Token               | Value                            |
| ------------------- | -------------------------------- |
| `--duration-tick`   | `90ms`                           |
| `--duration-fold`   | `140ms`                          |
| `--duration-unfold` | `180ms`                          |
| `--ease-fold`       | `cubic-bezier(0.32, 0, 0.12, 1)` |
| `--ease-crease`     | `cubic-bezier(0.9, 0, 0.9, 1)`   |

## Layer two: semantics

The only layer the two themes remap. A theme never redefines a primitive.

| Token                   | Light                | Dark                 |
| ----------------------- | -------------------- | -------------------- |
| `--color-background`    | `--color-chalk-200`  | `--color-ink-950`    |
| `--color-surface`       | `--color-chalk-100`  | `--color-ink-900`    |
| `--color-raised`        | `--color-chalk-50`   | `--color-ink-800`    |
| `--color-ink`           | `--color-ink-900`    | `--color-chalk-200`  |
| `--color-ink-muted`     | `--color-ink-500`    | `--color-ink-300`    |
| `--color-border`        | `--color-chalk-400`  | `--color-ink-800`    |
| `--color-border-strong` | `--color-ink-900`    | `--color-ink-600`    |
| `--color-accent`        | `--color-sheen-600`  | `--color-sheen-500`  |
| `--color-accent-ink`    | `--color-chalk-50`   | `--color-ink-950`    |
| `--color-live`          | `--color-violet-600` | `--color-violet-400` |
| `--color-positive`      | `--color-sheen-700`  | `--color-sheen-400`  |
| `--color-caution`       | `--color-amber-500`  | `--color-amber-500`  |
| `--color-critical`      | `--color-rust-500`   | `--color-rust-500`   |
| `--color-focus`         | `--color-violet-500` | `--color-violet-400` |

The accent is one step darker in light mode because a sheen only shows against
black. Light is the white of the bird: warm paper, near-black ink, the accent
used sparingly. Dark is the black of the bird: a true dark ground, not navy.

### How the themes are wired

1. The complete light palette is defined on bare `:root`.
2. Only the tokens that change are redefined under
   `@media (prefers-color-scheme: dark)`, guarded as `:root:not([data-theme="light"])`.
3. They are redefined again under `:root[data-theme="dark"]` so an explicit
   toggle wins in both directions.

No colour has its only definition inside a media query or a `[data-theme]`
block. `body` gets an explicit token background.

The toggle is reachable from every page including sign in, and the choice
persists.

### The device group

The badge palette is its own token group, generated from
`device-constants.json` alongside the ROM font metrics. It does not remap with
the theme, because the badge has no light mode and a preview that recoloured
itself would be lying about what you will see on the desk.

| Token                   | Value     |
| ----------------------- | --------- |
| `--color-screen`        | `#000000` |
| `--color-screen-ink`    | `#FFFFFF` |
| `--color-screen-dim`    | `#8A8A8A` |
| `--color-screen-accent` | `#0FBFA8` |
| `--color-screen-warn`   | `#E0A020` |
| `--color-screen-bad`    | `#E04A32` |
| `--color-led-on`        | `#FFFFFF` |
| `--color-led-off`       | `#2A2A2A` |

### The ROM font metrics

Taken from `ui.py` in the reference SDK and generated into the preview tokens.

```
ark 11px   sins 12   badgeware 14   memo 15   smart 16   badgewaremax 20
```

## Layer three: components

shadcn components read semantic tokens only. No component file contains a hex
value, a raw pixel radius, or a hardcoded duration.

## Motion vocabulary

The fold is the whole vocabulary. Paper opens by unfolding along a crease and
closes by folding back, fast, with a hard stop. Paper does not ease out slowly
and neither does this.

| Thing                       | Motion                                                |
| --------------------------- | ----------------------------------------------------- |
| Panel, menu, sheet opening  | Unfold along the crease, 180ms, `--ease-fold`         |
| The same closing            | Fold back, 140ms, `--ease-fold`                       |
| A row selecting             | The 2px left edge arrives in 90ms, no other change    |
| A toggle                    | 90ms, linear                                          |
| A drag reorder              | The gap opens in 140ms; the dragged row does not tilt |
| A number changing from data | Nothing. It changes.                                  |

That last row is the rule that matters. A control panel that wiggles when your
calendar updates is one you stop trusting.

`prefers-reduced-motion` collapses every duration to zero. Nothing in the
product depends on an animation having played.

## The homepage

The only page a stranger sees. Built from abstract origami magpies: birds made
of folded paper planes, not illustrations of birds.

Every shape is two or three flat values, a lit face and a shadowed face, with a
crease line between them. No gradients, no soft shadows, no rendered 3D. The
bird reads at a glance and falls apart into geometry when you look closely.

The hero ships in both themes. In dark it is white paper on black; in light it
is black paper on white with the belly staying chalk, which is what the real
bird does. The sheen is the same colour in both, appearing only at the wingtip,
the tail tip, and the beak.

`/` is public. Signed-in visitors are redirected to `/dashboard`.

## Banned

Purple-to-blue gradients. Any gradient as a page background. Glassmorphism,
blurred orbs, aurora. Neon on black. A bento grid for no reason. Emoji as UI.
A `rounded-2xl` card with a large shadow on a gray-50 page. 3D isometric
illustration and blob shapes. Marketing hero copy on a page you have to sign in
to reach. A bottom-right toast as the only feedback an action ever gets.

Icons are drawn, not imported. The badge has no icon set, and a lucide glyph on
every list row is a tell. The shapes this product needs are folded from the
same planes as the homepage birds.

## Deliberate deviations

**States are one board, not one artboard per page per state.** Section 3 of the
brief asks for the empty, loading, and error state of all eight website
screens, which is 24 more artboards. The states are uniform by design: one
empty pattern, one loading pattern, one error pattern, applied by every page.
Drawing them 24 times would have recorded that sameness 24 times rather than
deciding it once. `design/app-states.png` holds all three patterns with the
three most different empty states drawn out. Any page-specific state that
diverges from those patterns gets its own artboard when it appears.

**The homepage ships in both themes; the app screens are drawn dark only.** The
app screens are the same layout with the semantic layer swapped, and the swap
is mechanical because layer two is the only layer a theme touches. The homepage
is not mechanical: the folded bird has to be re-lit, which is a design decision
and is why it was drawn twice.

**Silkscreen stands in for the badge ROM fonts in the design file.** The Tufty
ROM fonts are firmware assets and cannot be loaded into a design tool. Silkscreen
is a pixel font with the same character, at the same sizes. The shipped web
previews use the real ROM metrics from `device-constants.json`, and
`web/tests/fixtures/preview-fixtures.json` pins the layout against what the
Python pages actually draw, so the stand-in never reaches production.

**The badge preview's LED row is an annotation, not a device element.** The
badge artboards show four LED bars under the screen content. There are no LEDs
on the badge screen. The row records which page lights the case LEDs and at
what level, and it appears in the web preview for the same reason.

**The four case LEDs are drawn as pills, everything else on those screens is
square.** The LEDs are round on the hardware.

## Artboards

Twenty-seven, all in `design/`.

| File                                | What                               |
| ----------------------------------- | ---------------------------------- |
| `notifier-next-thing.png`           | Notifier page 1                    |
| `notifier-day-shape.png`            | Notifier page 2                    |
| `notifier-deploy-state.png`         | Notifier page 3                    |
| `notifier-counters.png`             | Notifier page 4                    |
| `notifier-one-number.png`           | Notifier page 5                    |
| `notifier-connecting.png`           | Lifecycle: joining WiFi            |
| `notifier-no-network.png`           | Lifecycle: radio failed            |
| `notifier-unpaired.png`             | Lifecycle: no token                |
| `notifier-stale-data.png`           | Lifecycle: cached payload, old     |
| `notifier-first-run.png`            | Lifecycle: nothing configured      |
| `pomodoro-idle.png`                 | Pomodoro `IDLE`                    |
| `pomodoro-work.png`                 | Pomodoro `WORK`                    |
| `pomodoro-short-break.png`          | Pomodoro `SHORT_BREAK`             |
| `pomodoro-long-break.png`           | Pomodoro `LONG_BREAK`              |
| `pomodoro-set-complete.png`         | Pomodoro `SET_DONE`                |
| `pomodoro-abandon-confirm.png`      | Pomodoro `ABANDON_CONFIRM`         |
| `homepage-dark.png`                 | Full homepage, dark                |
| `homepage-light.png`                | Full homepage, light               |
| `app-sign-in.png`                   | `/login`                           |
| `app-dashboard.png`                 | `/dashboard`                       |
| `app-pages.png`                     | `/pages`                           |
| `app-connections.png`               | `/connections`                     |
| `app-connection-detail-oauth.png`   | `/connections/google`              |
| `app-connection-detail-api-key.png` | `/connections/posthog`             |
| `app-link-a-badge.png`              | `/link`                            |
| `app-settings.png`                  | `/settings`                        |
| `app-states.png`                    | Empty, loading, and error patterns |

## Homepage copy, as edited

The copy below is the shipped wording. It was edited on the canvas after the
first pass and is the version the React homepage renders. Contractions are
deliberate here and nowhere else in the product.

| Slot            | Text                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Hero kicker     | PIMORONI TUFTY 2350                                                                                                         |
| Hero heading    | A bird that watches your whole day.                                                                                         |
| Hero body       | Magpi puts your calendar, your deploys, your unread counts, and all your glanceable data on a badge that sits on your desk. |
| Hero actions    | Sign in with GitHub / Read the build                                                                                        |
| Device heading  | Every page at a glance                                                                                                      |
| Device body     | What's next. What's today. What's deployed. Pick what you want to see every day.                                            |
| Gateway heading | Your data, on your device.                                                                                                  |
| Footer          | A desk companion for the Pimoroni Tufty 2350.                                                                               |

The section kickers were dropped in that pass. The heading carries the section
on its own, and a small caps label above every one of them was a rhythm the
page did not need.

## The app icon

`design/app-icon-dark.png` and `design/app-icon-light.png`, 1024 square. The
same folded magpie as the hero, in the same orientation, with about 14 percent
padding. Not a new mark: the icon on a browser tab, the one on an OAuth consent
screen, and the bird on the homepage are one bird.

`web/app/icon.svg` is the favicon. It inlines its hex values rather than reading
tokens, because a favicon is fetched without the stylesheet and a `var()` there
renders nothing. `tests/tokens.test.ts` asserts every colour in it is a value
the primitives file declares, which is what stops it drifting.

`scripts/gen-icons.py` renders the rasters from the same geometry:

| File                              | Size | For                       |
| --------------------------------- | ---- | ------------------------- |
| `web/public/icon-32.png`          | 32   | Browser tab fallback      |
| `web/public/apple-touch-icon.png` | 180  | iOS home screen           |
| `web/public/icon-192.png`         | 192  | Android home screen       |
| `web/public/icon-512.png`         | 512  | Install prompt            |
| `design/oauth-logo-120.png`       | 120  | The OAuth consent screens |

## Motion on the homepage

The gateway section carries a packet along each provider's wire.

A dash rather than a glow or a pulse, because a poll is a discrete thing
arriving somewhere rather than a signal humming. Timing is linear, since a
packet does not accelerate, and the lanes are staggered across one full trip so
the six never beat together and turn into a metronome. `--duration-wire` is
2600ms.

Each lane leaves level with its provider row, so a wire looks attached to the
thing it carries. The packet stroke is 4px against a 1px wire because
`preserveAspectRatio` is off and a near-horizontal stroke is squashed by the
vertical scale.

`prefers-reduced-motion` stops all of it and the wires stay drawn, so the
diagram still says what connects to what.

This is the one animated thing in the product. The rule that a number from real
data never animates is unchanged: the badge previews and every panel in the app
are still.
