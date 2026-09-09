/**
 * The one chart palette. Every mark in the app reads a value from here, so the
 * charts are a single visual system and a color can never arrive from outside
 * the Supabase token set.
 *
 * The form these charts use is emphasis, not categorical: one accent series
 * carries the story and its companion recedes to a gray. That is deliberate.
 * A validated categorical palette needs hues the Supabase token set does not
 * expose, and a chart of two series where one is the point does not need one.
 *
 * The resolved values, the dataviz validator run against them, and the reasoning
 * behind the three results that are marked and accepted, are in docs/design.md
 * under "Chart palette validation".
 */
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

export type ChartColor = (typeof CHART_COLORS)[keyof typeof CHART_COLORS];
