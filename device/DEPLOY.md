# Putting Magpi on a badge

This gets the two apps and the SDK onto a Pimoroni Tufty 2350. It takes about
five minutes. You need the badge, a USB-C cable, and this repo checked out.

## What goes where

The badge holds one copy of the SDK, shared by both apps.

```
/system/apps/Magpi/          the notifier app
/system/apps/Pomodoro/       the pomodoro timer
/system/badge/sdk/sb/        the SDK both apps import
/system/badge/config.json    where the gateway lives
```

The launcher lists every folder under `/system/apps` that has an `__init__.py`
in it, and uses the folder name as the tile label. There is no title field.
That is why the repo folder `notifier-app` is copied to the badge as
`Magpi`.

Each tile is a coloured squircle with `icon.png` drawn on top of it, at 24 by
24 pixels with a transparent background. `scripts/gen-icons.py` writes both app
icons at that size. A folder with no `icon.png` still appears, with a default
grey square.

## Step 1: put the badge in disk mode

1. Plug the badge into your computer with a USB-C cable.
2. Hold down **BOOT**.
3. While still holding BOOT, tap **RESET**.
4. Let go of BOOT.

A drive named **TUFTY** appears. Its root is the badge's `/system` folder.

If no drive shows up, try a different cable. Some USB-C cables only carry
power, not data.

## Step 2: copy the files

From the top of the repo:

```
doppler run --config prd -- pnpm badge:package
```

That copies both apps and the SDK, writes `badge/config.json`, and prints how
many files it wrote. It skips the test folders and the recording tools, because
neither can run on a badge.

`config.json` names the origin the badge's two pairing calls and every later
poll go to, and it comes from `FUNCTIONS_BASE_URL`. **The badge and the website
you pair from must name the same one.** They are separate databases: a code the
badge started against the deployed stack does not exist in the local one, and
entering it on `localhost:3000` answers "That code is not valid."

`--config prd` matters. The default `dev` config names the local stack as
`127.0.0.1`, and on a badge loopback is the badge. The packager refuses that
rather than writing a badge that reports "Cannot reach server".

To pair from `localhost:3000` instead, point the badge at the stack on this
machine by its LAN address, and use `ipconfig getifaddr en0` for the address:

```
MAGPI_GATEWAY=http://192.168.1.20:56521/functions/v1 pnpm badge:package
```

Both have to be on the same WiFi, the machine has to be awake, and a DHCP lease
that moves means packaging again.

Want to see what it would copy without a badge plugged in?

```
doppler run --config prd -- pnpm badge:package -- --out dist/badge
```

## Step 3: eject and restart

```
diskutil eject /Volumes/TUFTY
```

Then tap **RESET** on the badge. Magpi and Pomodoro appear in the launcher.

Always eject before you unplug. Pulling the cable mid-write leaves a half
written file, and the launcher will not start an app it cannot read.

## Step 4: pair the badge

1. Open Magpi on the badge. It shows a short code.
2. Go to the Magpi website and sign in.
3. Enter the code.

The badge stores one pairing token and nothing else. It never holds a password
or a provider key.

## Making a change

Edit the Python, run the tests, then copy again:

```
pnpm device:test
doppler run --config prd -- pnpm badge:package
```

You do not need to reinstall the SDK separately. `badge:package` refreshes all
three folders every time.

## If something goes wrong

**The launcher does not list an app.** The folder needs an `__init__.py`. If
it is listed but wearing a grey square, it is missing `icon.png`: run
`python3 scripts/gen-icons.py` and copy again.

**The icon is smeared sideways across the row.** The launcher draws the file at
its own width and a fixed 24 pixels tall, so anything bigger than 24 square
gets squashed. Regenerate with `python3 scripts/gen-icons.py`.

**The app opens on an error box mentioning `config.json`.** The badge was
packaged without a gateway origin. Run
`doppler run --config prd -- pnpm badge:package`.

**The website says the pairing code is not valid.** The badge and the website
are on different stacks. `cat /Volumes/TUFTY/badge/config.json` in disk mode
and compare it with `BADGE_API_URL` for whichever site you have open. Pair from
the deployed site, or repackage with `MAGPI_GATEWAY` set to this machine's LAN
address.

**The badge says "Cannot reach WiFi" or "No network".** It read your SSID and
the radio would not join. A first association that fails is retried, five times
on the live interface and then on a widening backoff, so a message that stays
up means the join is failing for a reason retrying cannot fix. In order of how
often it is each one:

1. **The network is 5GHz.** The Tufty has no 5GHz radio, and a 5GHz-only
   network looks to it exactly like a network that is not there.
2. **The SSID or password in `/system/secrets.py` is not quite right.** A
   trailing space survives the edit and is invisible in the file.
3. **The AP is on channel 12 or 13.** The radio comes up with no country set,
   which limits it to channels 1 to 11.

To tell a Magpi problem from a badge problem, open the stock **ISS Tracker**
app. It reads the same `secrets.py` and joins the same way. If it cannot
connect either, the fault is not in this repo.

**Reading what the badge actually said.** Plug it in normally, not in disk
mode, and watch the serial output:

```
.venv/bin/mpremote repl
```

Every failure prints there, including the ones the screen only summarises.

**The app starts and immediately drops back to the launcher.** Something threw
during import. Plug the badge in normally, not in disk mode, and read the error:

```
.venv/bin/mpremote repl
```

Press RESET and watch what prints.

**Files named `._notifier.py` on the badge.** macOS wrote its own metadata
files onto the drive. `badge:package` sets `COPYFILE_DISABLE` and sweeps any
that get through, so run it again rather than deleting them by hand.

**The badge says it is not paired, but you paired it.** The badge was revoked
from the website. Open Magpi on the badge and pair again with a fresh code.

## Why the apps are split into three files

Each app is three files, and the split is what makes the code testable on your
computer instead of only on hardware.

- `notifier.py` is the state machine. No SDK, no drawing, no network.
- `notifier_ui.py` draws. It takes state and puts it on a screen.
- `__init__.py` is the seam. It is the only file that imports the SDK or
  touches the globals the firmware injects.

Only the seam needs a real badge. Everything else runs under `pnpm device:test`
in a fraction of a second, which is why the test suite is worth having.
