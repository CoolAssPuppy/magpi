/**
 * The three row actions, drawn rather than imported.
 *
 * An icon set on every row is the tell that gives a template away, and these
 * are the only glyphs in the product that are not the folded bird. Flat
 * strokes at one weight, sized to sit on a 14px line beside text.
 */

const BASE = {
  width: 14,
  height: 14,
  viewBox: "0 0 14 14",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
} as const;

/** Rename. */
export function PencilIcon() {
  return (
    <svg {...BASE}>
      <path d="M9.5 1.9 12.1 4.5 4.6 12H2v-2.6z" />
      <path d="M8.2 3.2 10.8 5.8" />
    </svg>
  );
}

/** Reconnect: the same account, a fresh token. */
export function RefreshIcon() {
  return (
    <svg {...BASE}>
      <path d="M12 7a5 5 0 1 1-1.5-3.6" />
      <path d="M12.4 1.6v2.9H9.5" />
    </svg>
  );
}

/** Remove. */
export function TrashIcon() {
  return (
    <svg {...BASE}>
      <path d="M2.4 3.7h9.2" />
      <path d="M5.3 3.7V2.4h3.4v1.3" />
      <path d="M3.6 3.7 4.2 12h5.6l.6-8.3" />
      <path d="M6 6.2v3.4M8 6.2v3.4" />
    </svg>
  );
}
