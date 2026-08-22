"use client";

import { useSyncExternalStore } from "react";

import { applyTheme, isTheme, THEME_STORAGE_KEY, THEMES, type Theme } from "@/lib/theme";

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changing the choice should move this toggle too.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : "system";
  } catch {
    // A private window, or site data blocked. The default is correct.
    return "system";
  }
}

/** The server cannot know the stored choice, so it renders the default. */
function serverTheme(): Theme {
  return "system";
}

const LABELS: Record<Theme, string> = { light: "Light", dark: "Dark", system: "Auto" };

/**
 * Three states, reachable from every page including sign in.
 *
 * localStorage is an external store, so it is read through useSyncExternalStore
 * rather than an effect that sets state. The inline script in the layout has
 * already applied the attribute before first paint, so nothing flashes while
 * this catches up.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readStoredTheme, serverTheme);

  function choose(next: Theme) {
    applyTheme(document.documentElement, next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The choice still applies to this page.
    }
    for (const listener of listeners) listener();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="rounded-panel border-border flex overflow-hidden border"
    >
      {THEMES.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={theme === option}
          onClick={() => choose(option)}
          className={
            theme === option
              ? "bg-invert-ground px-md py-xs font-display text-invert-ink text-xs"
              : "px-md py-xs font-display text-ink-muted hover:text-ink text-xs"
          }
        >
          {LABELS[option]}
        </button>
      ))}
    </div>
  );
}
