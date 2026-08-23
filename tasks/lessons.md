# Lessons

## Read the firmware, do not infer it

Everything the badge code assumed about BadgeOS was inferred from Pimoroni's
prose docs and from how a Tufty 2040 used to work. Three of those inferences
were wrong, and all three only showed up the first time a badge was plugged in:

- App icons had to be **24 by 24, RGBA, transparent**. They were 96 square and
  opaque. `firmware/apps/menu/app.py` blits the file into
  `rect(x, y, icon.width, 24)`, so a 96 pixel icon is drawn 96 wide and 24
  tall, and an opaque ground covers the coloured tile the launcher drew.
- The launcher lists folders holding an **`__init__.py`**, not folders holding
  an `icon.png`. Two docs said otherwise.
- `secrets.py` already exists on a badge, shipped by the firmware and carrying
  `REGION` and `TIMEZONE`. The setup guide said to create it, which silently
  breaks the stock clock app.

The source is public: `github.com/pimoroni/tufty2350`. Clone it and read
`firmware/apps/menu/app.py`, `modules/common/wifi.py`,
`modules/common/secrets.py` and `modules/common/badgeware/badge.py` before
writing anything that talks to the firmware.

**How to apply.** When device code depends on a behaviour of somebody else's
firmware, cite the file and line it comes from in a comment. A comment that
says what the firmware does, with no source, is a guess.

## A build step that produces nothing is not verified

`pnpm badge:package` was signed off as done on the strength of a dry run that
wrote 27 files. It never wrote `badge/config.json`, which both apps open before
they touch the radio, so every badge it produced failed on its first frame. The
dry run counted files; nobody asked whether the files were sufficient.

**How to apply.** A packaging step is verified when the output has been run,
not when it has been counted. Where that needs hardware, say so in `todo.md`
and leave the box unticked.

## The badge has to get itself back

`settle_first_fetch` gave up after one failed join and drew "No network" until
somebody pressed B. Pimoroni's own `wifi.connect()` retries five times, and the
cyw43 driver retries the association four more times underneath that, because a
transient auth failure on first association is normal on this radio.

The join itself was worse: the first negative `wlan.status()` was taken as
final, half a second after `connect()`, which is exactly when the transient
codes show up. And each retry power-cycled the radio, throwing away the join
state the driver was still working on. BadgeOS rejoins on the live interface
and only calls `active(False)` once it has given up.

**How to apply.** Anything that runs unattended on a desk retries on a widening
backoff. A screen that can only be fixed by a person standing next to it is a
screen that stays wrong all day. And when the platform ships code that does the
same job, match its retry shape rather than inventing one.
