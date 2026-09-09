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
    render(<RunFailure status={getStatus()} inputSummary="900 documents" />);

    expect(screen.getByText('synthesize')).toBeInTheDocument();
  });

  it('says how much it was reading when it died, so the ceiling is a number', () => {
    render(<RunFailure status={getStatus()} inputSummary="900 documents" />);

    expect(screen.getByText(/900 documents/)).toBeInTheDocument();
  });

  it('explains that a large space is expected to hit this, rather than implying a bug', () => {
    render(<RunFailure status={getStatus()} inputSummary="900 documents" />);

    expect(screen.getByText(/budget an edge function has/i)).toBeInTheDocument();
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
        inputSummary="12 documents"
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
        inputSummary="900 documents"
      />,
    );

    expect(screen.getByText(/Timed out, and the stage was not recorded/i)).toBeInTheDocument();
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
        inputSummary="42 documents"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
