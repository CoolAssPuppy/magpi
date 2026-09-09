import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { DreamRunSummary } from '@/lib/dreams/view-model';

import { DreamRunList } from './dream-run-list';

const getSummary = (overrides?: Partial<DreamRunSummary>): DreamRunSummary => ({
  id: '11111111-2222-4333-8444-555555555555',
  kind: 'digest',
  spaceId: 'space-1',
  spaceName: 'Engineering',
  kindLabel: 'Digest',
  kindSummary: 'Writes one document back into the space.',
  inputSummary: '42 documents',
  outputDocumentId: 'doc-1',
  duration: '1m 30s',
  createdAt: '2026-09-09T02:00:00.000Z',
  status: {
    status: 'succeeded',
    label: 'Succeeded',
    tone: 'positive',
    detail: 'The run finished and wrote its output.',
    stage: null,
  },
  ...overrides,
});

describe('the list of dream runs', () => {
  it('says what ran, over how many documents, and how it ended', () => {
    render(<DreamRunList runs={[getSummary()]} />);

    expect(screen.getByText('Digest')).toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText(/42 documents/)).toBeInTheDocument();
    expect(screen.getByText('Succeeded')).toBeInTheDocument();
  });

  it('opens the run', () => {
    render(<DreamRunList runs={[getSummary()]} />);

    expect(screen.getByRole('link', { name: /open this run/i })).toHaveAttribute(
      'href',
      '/dreams/11111111-2222-4333-8444-555555555555',
    );
  });

  it('names the stage a timed-out run died in, rather than showing it as still working', () => {
    render(
      <DreamRunList
        runs={[
          getSummary({
            status: {
              status: 'timeout',
              label: 'Timed out',
              tone: 'warning',
              detail: 'Timed out during synthesize. 900 documents exceeded the CPU budget.',
              stage: 'synthesize',
            },
          }),
        ]}
      />,
    );

    expect(screen.getByText(/timed out during synthesize/i)).toBeInTheDocument();
  });

  it('says a run wrote nothing rather than leaving the column blank', () => {
    render(<DreamRunList runs={[getSummary({ outputDocumentId: null })]} />);

    expect(screen.getByText(/no output document/i)).toBeInTheDocument();
  });
});
