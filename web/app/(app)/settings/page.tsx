import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { getPollIntervalMs, getPomodoroSettings } from "@/lib/queries";

import { PollingForm, PomodoroForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [settings, pollIntervalMs] = await Promise.all([
    getPomodoroSettings(),
    getPollIntervalMs(),
  ]);

  return (
    <AppShell current="/settings" title="Settings">
      <div className="gap-xl flex flex-col lg:flex-row lg:items-start">
        <PomodoroForm settings={settings} />

        <div className="gap-xl flex flex-1 flex-col">
          <PollingForm pollIntervalMs={pollIntervalMs} />

          <section className="gap-lg rounded-panel border-border bg-surface p-xl flex flex-col border">
            <h2 className="font-display text-md font-medium">Theme</h2>
            <ThemeToggle />
            <p className="text-ink-faint max-w-prose text-sm">
              The badge previews stay in the badge palette either way. The badge has no light mode,
              and a preview that recoloured itself would be lying about what you will see on the
              desk.
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
