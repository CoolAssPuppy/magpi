# Putting Magpi on a badge

This gets the two apps and the SDK onto a Pimoroni Tufty 2350. It takes about
five minutes. You need the badge, a USB-C cable, and this repo checked out.

## What goes where

The badge holds one copy of the SDK, shared by both apps.

```
/system/apps/Notifier/       the notifier app
/system/apps/Pomodoro/       the pomodoro timer
/system/badge/sdk/sb/        the SDK both apps import
```

The launcher lists every folder that has an `icon.png` in it, and uses the
folder name as the tile label. There is no title field. That is why the repo
folder `notifier-app` is copied to the badge as `Notifier`.

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
pnpm badge:package
```

That copies both apps and the SDK, and prints how many files it wrote. It
skips the test folders and the recording tools, because neither can run on a
badge.

Want to see what it would copy without a badge plugged in?

```
pnpm badge:package -- --out dist/badge
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
pnpm badge:package
```

You do not need to reinstall the SDK separately. `badge:package` refreshes all
three folders every time.

## If something goes wrong

**The launcher does not list an app.** The folder needs an `icon.png`. Run
`python3 scripts/gen-icons.py` and copy again.

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
