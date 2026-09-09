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
 * Checked with the dataviz validator on 2026-09-09, against the resolved theme
 * values (brand-600 and border-stronger over each theme's surface):
 *
 *   light  #097c4f + #a0a09c   CVD dE 16.3, normal dE 21.8, contrast 8.0 / 2.6
 *   dark   #85e0ba + #6e6e6a   CVD dE 30.1, normal dE 31.8, contrast 9.6 / 3.4
 *
 * Both pass CVD separation and the normal-vision floor. Two checks fail by
 * construction and are accepted: the de-emphasis gray sits below the chroma
 * floor, which is what makes it recede, and brand-600 in dark sits above the
 * categorical lightness band, which is a fixed Supabase token. The light gray's
 * sub-3:1 contrast is why every chart here also carries a table view.
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
