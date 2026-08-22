export const THEME_STORAGE_KEY = "magpi-theme";

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/**
 * Applies a choice to the document root.
 *
 * "system" removes the attribute rather than writing it, because the token
 * layer's dark block is guarded on the attribute being absent or dark. Writing
 * data-theme="system" would leave the page in light while the OS is dark.
 */
export function applyTheme(root: HTMLElement, theme: Theme): void {
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

/**
 * Runs before first paint, inlined in the document head. Without it a visitor
 * who chose light on a dark OS sees a dark flash on every navigation.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}`;
