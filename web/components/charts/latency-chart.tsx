import { CHART_COLORS } from './palette';
import { ChartTable } from './chart-table';
import { axisTicks, bandCenter, niceCeiling, seriesPath, valueToY } from './scale';

export type LatencyPoint = {
  readonly label: string;
  readonly caption: string;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
};

const PLOT = { width: 640, height: 150 } as const;
const GUTTER = { left: 48, top: 14, bottom: 22, right: 8 } as const;
const TICK_STEPS = 4;

function formatMs(value: number | null): string {
  return value === null ? 'no answers' : `${Math.round(value).toLocaleString('en-US')} ms`;
}

function lastMeasured(values: readonly (number | null)[]): number {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] !== null) return index;
  }
  return -1;
}

/**
 * p95 is the series this panel is about, so it carries the accent and p50 stays
 * gray behind it. Both are milliseconds on one axis; a second measure would get
 * a second chart rather than a second scale.
 */
export function LatencyChart({
  title,
  description,
  points,
}: {
  title: string;
  description: string;
  points: readonly LatencyPoint[];
}) {
  const p50 = points.map((point) => point.p50Ms);
  const p95 = points.map((point) => point.p95Ms);
  const measured = [...p50, ...p95].filter((value): value is number => value !== null);
  const ceiling = niceCeiling(Math.max(...measured, 0));
  const geometry = { width: PLOT.width, height: PLOT.height, ceiling };
  const lastP95 = lastMeasured(p95);
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <section aria-labelledby="latency-chart-title">
      <h3 id="latency-chart-title" className="font-heading text-sm font-medium text-foreground">
        {title}
      </h3>
      <p className="mt-1 text-xs text-foreground-lighter">{description}</p>

      <ul
        aria-label="Series"
        className="mt-3 flex items-center gap-4 text-xs text-foreground-light"
      >
        <li className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-0.5 w-4 rounded-full"
            style={{ backgroundColor: CHART_COLORS.accent }}
          />
          p95
        </li>
        <li className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-0.5 w-4 rounded-full"
            style={{ backgroundColor: CHART_COLORS.muted }}
          />
          p50
        </li>
      </ul>

      <svg
        role="img"
        aria-label={`${title}. ${description}`}
        viewBox={`0 0 ${GUTTER.left + PLOT.width + GUTTER.right} ${GUTTER.top + PLOT.height + GUTTER.bottom}`}
        className="mt-3 h-auto w-full"
      >
        <g transform={`translate(${GUTTER.left} ${GUTTER.top})`}>
          {axisTicks(ceiling, TICK_STEPS).map((tick) => {
            const y = valueToY(tick, ceiling, PLOT.height);
            return (
              <g key={tick}>
                <line
                  x1={0}
                  x2={PLOT.width}
                  y1={y}
                  y2={y}
                  stroke={CHART_COLORS.axis}
                  strokeWidth={1}
                />
                <text
                  x={-8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-foreground-lighter text-[11px] tabular-nums"
                >
                  {Math.round(tick).toLocaleString('en-US')}
                </text>
              </g>
            );
          })}

          <path
            d={seriesPath(p50, geometry)}
            fill="none"
            stroke={CHART_COLORS.muted}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={seriesPath(p95, geometry)}
            fill="none"
            stroke={CHART_COLORS.accent}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {points.map((point, index) =>
            point.p95Ms === null ? null : (
              <circle
                key={point.label}
                cx={bandCenter(index, points.length, PLOT.width)}
                cy={valueToY(point.p95Ms, ceiling, PLOT.height)}
                r={4}
                fill={CHART_COLORS.accent}
              >
                <title>{`${point.caption}: p95 ${formatMs(point.p95Ms)}, p50 ${formatMs(point.p50Ms)}`}</title>
              </circle>
            ),
          )}

          {lastP95 >= 0 ? (
            <text
              x={bandCenter(lastP95, points.length, PLOT.width)}
              y={Math.max(valueToY(p95[lastP95] ?? 0, ceiling, PLOT.height) - 10, 9)}
              textAnchor="end"
              className="fill-foreground text-[11px] font-medium"
            >
              {formatMs(p95[lastP95])}
            </text>
          ) : null}

          {points.map((point, index) =>
            index % labelEvery === 0 || index === points.length - 1 ? (
              <text
                key={point.label}
                x={bandCenter(index, points.length, PLOT.width)}
                y={PLOT.height + 16}
                textAnchor="middle"
                className="fill-foreground-lighter text-[11px]"
              >
                {point.label}
              </text>
            ) : null,
          )}
        </g>
      </svg>

      <ChartTable
        caption="Show the numbers"
        columns={['Day', 'p50', 'p95']}
        rows={points.map((point) => [point.caption, formatMs(point.p50Ms), formatMs(point.p95Ms)])}
      />
    </section>
  );
}
