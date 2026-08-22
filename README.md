# Magpi

A desk companion for the Pimoroni Tufty 2350. Two badge apps, one gateway, one
website.

```
device/   MicroPython that runs on the badge
api/      Supabase: migrations, edge functions, pgTAP
web/      Next.js 16 site
scripts/  build and test runners
docs/     design notes and setup guides
```

## The apps

**Notifier** stays up. It joins WiFi once, polls one endpoint, and pages
between five screens with UP and DOWN: what is next in the calendar, the shape
of the day, deploy state, unread counts, and one number that matters.

**Pomodoro** never touches the network, so it opens in under a second. A proper
Pomodoro timer with physical buttons and the case LEDs.

The website is where you sign in, connect accounts, choose which Notifier pages
are on, and pair a badge. A Supabase gateway sits between them. The badge holds
one pairing token and nothing else.

## Run the tests

```
node scripts/python-tests.mjs   # device
pnpm --dir web test             # web
cd api && deno task test        # gateway
node scripts/db-test.mjs        # pgTAP
pnpm test:e2e                   # playwright
```

`pnpm gate` runs all of it plus format, lint, coverage, and a build.
`pnpm gate --strict` refuses to skip a step.

## Setup

See `docs/finish-dev-setup.md`.
