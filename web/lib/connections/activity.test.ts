import { describe, expect, it } from 'vitest';

import {
  applyJobEvent,
  describeActivity,
  parseIngestJobEvent,
  summarizeJobs,
  type IngestJobRecord,
} from './activity';

const getJob = (overrides?: Partial<IngestJobRecord>): IngestJobRecord => ({
  id: 'job-1',
  space_id: 'space-1',
  document_id: 'doc-1',
  stage: 'embed',
  status: 'running',
  error: null,
  ...overrides,
});

describe('import activity', () => {
  it('has nothing to say when nothing is running', () => {
    expect(describeActivity(summarizeJobs([]))).toBeNull();
  });

  it('counts what is running and what is waiting', () => {
    const summary = summarizeJobs([
      getJob(),
      getJob({ id: 'job-2' }),
      getJob({ id: 'job-3', status: 'queued', stage: 'fetch' }),
    ]);

    expect(describeActivity(summary)).toBe('Importing 2 documents, 1 waiting');
  });

  it('reads a single running import in the singular', () => {
    expect(describeActivity(summarizeJobs([getJob()]))).toBe('Importing 1 document');
  });

  it('reports a failure with the stage it died in, rather than leaving a spinner running', () => {
    const summary = summarizeJobs([
      getJob({ id: 'job-4', status: 'failed', stage: 'extract', error: 'The PDF has no text.' }),
    ]);

    expect(summary.failures).toEqual([
      {
        id: 'job-4',
        documentId: 'doc-1',
        stage: 'extract',
        reason: 'Failed during extract. The PDF has no text.',
      },
    ]);
    expect(describeActivity(summary)).toBe('1 import failed');
  });

  it('finishes a clause the driver wrote, so a timeout reads as a sentence', () => {
    const summary = summarizeJobs([
      getJob({
        id: 'job-7',
        status: 'timeout',
        stage: 'embed',
        error: 'ran out of time after 148s, past the 45s budget for one run',
      }),
    ]);

    expect(summary.failures[0].reason).toBe(
      'Timed out during embed. Ran out of time after 148s, past the 45s budget for one run.',
    );
  });

  it('leaves a message that already reads as a sentence alone', () => {
    const summary = summarizeJobs([
      getJob({
        id: 'job-8',
        status: 'failed',
        stage: 'fetch',
        error: 'Notion refused this connection, reconnect it.',
      }),
    ]);

    expect(summary.failures[0].reason).toBe(
      'Failed during fetch. Notion refused this connection, reconnect it.',
    );
  });

  it('still names the stage if a terminal job somehow arrives with no error', () => {
    const summary = summarizeJobs([
      getJob({ id: 'job-5', status: 'timeout', stage: 'embed', error: null }),
    ]);

    expect(summary.failures[0].stage).toBe('embed');
    expect(summary.failures[0].reason).toBe('Timed out during embed.');
  });

  it('reports both at once', () => {
    const summary = summarizeJobs([getJob(), getJob({ id: 'job-6', status: 'failed' })]);

    expect(describeActivity(summary)).toBe('Importing 1 document, 1 import failed');
  });

  it('says nothing about work that already finished', () => {
    expect(describeActivity(summarizeJobs([getJob({ status: 'succeeded' })]))).toBeNull();
  });
});

describe('following an import live', () => {
  it('adds a job the first time it is seen', () => {
    const next = applyJobEvent(new Map(), getJob());

    expect(next.get('job-1')?.status).toBe('running');
  });

  it('replaces a job with its later state rather than counting it twice', () => {
    const first = applyJobEvent(new Map(), getJob({ status: 'queued' }));
    const second = applyJobEvent(first, getJob({ status: 'running' }));

    expect(second.size).toBe(1);
    expect(second.get('job-1')?.status).toBe('running');
  });

  it('ignores a job from a space this page is not watching', () => {
    const next = applyJobEvent(new Map(), getJob({ space_id: 'space-other' }), ['space-1']);

    expect(next.size).toBe(0);
  });

  it('reads a replication payload into a job', () => {
    expect(parseIngestJobEvent(getJob())).toEqual(getJob());
  });

  it('drops a payload that is not a job, rather than counting a shape it cannot read', () => {
    expect(parseIngestJobEvent({ id: 'job-1' })).toBeNull();
    expect(parseIngestJobEvent(null)).toBeNull();
  });
});
