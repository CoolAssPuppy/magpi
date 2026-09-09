import { describe, expect, it } from 'vitest';

import { describeIngest, describeOrigin, type IngestSummary } from './documents';

const ingest = (overrides: Partial<IngestSummary> = {}): IngestSummary => ({
  status: 'running',
  stage: 'embed',
  error: null,
  ...overrides,
});

describe('what an import says while it is happening', () => {
  it('names the stage it is on', () => {
    expect(describeIngest(ingest({ status: 'running', stage: 'chunk' }))).toBe(
      'Reading, at the chunk stage',
    );
  });

  it('says nothing once the document is in', () => {
    expect(describeIngest(ingest({ status: 'succeeded' }))).toBeNull();
  });

  it('shows the real error rather than a spinner that never resolves', () => {
    expect(describeIngest(ingest({ status: 'failed', error: 'The PDF has no text layer.' }))).toBe(
      'The PDF has no text layer.',
    );
  });

  it('falls back to the stage when a failure carried no message', () => {
    expect(describeIngest(ingest({ status: 'failed', stage: 'extract', error: null }))).toBe(
      'Failed at the extract stage',
    );
  });

  it('says a timed-out job ran out of time, and where', () => {
    expect(describeIngest(ingest({ status: 'timeout', stage: 'embed' }))).toBe(
      'Ran out of time at the embed stage. This document is too large for one job.',
    );
  });

  it('says nothing when there is no job at all', () => {
    expect(describeIngest(null)).toBeNull();
  });
});

describe('where a document came from', () => {
  it('distinguishes a dream output from anything a person put in', () => {
    expect(describeOrigin('upload')).toBe('Uploaded');
    expect(describeOrigin('sync')).toBe('Synced');
    expect(describeOrigin('dream')).toBe('Written by a dream run');
  });
});
