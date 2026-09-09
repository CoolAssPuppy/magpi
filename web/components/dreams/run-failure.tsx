import type { DreamStatusView } from '@/lib/dreams/status';

/**
 * Where the Edge Function ceiling becomes visible to a person.
 *
 * A large space is expected to exceed the CPU and wall-clock budget, so this
 * names the stage the run died in and how much it was reading when it happened.
 * Without the stage, a timeout is a shrug.
 */
export function RunFailure({
  status,
  inputSummary,
}: {
  status: DreamStatusView;
  inputSummary: string;
}) {
  if (status.status !== 'timeout' && status.status !== 'failed') return null;

  const tone =
    status.status === 'timeout'
      ? 'border-border-warning bg-warning-200 text-warning-600'
      : 'border-border-destructive bg-destructive-200 text-destructive-600';

  return (
    <div role="status" className={`rounded-[var(--radius-panel)] border px-4 py-3 ${tone}`}>
      <p className="text-sm font-medium">
        {status.stage ? (
          <>
            {status.label} during <span className="font-mono">{status.stage}</span>
          </>
        ) : (
          <>{status.label}, and the stage was not recorded</>
        )}
      </p>
      <p className="mt-1 max-w-[var(--measure-prose)] text-sm text-foreground-light">
        {status.detail} It was reading {inputSummary}.
      </p>
      {status.status === 'timeout' ? (
        <p className="mt-1 max-w-[var(--measure-prose)] text-sm text-foreground-light">
          Synthesis over a whole space does not fit in the budget an Edge Function has. A space this
          size is expected to hit that ceiling.
        </p>
      ) : null}
    </div>
  );
}
