import Link from "next/link";

import { DataFlow } from "@/components/data-flow";
import { FoldedMagpie, MagpieMark } from "@/components/magpie-mark";
import { ProviderMark } from "@/components/provider-mark";
import { BadgePreview } from "@/components/screen/badge-preview";
import { ThemeToggle } from "@/components/theme-toggle";
import { opsFor } from "@/lib/preview/fixtures";

const PAGES = [
  { number: "01", name: "Next thing", source: "Google Calendar" },
  { number: "02", name: "Day shape", source: "Google Calendar" },
  { number: "03", name: "Deploy state", source: "Vercel" },
  { number: "04", name: "Counters", source: "Gmail, Linear, Slack, Notion" },
  { number: "05", name: "One number", source: "PostHog" },
];

// The providers table, in its own position order. Some ship disabled until an
// app is registered for them; the homepage still names them, because this is
// the list of what Magpi reads, not the list of what is switched on today.
const PROVIDERS = [
  { slug: "google", name: "Google", kind: "OAUTH" },
  { slug: "linear", name: "Linear", kind: "OAUTH" },
  { slug: "slack", name: "Slack", kind: "OAUTH" },
  { slug: "notion", name: "Notion", kind: "OAUTH" },
  { slug: "github", name: "GitHub", kind: "OAUTH" },
  { slug: "vercel", name: "Vercel", kind: "API KEY" },
  { slug: "posthog", name: "PostHog", kind: "API KEY" },
];

export default function HomePage() {
  return (
    <main>
      <header className="gap-lg border-border px-xl lg:px-4xl py-xl flex flex-wrap items-center justify-between border-b">
        <div className="gap-md flex items-center">
          <MagpieMark />
          <span className="font-display text-md font-bold">Magpi</span>
        </div>
        <nav className="gap-lg flex items-center">
          <Link
            href="/login"
            className="rounded-panel bg-action px-lg py-sm font-display text-action-ink text-sm font-medium"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <section className="gap-4xl px-xl lg:px-4xl py-5xl flex flex-col items-center lg:flex-row lg:items-center lg:justify-between">
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
              className="rounded-panel bg-action px-xl py-lg font-display text-action-ink text-base font-medium"
            >
              Sign in with GitHub
            </Link>
            <a
              href="https://github.com/CoolAssPuppy/magpi"
              className="rounded-panel border-border-strong px-xl py-lg font-display border text-base"
            >
              Read the build
            </a>
          </div>
        </div>
        <FoldedMagpie className="w-full max-w-[660px] shrink-0" />
      </section>

      <section className="gap-4xl border-border bg-surface px-xl lg:px-4xl py-5xl flex flex-col items-start border-t lg:flex-row lg:items-center">
        <div className="rounded-round border-border bg-raised p-lg sm:p-xl max-w-full shrink-0 overflow-x-auto border">
          <BadgePreview ops={opsFor("next_thing")} label="Next thing, on the badge" />
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

      <section className="gap-3xl border-border px-xl lg:px-4xl py-5xl flex flex-col border-t">
        <h2 className="font-display text-2xl font-bold leading-tight lg:text-3xl">
          Your data, on your device.
        </h2>
        <div className="gap-xl flex flex-col lg:flex-row lg:items-stretch">
          <ul className="w-full shrink-0 lg:w-[300px]">
            {PROVIDERS.map((provider) => (
              <li
                key={provider.slug}
                className="gap-md bg-surface px-lg py-md border-border flex items-center border-b last:border-b-0"
              >
                <span className="text-ink-muted flex shrink-0 items-center">
                  <ProviderMark slug={provider.slug} />
                </span>
                <span className="font-display flex-1 text-base">{provider.name}</span>
                <span className="w-4xl font-display text-2xs text-ink-faint shrink-0 text-right">
                  {provider.kind}
                </span>
              </li>
            ))}
          </ul>

          {/* Absolute inside a stretched box, so the row's height comes from
              the provider list and every lane leaves level with its row. */}
          <div className="relative min-h-[180px] flex-1 self-stretch">
            <div className="absolute inset-0">
              <DataFlow lanes={PROVIDERS.length} />
            </div>
          </div>

          <div className="gap-sm bg-surface px-lg py-lg border-border flex w-full shrink-0 flex-col justify-center self-center border lg:w-[220px]">
            <span className="font-display text-base">Your badge</span>
            <span className="text-ink-faint text-sm leading-snug">
              One pairing token. Nothing else on the device.
            </span>
          </div>
        </div>
      </section>

      <footer className="gap-3xl border-border bg-surface px-xl lg:px-4xl py-4xl flex flex-col justify-between border-t sm:flex-row">
        <div className="gap-lg flex max-w-prose flex-col items-start">
          <div className="gap-md flex items-center">
            <MagpieMark />
            <span className="font-display text-md font-bold">Magpi</span>
          </div>
          <p className="text-ink-faint text-sm leading-snug">
            A desk companion for the Pimoroni Tufty 2350.
          </p>
          <ThemeToggle />
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
