import { CHART_COLORS } from './palette';
import { ChartTable } from './chart-table';
import { axisTicks, bandCenter, barWidth, headingIdFor, niceCeiling, valueToY } from './scale';

export type ColumnPoint = {
  readonly label: string;
  readonly caption: string;
  readonly value: number;
};

const PLOT = { width: 640, height: 150 } as const;
const GUTTER = { left: 48, top: 14, bottom: 22 } as const;
const MAX_BAR = 24;
const TICK_STEPS = 4;

function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

/** One series over time. A day with no traffic draws as a zero rather than disappearing. */
export function ColumnChart({
  title,
  description,
  points,
  unitLabel,
}: {
  title: string;
  description: string;
  points: readonly ColumnPoint[];
  unitLabel: string;
}) {
  const ceiling = niceCeiling(Math.max(...points.map((point) => point.value), 0));
  const width = barWidth(points.length, PLOT.width, MAX_BAR);
  const peak = points.reduce(
    (highest, point) => (point.value > highest.value ? point : highest),
    points[0],
  );
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  const headingId = headingIdFor(title);

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="font-heading text-sm font-medium text-foreground">
        {title}
      </h3>
      <p className="mt-1 text-xs text-tertiary-foreground">{description}</p>

      <svg
        role="img"
        aria-label={`${title}. ${description}`}
        viewBox={`0 0 ${GUTTER.left + PLOT.width} ${GUTTER.top + PLOT.height + GUTTER.bottom}`}
        className="mt-4 h-auto w-full"
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
                  className="fill-tertiary-foreground text-[11px] tabular-nums"
                >
                  {formatNumber(Math.round(tick))}
                </text>
              </g>
            );
          })}

          {points.map((point, index) => {
            const y = valueToY(point.value, ceiling, PLOT.height);
            const x = bandCenter(index, points.length, PLOT.width) - width / 2;
            return (
              <rect
                key={point.label}
                x={x}
                y={y}
                width={width}
                height={Math.max(PLOT.height - y, point.value > 0 ? 2 : 0)}
                rx={2}
                fill={CHART_COLORS.accent}
              >
                <title>{`${point.caption}: ${formatNumber(point.value)} ${unitLabel}`}</title>
              </rect>
            );
          })}

          {peak && peak.value > 0 ? (
            <text
              x={bandCenter(points.indexOf(peak), points.length, PLOT.width)}
              y={Math.max(valueToY(peak.value, ceiling, PLOT.height) - 6, 9)}
              textAnchor="middle"
              className="fill-foreground text-[11px] font-medium"
            >
              {formatNumber(peak.value)}
            </text>
          ) : null}

          {points.map((point, index) =>
            index % labelEvery === 0 || index === points.length - 1 ? (
              <text
                key={point.label}
                x={bandCenter(index, points.length, PLOT.width)}
                y={PLOT.height + 16}
                textAnchor="middle"
                className="fill-tertiary-foreground text-[11px]"
              >
                {point.label}
              </text>
            ) : null,
          )}
        </g>
      </svg>

      <ChartTable
        caption="Show the numbers"
        columns={['Day', unitLabel]}
        rows={points.map((point) => [point.caption, formatNumber(point.value)])}
      />
    </section>
  );
}
