import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { DeadContent as DeadContentData, IngestHealthRow } from '@/lib/analytics/queries';

import { DeadContent } from './dead-content';
import { IngestHealth } from './ingest-health';
import { parseRange, RangeFilter } from './range-filter';
import { TopQuestions } from './top-questions';

const NOW = new Date('2026-09-09T14:20:00.000Z');

function healthRow(overrides?: Partial<IngestHealthRow>): IngestHealthRow {
  return {
    connectionId: 'c1',
    provider: 'notion',
    status: 'active',
    statusDetail: null,
    lastSyncedAt: '2026-09-09T12:20:00.000Z',
    documentsPulled: 128,
    recentFailures: 0,
    latestFailure: null,
    ...overrides,
  };
}

function deadContent(overrides?: Partial<DeadContentData>): DeadContentData {
  return { totalDocuments: 100, neverRetrieved: 48, samples: [], ...overrides };
}

describe('ingest health', () => {
  it('shows the stage a timed out job died in, not just that it failed', () => {
    render(
      <IngestHealth
        now={NOW}
        rows={[
          healthRow({
            status: 'error',
            recentFailures: 3,
            latestFailure: { status: 'timeout', stage: 'embed', error: 'wall clock exceeded' },
          }),
        ]}
      />,
    );

    expect(screen.getByText('Timed out at embed: wall clock exceeded')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('says how long ago the last sync ran', () => {
    render(<IngestHealth now={NOW} rows={[healthRow()]} />);

    expect(screen.getByText('2 hours ago')).toBeInTheDocument();
  });

  it('tells an admin with no connections what the panel is for', () => {
    render(<IngestHealth now={NOW} rows={[]} />);

    expect(screen.getByText('No sources connected')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('top questions', () => {
  it('ranks questions and says when each was last asked', () => {
    render(
      <TopQuestions
        now={NOW}
        questions={[
          {
            question: 'Where is the deploy runbook?',
            askedCount: 9,
            lastAskedAt: '2026-09-09T12:20:00.000Z',
          },
        ]}
      />,
    );

    expect(screen.getByText('Where is the deploy runbook?')).toBeInTheDocument();
    expect(screen.getByText('Last asked 2 hours ago')).toBeInTheDocument();
  });

  it('explains the panel before anyone has asked anything', () => {
    render(<TopQuestions now={NOW} questions={[]} />);

    expect(screen.getByText('Nobody has asked anything yet')).toBeInTheDocument();
  });
});

describe('dead content', () => {
  it('leads with the share of the knowledge base nothing has ever cited', () => {
    render(<DeadContent now={NOW} content={deadContent()} />);

    expect(screen.getByText('48%')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Never retrieved' })).toBeInTheDocument();
  });

  it('names the oldest of it so the number is something you can act on', () => {
    render(
      <DeadContent
        now={NOW}
        content={deadContent({
          samples: [
            {
              id: 'd1',
              title: 'Q1 offsite notes',
              spaceId: 's1',
              origin: 'sync',
              createdAt: '2026-09-07T14:20:00.000Z',
            },
          ],
        })}
      />,
    );

    expect(screen.getByText('Q1 offsite notes')).toBeInTheDocument();
    expect(screen.getByText('Added 2 days ago')).toBeInTheDocument();
  });

  it('says nothing has been ingested rather than dividing by zero', () => {
    render(<DeadContent now={NOW} content={deadContent({ totalDocuments: 0, neverRetrieved: 0 })} />);

    expect(screen.getByText('Nothing ingested yet')).toBeInTheDocument();
  });
});

describe('range filter', () => {
  it('marks the active range', () => {
    render(<RangeFilter basePath="/admin" active={7} />);

    const nav = screen.getByRole('navigation', { name: 'Time range' });
    expect(within(nav).getByRole('link', { name: '7 days' })).toHaveAttribute('aria-current', 'true');
    expect(within(nav).getByRole('link', { name: '30 days' })).not.toHaveAttribute('aria-current');
  });

  it('falls back to thirty days for anything it does not offer', () => {
    expect(parseRange('7')).toBe(7);
    expect(parseRange('90')).toBe(90);
    expect(parseRange('1000')).toBe(30);
    expect(parseRange(undefined)).toBe(30);
  });
});
