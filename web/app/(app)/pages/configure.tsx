"use client";

import { useActionState, useState } from "react";

import { LedRow } from "@/components/screen/leds";
import { BadgePreview } from "@/components/screen/badge-preview";
import { IDLE } from "@/lib/actions/state";
import { SCREEN_H, SCREEN_W } from "@/lib/badge-constants";
import { ledsFor, opsFor } from "@/lib/preview/fixtures";

import { configurePageAction } from "./actions";
import { PageList, type PageRow } from "./page-list";

/** What each page lets you set. Adding a field is one entry here and one read
    in the matching builder. */
const FIELDS: Record<
  string,
  { name: string; label: string; type: "text" | "number" | "switch" }[]
> = {
  next_thing: [
    { name: "calendar_id", label: "Calendar", type: "text" },
    { name: "look_ahead_hours", label: "Look ahead, hours", type: "number" },
    { name: "skip_all_day", label: "Skip all-day events", type: "switch" },
  ],
  day_shape: [{ name: "calendar_id", label: "Calendar", type: "text" }],
  deploys: [],
  counters: [
    { name: "gmail_query", label: "Gmail search", type: "text" },
    { name: "notion_database_id", label: "Notion database id", type: "text" },
  ],
  one_number: [],
};

export function Configure({ rows }: { rows: PageRow[] }) {
  const [selected, setSelected] = useState(rows[0]?.slug ?? "next_thing");
  const [state, save, isSaving] = useActionState(configurePageAction, IDLE);

  const row = rows.find((candidate) => candidate.slug === selected);
  const fields = FIELDS[selected] ?? [];

  return (
    <div className="gap-xl flex flex-col lg:flex-row lg:items-start">
      <div className="gap-md flex w-full shrink-0 flex-col lg:w-[400px]">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xs text-ink-faint tracking-wide">ORDER AND ENABLED</h2>
          <span className="text-ink-faint text-xs">Drag to reorder</span>
        </div>
        <PageList rows={rows} selected={selected} onSelect={setSelected} />
      </div>

      <section className="gap-lg rounded-panel border-border bg-surface p-lg flex flex-1 flex-col border">
        <header className="flex items-baseline justify-between">
          <h2 className="font-display text-md font-medium">{row?.name ?? "Page"}</h2>
          <span className="font-display text-2xs text-ink-faint tracking-wide">
            {SCREEN_W} x {SCREEN_H}, ONE TO ONE
          </span>
        </header>

        <div className="gap-lg flex flex-col lg:flex-row lg:items-start">
          <div className="gap-md flex shrink-0 flex-col">
            <div className="border-border-strong border">
              <BadgePreview ops={opsFor(selected)} label={`${row?.name} on the badge`} />
            </div>
            <LedRow levels={ledsFor(selected)} />
          </div>

          <form action={save} className="gap-lg flex flex-1 flex-col">
            <input type="hidden" name="page_slug" value={selected} />
            {fields.length === 0 ? (
              <p className="text-ink-faint text-sm">
                This page has nothing to configure. It draws whatever the provider reports.
              </p>
            ) : (
              fields.map((field) => <Field key={field.name} {...field} />)
            )}

            {fields.length > 0 ? (
              <div className="gap-md flex items-center">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-panel bg-accent px-lg py-sm font-display text-accent-ink text-sm font-medium disabled:opacity-50"
                >
                  {isSaving ? "Saving" : "Save"}
                </button>
                {state.status === "idle" ? null : (
                  <span
                    role="status"
                    className={
                      state.status === "error" ? "text-critical text-sm" : "text-positive text-sm"
                    }
                  >
                    {state.message}
                  </span>
                )}
              </div>
            ) : null}
          </form>
        </div>
      </section>
    </div>
  );
}

function Field({
  name,
  label,
  type,
}: {
  name: string;
  label: string;
  type: "text" | "number" | "switch";
}) {
  if (type === "switch") {
    return (
      <label className="gap-md border-border pt-md flex items-center justify-between border-t">
        <span className="text-base">{label}</span>
        <input type="checkbox" name={name} className="size-lg accent-accent" />
      </label>
    );
  }
  return (
    <label className="gap-xs flex flex-col">
      <span className="font-display text-2xs text-ink-faint tracking-wide">
        {label.toUpperCase()}
      </span>
      <input
        type={type}
        name={name}
        className="rounded-square border-border bg-background px-md py-sm border text-base"
      />
    </label>
  );
}
