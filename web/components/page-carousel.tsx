"use client";

import { useEffect, useState } from "react";

import { BadgeDevice } from "@/components/screen/badge-device";
import { BadgePreview } from "@/components/screen/badge-preview";
import type { DrawOp } from "@/lib/preview/types";

export interface CarouselPage {
  number: string;
  name: string;
  source: string;
  slug: string;
  ops: DrawOp[];
}

/** How long each page holds before the badge turns to the next one. */
const HOLD_MS = 3600;

/**
 * The five pages, cycling on the badge, with the one on screen picked out.
 *
 * The list and the device are one control rather than a picture beside a
 * table: whatever the badge is showing is the row that is lit, and choosing a
 * row turns the badge to it. Cycling stops for good on the first click,
 * because a carousel that keeps moving under someone reading it is a carousel
 * fighting its reader.
 */
export function PageCarousel({ pages }: { pages: CarouselPage[] }) {
  const [current, setCurrent] = useState(0);
  const [isAuto, setIsAuto] = useState(true);

  useEffect(() => {
    if (!isAuto || pages.length < 2) return;
    const timer = setInterval(() => setCurrent((at) => (at + 1) % pages.length), HOLD_MS);
    return () => clearInterval(timer);
  }, [isAuto, pages.length]);

  const showing = pages[current];

  return (
    <div className="gap-4xl flex w-full flex-col items-start lg:flex-row lg:items-center">
      <BadgeDevice glow className="max-w-full overflow-x-auto">
        {pages.map((page, index) => (
          <div
            key={page.slug}
            // Every page is mounted and stacked; only the current one is up.
            // Swapping opacity rather than the tree keeps the fold from
            // restarting the replay underneath it.
            className={
              index === current
                ? "fold-in absolute inset-0"
                : "pointer-events-none absolute inset-0 opacity-0"
            }
            aria-hidden={index === current ? undefined : true}
          >
            <BadgePreview ops={page.ops} label={`${page.name}, on the badge`} />
          </div>
        ))}
      </BadgeDevice>

      <div className="gap-xl flex flex-col items-start">
        <h2 className="font-display text-2xl font-bold leading-tight lg:text-3xl">
          Every page at a glance
        </h2>
        <p className="text-md leading-prose text-ink-muted max-w-prose">
          What&rsquo;s next. What&rsquo;s today. What&rsquo;s deployed. Pick what you want to see
          every day.
        </p>

        <ul className="max-w-panel border-border w-full border-t">
          {pages.map((page, index) => {
            const isShowing = index === current;
            return (
              <li key={page.slug} className="border-border border-b last:border-b-0">
                <button
                  type="button"
                  aria-current={isShowing ? "true" : undefined}
                  onClick={() => {
                    setCurrent(index);
                    setIsAuto(false);
                  }}
                  className={`gap-lg py-md px-sm -mx-sm hover:text-ink flex w-full items-center text-left ${
                    isShowing ? "text-ink" : "text-ink-muted"
                  }`}
                >
                  <span
                    className={`w-2xl font-display shrink-0 text-xs ${
                      isShowing ? "text-accent" : "text-ink-faint"
                    }`}
                  >
                    {page.number}
                  </span>
                  <span className="font-display flex-1 text-base">{page.name}</span>
                  <span className="text-ink-faint shrink-0 text-sm">{page.source}</span>
                  {/* The lit rail. It travels because only one exists. */}
                  <span
                    aria-hidden="true"
                    className={`rounded-pill w-3xs self-stretch ${
                      isShowing ? "bg-accent" : "bg-transparent"
                    }`}
                  />
                </button>
              </li>
            );
          })}
        </ul>

        <p aria-live="polite" className="text-ink-faint text-sm">
          Showing {showing?.name ?? "nothing"}.
        </p>
      </div>
    </div>
  );
}
