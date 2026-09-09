import { CHART_COLORS } from './palette';

export type MeterSeverity = 'within' | 'near' | 'over';

export type MeterProps = {
  readonly label: string;
  readonly used: number;
  readonly limit: number | null;
  readonly unit: string;
  /** For values a comma-grouped integer reads badly as, such as bytes. */
  readonly formatValue?: (value: number) => string;
};

/** Where the warning starts. Below this the meter says nothing but the number. */
const NEAR_LIMIT = 0.8;

export function meterSeverity(used: number, limit: number | null): MeterSeverity {
  if (limit === null || limit <= 0) return 'within';
  const ratio = used / limit;
  if (ratio >= 1) return 'over';
  if (ratio >= NEAR_LIMIT) return 'near';
  return 'within';
}

const SEVERITY_COLOR: Record<MeterSeverity, string> = {
  within: CHART_COLORS.accent,
  near: CHART_COLORS.warning,
  over: CHART_COLORS.critical,
};

const SEVERITY_WORD: Record<MeterSeverity, string | null> = {
  within: null,
  near: 'Near the limit',
  over: 'Over the limit',
};

function defaultFormat(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * A single ratio against a limit. Severity is carried by a word as well as the
 * fill, because a color on its own is not a state anyone can read.
 *
 * With no limit there is no ratio, so the track is left out. A bar that can
 * never fill reads as a broken gauge rather than as an unlimited one.
 */
export function Meter({ label, used, limit, unit, formatValue = defaultFormat }: MeterProps) {
  const severity = meterSeverity(used, limit);
  const filled = limit === null || limit <= 0 ? 0 : Math.min(used / limit, 1) * 100;
  const word = SEVERITY_WORD[severity];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm text-foreground-light">{label}</p>
        <p className="text-sm text-foreground tabular-nums">
          {formatValue(used)}
          {limit === null ? null : (
            <span className="text-foreground-lighter"> / {formatValue(limit)}</span>
          )}
          <span className="sr-only"> {unit}</span>
        </p>
      </div>

      {limit === null ? null : (
        <div
          role="meter"
          aria-label={label}
          aria-valuenow={used}
          aria-valuemin={0}
          aria-valuemax={limit}
          className="h-1.5 overflow-hidden rounded-full bg-background-surface-300"
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${filled}%`, backgroundColor: SEVERITY_COLOR[severity] }}
          />
        </div>
      )}

      {word ? <p className="text-xs text-foreground-light">{word}</p> : null}
    </div>
  );
}
