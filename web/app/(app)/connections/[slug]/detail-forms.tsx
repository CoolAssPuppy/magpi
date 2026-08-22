"use client";

import { useActionState } from "react";

import { IDLE } from "@/lib/actions/state";

import { beginOAuthAction, disconnectAction, saveApiKeyAction } from "./actions";

/** The extra values a provider needs that are not the secret. */
const META_FIELDS: Record<string, { name: string; label: string; placeholder: string }[]> = {
  posthog: [
    { name: "host", label: "Host", placeholder: "us.posthog.com" },
    { name: "project_id", label: "Project id", placeholder: "64213" },
    { name: "insight_id", label: "Insight id", placeholder: "aX9k2Lp" },
  ],
  vercel: [{ name: "team_id", label: "Team id, optional", placeholder: "team_abc123" }],
};

export function AuthorizeForm({
  provider,
  isConnected,
}: {
  provider: string;
  isConnected: boolean;
}) {
  return (
    <form action={beginOAuthAction}>
      <input type="hidden" name="provider" value={provider} />
      <button
        type="submit"
        className={
          isConnected
            ? "rounded-panel border-border-strong px-lg py-md font-display border text-base"
            : "rounded-panel bg-accent px-lg py-md font-display text-accent-ink text-base font-medium"
        }
      >
        {isConnected ? "Reauthorize" : "Authorize"}
      </button>
    </form>
  );
}

export function ApiKeyForm({ provider }: { provider: string }) {
  const [state, save, isSaving] = useActionState(saveApiKeyAction, IDLE);
  const meta = META_FIELDS[provider] ?? [];

  return (
    <form
      action={save}
      className="gap-lg rounded-panel border-border bg-surface p-lg flex flex-col border"
    >
      <input type="hidden" name="provider" value={provider} />

      <label className="gap-xs flex flex-col">
        <span className="font-display text-2xs text-ink-faint tracking-wide">PERSONAL API KEY</span>
        <input
          type="password"
          name="api_key"
          required
          autoComplete="off"
          spellCheck={false}
          className="rounded-square border-border bg-background px-md py-sm font-display border text-base"
        />
        <span className="text-ink-faint text-xs">
          Encrypted before it is stored. The website never reads it back.
        </span>
      </label>

      {meta.length > 0 ? (
        <div className="gap-md flex flex-wrap">
          {meta.map((field) => (
            <label key={field.name} className="gap-xs flex min-w-[180px] flex-1 flex-col">
              <span className="font-display text-2xs text-ink-faint tracking-wide">
                {field.label.toUpperCase()}
              </span>
              <input
                type="text"
                name={field.name}
                placeholder={field.placeholder}
                className="rounded-square border-border bg-background px-md py-sm border text-base"
              />
            </label>
          ))}
        </div>
      ) : null}

      <div className="gap-md flex items-center">
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-panel bg-accent px-lg py-md font-display text-accent-ink text-base font-medium disabled:opacity-50"
        >
          {isSaving ? "Testing" : "Save and test"}
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
    </form>
  );
}

export function DisconnectForm({ provider }: { provider: string }) {
  const [state, run, isRunning] = useActionState(disconnectAction, IDLE);

  return (
    <form action={run} className="gap-md flex items-center">
      <input type="hidden" name="provider" value={provider} />
      <button
        type="submit"
        disabled={isRunning}
        className="rounded-panel border-critical px-lg py-md font-display text-critical border text-base disabled:opacity-50"
      >
        {isRunning ? "Disconnecting" : "Disconnect"}
      </button>
      {state.status === "idle" ? null : (
        <span role="status" className="text-ink-muted text-sm">
          {state.message}
        </span>
      )}
    </form>
  );
}
