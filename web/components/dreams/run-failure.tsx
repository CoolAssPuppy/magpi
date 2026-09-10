import type { DreamStatusView } from '@/lib/dreams/status';

/** Copy for a run that did not finish. A measured timeout and a stopped run read differently. */
export function RunFailure({
  status,
  inputDocumentCount,
}: {
  status: DreamStatusView;
  inputDocumentCount: number;
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

      {/* The detail carries the measured numbers, so nothing below asserts them. */}
      <p className="mt-1 max-w-[var(--measure-prose)] text-sm text-muted-foreground">
        {status.detail}{' '}
        {inputDocumentCount === 0
          ? 'It had not read anything when it stopped.'
          : `It was reading ${inputDocumentCount} document${inputDocumentCount === 1 ? '' : 's'}.`}
      </p>

      {status.status === 'timeout' ? (
        <p className="mt-1 max-w-[var(--measure-prose)] text-sm text-muted-foreground">
          {status.stage
            ? 'Retrying will not help at this size. A dream runs inside one Edge Function, so a space this large cannot finish in a single run.'
            : 'The run stopped before it finished. Try it again, and if it keeps stopping the space may be too large for one run.'}
        </p>
      ) : null}
    </div>
  );
}
