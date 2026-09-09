import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { DocumentSummary } from '@/lib/documents/documents';

import { DocumentList } from './document-list';

const summary = (overrides: Partial<DocumentSummary> = {}): DocumentSummary => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  title: 'Q3 platform notes',
  spaceId: '33333333-3333-4333-8333-333333333333',
  spaceName: 'Engineering',
  origin: 'upload',
  updatedAt: '2026-09-09T11:30:00.000Z',
  ingest: null,
  ...overrides,
});

describe('the list of documents in a space', () => {
  it('opens each document from its own title', () => {
    render(<DocumentList documents={[summary({ title: 'Q3 platform notes' })]} />);

    expect(screen.getByRole('link', { name: 'Q3 platform notes' })).toHaveAttribute(
      'href',
      '/documents/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
  });

  it('says where a document came from and which space it landed in', () => {
    render(<DocumentList documents={[summary({ origin: 'sync', spaceName: 'Engineering' })]} />);

    expect(screen.getByText('Synced into Engineering')).toBeInTheDocument();
  });

  it('separates a digest the brain wrote from anything a person uploaded', () => {
    render(
      <DocumentList
        documents={[
          summary({ id: 'a', title: 'Uploaded plan', origin: 'upload' }),
          summary({ id: 'b', title: 'Nightly digest', origin: 'dream' }),
        ]}
      />,
    );

    expect(screen.getByText('Uploaded into Engineering')).toBeInTheDocument();
    expect(screen.getByText('Written by a dream run into Engineering')).toBeInTheDocument();
  });

  it('dates a document by the day it changed, not by a timestamp nobody reads', () => {
    render(<DocumentList documents={[summary({ updatedAt: '2026-09-09T11:30:00.000Z' })]} />);

    const stamp = screen.getByText('2026-09-09');
    expect(stamp).toHaveAttribute('datetime', '2026-09-09T11:30:00.000Z');
  });

  it('says nothing about the import of a document that is already in', () => {
    render(
      <DocumentList
        documents={[summary({ ingest: { status: 'succeeded', stage: 'embed', error: null } })]}
      />,
    );

    expect(screen.queryByText(/stage/i)).not.toBeInTheDocument();
  });

  it('shows a document still being read as work in progress, not as a problem', () => {
    const { container } = render(
      <DocumentList
        documents={[summary({ ingest: { status: 'running', stage: 'chunk', error: null } })]}
      />,
    );

    const note = screen.getByText('Reading, at the chunk stage');
    expect(note).toBeInTheDocument();
    expect(container.querySelector('.text-destructive-600')).toBeNull();
  });

  it('marks a failed import as a failure and gives the reason', () => {
    render(
      <DocumentList
        documents={[
          summary({
            ingest: { status: 'failed', stage: 'extract', error: 'The PDF has no text layer.' },
          }),
        ]}
      />,
    );

    expect(screen.getByText('The PDF has no text layer.')).toHaveClass('text-destructive-600');
  });

  it('marks a timed-out import as a failure rather than leaving it looking busy', () => {
    render(
      <DocumentList
        documents={[summary({ ingest: { status: 'timeout', stage: 'embed', error: null } })]}
      />,
    );

    expect(screen.getByText(/ran out of time at the embed stage/i)).toHaveClass(
      'text-destructive-600',
    );
  });
});
