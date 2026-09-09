import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { DreamStatusView } from '@/lib/dreams/status';

import { RunFailure } from './run-failure';

const getStatus = (overrides?: Partial<DreamStatusView>): DreamStatusView => ({
  status: 'timeout',
  label: 'Timed out',
  tone: 'warning',
  detail: 'Timed out during synthesize. 900 documents exceeded the CPU budget.',
  stage: 'synthesize',
  ...overrides,
});

describe('a run that did not finish', () => {
  it('names the stage it died in, which is the whole diagnostic value', () => {
    render(<RunFailure status={getStatus()} inputDocumentCount={900} />);

    expect(screen.getByText('synthesize')).toBeInTheDocument();
  });

  it('says how much it was reading when it died, so the ceiling is a number', () => {
    render(<RunFailure status={getStatus()} inputDocumentCount={900} />);

    expect(screen.getByText(/900 documents/)).toBeInTheDocument();
  });

  it('tells a reader whose run overran its budget that retrying will not help', () => {
    render(
      <RunFailure
        status={getStatus({
          detail:
            'Timed out during synthesize. Ran out of time after 148s, past the 45s budget for one run.',
        })}
        inputDocumentCount={900}
      />,
    );

    expect(screen.getByText(/retrying will not help at this size/i)).toBeInTheDocument();
    expect(screen.queryByText(/try it again/i)).not.toBeInTheDocument();
  });

  it('carries the measured numbers rather than asserting a ceiling in fixed copy', () => {
    render(
      <RunFailure
        status={getStatus({
          detail:
            'Timed out during synthesize. Ran out of time after 148s, past the 45s budget for one run.',
        })}
        inputDocumentCount={900}
      />,
    );

    expect(screen.getByText(/148s, past the 45s budget/)).toBeInTheDocument();
  });

  it('names the stage on a failure too, not only on a timeout', () => {
    render(
      <RunFailure
        status={getStatus({
          status: 'failed',
          label: 'Failed',
          tone: 'destructive',
          detail: 'Failed during extract. The model refused the batch.',
          stage: 'extract',
        })}
        inputDocumentCount={12}
      />,
    );

    expect(screen.getByText('extract')).toBeInTheDocument();
    expect(screen.getByText(/the model refused the batch/i)).toBeInTheDocument();
  });

  it('admits the stage was not recorded rather than leaving the label empty', () => {
    render(
      <RunFailure
        status={getStatus({
          detail: 'Timed out. The stage it died in was not recorded.',
          stage: null,
        })}
        inputDocumentCount={900}
      />,
    );

    expect(screen.getByText(/Timed out, and the stage was not recorded/i)).toBeInTheDocument();
  });

  it('reads a run the platform interrupted without inventing a stage for it', () => {
    render(
      <RunFailure
        status={getStatus({
          detail: 'Timed out. The run was interrupted and did not finish.',
          stage: null,
        })}
        inputDocumentCount={900}
      />,
    );

    expect(screen.getByText(/Timed out, and the stage was not recorded/i)).toBeInTheDocument();
    expect(screen.getByText(/the run was interrupted and did not finish/i)).toBeInTheDocument();
  });

  it('tells a reader whose run was interrupted to try again, since that is what fixes it', () => {
    render(
      <RunFailure
        status={getStatus({
          detail: 'Timed out. The run was interrupted and did not finish.',
          stage: null,
        })}
        inputDocumentCount={900}
      />,
    );

    expect(screen.getByText(/try it again/i)).toBeInTheDocument();
    expect(screen.getByText(/may be too large for one run/i)).toBeInTheDocument();
  });

  it('never tells an interrupted run that its space is too big, which would send a reader deleting documents', () => {
    render(
      <RunFailure
        status={getStatus({
          detail: 'Timed out. The run was interrupted and did not finish.',
          stage: null,
        })}
        inputDocumentCount={900}
      />,
    );

    expect(screen.queryByText(/expected to hit/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/retrying will not help/i)).not.toBeInTheDocument();
  });

  it('says it had read nothing when a run was stopped before its first read', () => {
    render(
      <RunFailure
        status={getStatus({
          detail: 'Timed out. The run was interrupted and did not finish.',
          stage: null,
        })}
        inputDocumentCount={0}
      />,
    );

    expect(screen.getByText(/had not read anything when it stopped/i)).toBeInTheDocument();
    expect(screen.queryByText(/reading No documents/i)).not.toBeInTheDocument();
  });

  it('reads a single document in the singular', () => {
    render(<RunFailure status={getStatus()} inputDocumentCount={1} />);

    expect(screen.getByText(/was reading 1 document\./)).toBeInTheDocument();
  });

  it('says nothing at all about a run that finished', () => {
    const { container } = render(
      <RunFailure
        status={getStatus({
          status: 'succeeded',
          label: 'Succeeded',
          tone: 'positive',
          detail: 'The run finished and wrote its output.',
          stage: null,
        })}
        inputDocumentCount={42}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
