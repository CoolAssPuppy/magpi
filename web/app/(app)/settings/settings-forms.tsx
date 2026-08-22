"use client";

import { useActionState, useState } from "react";

import { IDLE, type ActionState } from "@/lib/actions/state";
import { MIN_POLL_MS } from "@/lib/badge-constants";
import { MAX_POLL_MS } from "@/lib/db";
import type { PomodoroSettingsRow } from "@/lib/rows";

import { savePollingAction, savePomodoroAction } from "./actions";

const POMODORO_FIELDS = [
  { name: "work_min", label: "WORK", unit: "min" },
  { name: "short_min", label: "SHORT BREAK", unit: "min" },
  { name: "long_min", label: "LONG BREAK", unit: "min" },
  { name: "sessions", label: "SET", unit: "" },
] as const;

export function PomodoroForm({ settings }: { settings: PomodoroSettingsRow }) {
  const [state, save, isSaving] = useActionState(savePomodoroAction, IDLE);

  return (
    <form
      action={save}
      className="gap-xl rounded-panel border-border bg-surface p-xl flex w-full shrink-0 flex-col border lg:w-[520px]"
    >
      <div className="gap-xs flex flex-col">
        <h2 className="font-display text-md font-medium">Pomodoro</h2>
      </div>

      <div className="gap-md flex flex-wrap">
        {POMODORO_FIELDS.map((field) => (
          <label key={field.name} className="gap-xs flex min-w-[100px] flex-1 flex-col">
            <span className="font-display text-2xs text-ink-faint tracking-wide">
              {field.label}
            </span>
            <span className="gap-2xs rounded-square border-border bg-background px-md py-sm flex items-baseline border">
              <input
                type="number"
                name={field.name}
                defaultValue={settings[field.name]}
                min={field.name === "sessions" ? 2 : 1}
                max={field.name === "sessions" ? 8 : 120}
                className="font-display w-full bg-transparent text-xl outline-none"
                data-numeric
              />
              {field.unit ? (
                <span className="font-display text-ink-faint text-xs">{field.unit}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>

      <label className="gap-md border-border pt-lg flex items-center justify-between border-t">
        <span className="gap-3xs flex flex-col">
          <span className="text-base">Use the case LEDs</span>
          <span className="text-ink-faint text-xs">
            The badge will light up closer to the last minute.
          </span>
        </span>
        <input
          type="checkbox"
          name="leds"
          value="true"
          defaultChecked={settings.leds}
          className="size-lg accent-accent"
        />
      </label>

      <SaveRow state={state} isSaving={isSaving} />
    </form>
  );
}

export function PollingForm({ pollIntervalMs }: { pollIntervalMs: number }) {
  const [value, setValue] = useState(pollIntervalMs);
  const [state, save, isSaving] = useActionState(savePollingAction, IDLE);

  return (
    <form
      action={save}
      className="gap-lg rounded-panel border-border bg-surface p-xl flex flex-col border"
    >
      <h2 className="font-display text-md font-medium">Polling</h2>

      <label className="gap-sm flex flex-col">
        <span className="gap-lg flex items-baseline justify-between">
          <span className="text-ink-muted text-sm">
            The badge checks in with the server to get the latest data.
          </span>
          <span className="font-display shrink-0 text-xl" data-numeric>
            {formatInterval(value)}
          </span>
        </span>
        <input
          type="range"
          name="poll_interval_ms"
          min={MIN_POLL_MS}
          max={MAX_POLL_MS}
          step={5000}
          value={value}
          onChange={(event) => setValue(Number(event.target.value))}
          className="accent-accent"
        />
        <span className="font-display text-2xs text-ink-faint flex justify-between">
          <span>{formatInterval(MIN_POLL_MS)}</span>
          <span>{formatInterval(MAX_POLL_MS)}</span>
        </span>
      </label>

      <SaveRow state={state} isSaving={isSaving} />
    </form>
  );
}

function SaveRow({ state, isSaving }: { state: ActionState; isSaving: boolean }) {
  return (
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
          className={state.status === "error" ? "text-critical text-sm" : "text-positive text-sm"}
        >
          {state.message}
        </span>
      )}
    </div>
  );
}

function formatInterval(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)} s`;
  const minutes = ms / 60000;
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`;
}
