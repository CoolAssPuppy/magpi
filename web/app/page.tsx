import Link from "next/link";

import { DataFlow } from "@/components/data-flow";
import { FoldedMagpie, MagpieMark } from "@/components/magpie-mark";
import { ProviderMark } from "@/components/provider-mark";
import { PageCarousel, type CarouselPage } from "@/components/page-carousel";
import { BadgeDevice } from "@/components/screen/badge-device";
import { BadgePreview } from "@/components/screen/badge-preview";
import { ThemeToggle } from "@/components/theme-toggle";
import { opsFor } from "@/lib/preview/fixtures";

const PAGES: CarouselPage[] = [
  { number: "01", name: "Next thing", source: "Google Calendar", slug: "next_thing" },
  { number: "02", name: "Day shape", source: "Google Calendar", slug: "day_shape" },
  { number: "03", name: "Deploy state", source: "Vercel", slug: "deploys" },
  { number: "04", name: "Counters", source: "Gmail, Linear, Slack, Notion", slug: "counters" },
  { number: "05", name: "One number", source: "PostHog", slug: "one_number" },
].map((page) => ({ ...page, ops: opsFor(page.slug) }));

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
      <header className="border-border border-b">
        <div className="gap-lg max-w-page px-xl lg:px-4xl py-xl mx-auto flex w-full flex-wrap items-center justify-between">
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
        </div>
      </header>

      <section>
        <div className="gap-4xl max-w-page px-xl lg:px-4xl py-5xl mx-auto flex w-full flex-col items-center lg:flex-row lg:items-center lg:justify-between">
          <div className="gap-xl flex max-w-prose flex-col items-start">
            <span className="font-display text-accent text-xs tracking-wide">
              PIMORONI TUFTY 2350
            </span>
            <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
              A bird that watches your whole day.
            </h1>
            <p className="leading-prose text-ink-muted max-w-prose text-lg">
              Magpi puts your calendar, your deploys, your unread counts, and all your glanceable
              data on a badge that sits on your desk.
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
                className="rounded-panel border-border-strong px-xl py-lg font-display gap-sm inline-flex items-center border text-base"
              >
                <ProviderMark slug="github" />
                Clone me on GitHub
              </a>
            </div>
          </div>
          <FoldedMagpie className="origami w-full max-w-[660px] shrink-0" />
        </div>
      </section>

      <section className="border-border bg-surface border-t">
        <div className="gap-4xl max-w-page px-xl lg:px-4xl py-5xl mx-auto flex w-full flex-col items-start lg:flex-row lg:items-center">
          <PageCarousel pages={PAGES} />
        </div>
      </section>

      <section className="border-border border-t">
        <div className="gap-3xl max-w-page px-xl lg:px-4xl py-5xl mx-auto flex w-full flex-col">
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

            <div className="gap-md flex shrink-0 flex-col items-center self-center">
              <BadgeDevice className="max-w-full overflow-x-auto">
                <BadgePreview ops={opsFor("counters")} label="Counters, on the badge" />
              </BadgeDevice>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-border bg-surface border-t">
        <div className="gap-3xl max-w-page px-xl lg:px-4xl py-4xl mx-auto flex w-full flex-col justify-between sm:flex-row">
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
        </div>
      </footer>
    </main>
  );
}
