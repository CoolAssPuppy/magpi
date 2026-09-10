/** The one chart palette, built for emphasis rather than category. See docs/design.md. */
export const CHART_COLORS = {
  /** The series the panel is about. */
  accent: 'var(--color-brand-600)',
  /** Context beside the accent. Never the subject of a chart. */
  muted: 'var(--color-border-stronger)',
  /** Gridlines and axis rules, one step off the surface. */
  axis: 'var(--color-border)',
  /** Meters only, and always beside a word saying the same thing. */
  warning: 'var(--color-warning-600)',
  critical: 'var(--color-destructive-600)',
} as const;
