"use client";

import { useActionState, useState } from "react";

import { IDLE, type ActionState } from "@/lib/actions/state";

import { beginOAuthAction, saveApiKeyAction } from "./actions";

/** The extra values a provider needs that are not the secret. */
const META_FIELDS: Record<string, { name: string; label: string; placeholder: string }[]> = {
  posthog: [
    { name: "host", label: "Host", placeholder: "us.posthog.com" },
    { name: "project_id", label: "Project id", placeholder: "64213" },
    { name: "insight_id", label: "Insight id", placeholder: "aX9k2Lp" },
  ],
  vercel: [{ name: "team_id", label: "Team id, optional", placeholder: "team_abc123" }],
};

export interface ConnectProps {
  provider: string;
  kind: "oauth" | "api_key";
}

/** The action at the end of a provider's row, and the field it may open. */
export function Connect({ provider, kind }: ConnectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, save, isSaving] = useActionState(saveApiKeyAction, IDLE);

  // Close the panel once the key saves. Adjusted while rendering rather than
  // in an effect, which is what the lint rule is about.
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.status === "success") setIsOpen(false);
  }

  if (kind === "oauth") {
    return (
      <form action={beginOAuthAction}>
        <input type="hidden" name="provider" value={provider} />
        <button type="submit" className={PRIMARY}>
          Connect
        </button>
      </form>
    );
  }

  return (
    <div className="flex items-center">
      <button type="button" onClick={() => setIsOpen((open) => !open)} className={PRIMARY}>
        Add key
      </button>
      {isOpen ? (
        <ApiKeyFields
          provider={provider}
          state={state}
          save={save}
          isSaving={isSaving}
          onCancel={() => setIsOpen(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * Opens under the row rather than on a page of its own.
 *
 * Pasting a key is one field and a button, and a whole screen to hold them is
 * a screen you have to come back from.
 */
function ApiKeyFields({
  provider,
  state,
  save,
  isSaving,
  onCancel,
}: {
  provider: string;
  state: ActionState;
  save: (form: FormData) => void;
  isSaving: boolean;
  onCancel: () => void;
}) {
  const meta = META_FIELDS[provider] ?? [];

  return (
    <form
      action={save}
      className="gap-md border-border bg-raised p-lg rounded-panel absolute right-0 top-full z-10 mt-1 flex w-[420px] max-w-[80vw] flex-col border shadow-lg"
    >
      <input type="hidden" name="provider" value={provider} />

      <label className="gap-xs flex flex-col">
        <span className="font-display text-2xs text-ink-faint tracking-wide">PERSONAL API KEY</span>
        <input
          type="password"
          name="api_key"
          required
          autoFocus
          autoComplete="off"
          spellCheck={false}
          className="rounded-square border-border bg-background px-md py-sm font-display border text-base"
        />
        <span className="text-ink-faint text-xs">
          Encrypted before it is stored. The website never reads it back.
        </span>
      </label>

      {meta.map((field) => (
        <label key={field.name} className="gap-xs flex flex-col">
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

      <div className="gap-md flex items-center">
        <button type="submit" disabled={isSaving} className={PRIMARY}>
          {isSaving ? "Testing" : "Save and test"}
        </button>
        <button type="button" onClick={onCancel} className="text-ink-muted hover:text-ink text-sm">
          Cancel
        </button>
        {state.status === "error" ? (
          <span role="status" className="text-critical text-sm">
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}

const PRIMARY =
  "rounded-panel bg-action px-lg py-sm font-display text-action-ink text-sm font-medium";
