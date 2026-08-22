import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
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
        </div>
      </div>
    </AppShell>
  );
}
