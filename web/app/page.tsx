import Link from "next/link";

import { FoldedMagpie, MagpieMark } from "@/components/magpie-mark";
import { ScreenPreview } from "@/components/screen/screen-preview";
import { ThemeToggle } from "@/components/theme-toggle";

const PAGES = [
  { number: "01", name: "Next thing", source: "Google Calendar" },
  { number: "02", name: "Day shape", source: "Google Calendar" },
  { number: "03", name: "Deploy state", source: "Vercel" },
  { number: "04", name: "Counters", source: "Gmail, Linear, Slack" },
  { number: "05", name: "One number", source: "PostHog" },
];

const PROVIDERS = [
  { name: "Google", kind: "OAUTH" },
  { name: "Linear", kind: "OAUTH" },
  { name: "Slack", kind: "OAUTH" },
  { name: "Vercel", kind: "API KEY" },
  { name: "PostHog", kind: "API KEY" },
];

export default function HomePage() {
  return (
    <main>
      <header className="border-border px-2xl py-xl flex items-center justify-between border-b">
        <div className="gap-md flex items-center">
          <MagpieMark />
          <span className="font-display text-md font-bold">Magpi</span>
        </div>
        <nav className="gap-xl flex items-center">
          <Link href="/login" className="font-display text-ink-muted hover:text-ink text-sm">
            Pages
          </Link>
          <a
            href="https://shop.pimoroni.com"
            className="font-display text-ink-muted hover:text-ink text-sm"
          >
            Hardware
          </a>
          <a
            href="https://github.com/CoolAssPuppy/magpi"
            className="font-display text-ink-muted hover:text-ink text-sm"
          >
            Source
          </a>
          <ThemeToggle />
          <Link
            href="/login"
            className="rounded-panel bg-accent px-lg py-sm font-display text-accent-ink text-sm font-medium"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <section className="gap-4xl px-2xl py-5xl flex flex-col items-center lg:flex-row lg:items-center lg:justify-between">
        <div className="gap-xl flex max-w-prose flex-col items-start">
          <span className="font-display text-accent text-xs tracking-wide">
            PIMORONI TUFTY 2350
          </span>
          <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
            A bird that watches your whole day.
          </h1>
          <p className="leading-prose text-ink-muted max-w-prose text-lg">
            Magpi puts your calendar, your deploys, your unread counts, and all your glanceable data
            on a badge that sits on your desk.
          </p>
          <div className="gap-md flex flex-wrap items-center">
            <Link
              href="/login"
              className="rounded-panel bg-accent px-xl py-md font-display text-accent-ink text-base font-medium"
            >
              Sign in with GitHub
            </Link>
            <a
              href="https://github.com/CoolAssPuppy/magpi"
              className="rounded-panel border-border-strong px-xl py-md font-display border text-base"
            >
              Read the build
            </a>
          </div>
        </div>
        <FoldedMagpie className="w-full max-w-[660px] shrink-0" />
      </section>

      <section className="gap-4xl border-border bg-surface px-2xl py-5xl flex flex-col items-start border-t lg:flex-row lg:items-center">
        <div className="rounded-round border-border bg-raised p-xl shrink-0 border">
          <ScreenPreview page="next_thing" />
        </div>
        <div className="gap-xl flex flex-col items-start">
          <h2 className="font-display text-2xl font-bold leading-tight lg:text-3xl">
            Every page at a glance
          </h2>
          <p className="text-md leading-prose text-ink-muted max-w-prose">
            What&rsquo;s next. What&rsquo;s today. What&rsquo;s deployed. Pick what you want to see
            every day.
          </p>
          <ul className="max-w-panel border-border w-full border-t">
            {PAGES.map((page) => (
              <li
                key={page.number}
                className="gap-lg border-border py-md flex items-center border-b last:border-b-0"
              >
                <span className="w-2xl font-display text-accent shrink-0 text-xs">
                  {page.number}
                </span>
                <span className="font-display flex-1 text-base">{page.name}</span>
                <span className="text-ink-faint shrink-0 text-sm">{page.source}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="gap-3xl border-border px-2xl py-5xl flex flex-col border-t">
        <h2 className="font-display text-2xl font-bold leading-tight lg:text-3xl">
          Your data, on your device.
        </h2>
        <div className="gap-xl flex flex-col lg:flex-row lg:items-stretch">
          <ul className="w-full shrink-0 lg:w-[300px]">
            {PROVIDERS.map((provider) => (
              <li
                key={provider.name}
                className="gap-md border-l-edge border-accent bg-surface px-lg py-md flex items-center"
              >
                <span className="font-display flex-1 text-base">{provider.name}</span>
                <span className="w-4xl font-display text-2xs text-ink-faint shrink-0 text-right">
                  {provider.kind}
                </span>
              </li>
            ))}
          </ul>
          <div className="gap-lg px-3xl flex flex-1 flex-col justify-center">
            <div className="gap-xs rounded-panel border-accent bg-surface px-lg py-xl flex flex-col items-center border">
              <span className="font-display text-base font-medium">GET /gateway/desk</span>
              <span className="text-ink-muted text-sm">
                Encrypted at rest. Cached per provider. One route.
              </span>
            </div>
          </div>
          <div className="gap-sm border-l-edge border-accent bg-surface px-lg py-xl flex w-full shrink-0 flex-col justify-center lg:w-[220px]">
            <span className="font-display text-base">Your badge</span>
            <span className="text-ink-faint text-sm leading-snug">
              One pairing token. Nothing else on the device.
            </span>
          </div>
        </div>
      </section>

      <footer className="gap-3xl border-border bg-surface px-2xl py-4xl flex flex-col justify-between border-t sm:flex-row">
        <div className="gap-md flex max-w-prose flex-col">
          <div className="gap-md flex items-center">
            <MagpieMark />
            <span className="font-display text-md font-bold">Magpi</span>
          </div>
          <p className="text-ink-faint text-sm leading-snug">
            A desk companion for the Pimoroni Tufty 2350.
          </p>
        </div>
        <div className="gap-4xl flex">
          <div className="gap-sm flex flex-col">
            <span className="font-display text-2xs text-ink-faint tracking-wide">BUILD</span>
            <a href="https://github.com/CoolAssPuppy/magpi" className="text-base">
              Source
            </a>
            <a
              href="https://github.com/CoolAssPuppy/magpi/blob/main/docs/finish-dev-setup.md"
              className="text-base"
            >
              Setup guide
            </a>
            <a
              href="https://github.com/CoolAssPuppy/magpi/blob/main/docs/DESIGN.md"
              className="text-base"
            >
              Design notes
            </a>
          </div>
          <div className="gap-sm flex flex-col">
            <span className="font-display text-2xs text-ink-faint tracking-wide">HARDWARE</span>
            <a href="https://shop.pimoroni.com" className="text-base">
              Tufty 2350
            </a>
            <a href="https://github.com/pimoroni/badgeware-docs" className="text-base">
              Badgeware docs
            </a>
            <a href="https://github.com/pimoroni/tufty2350" className="text-base">
              Firmware
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
