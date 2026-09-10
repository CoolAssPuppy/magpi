import { describe, expect, it } from 'vitest';

import {
  DREAM_DEFINITION,
  describeDreamKind,
  describeDreamStatus,
  formatRunDuration,
  parseDreamFailure,
  type DreamStatusInput,
} from './status';

const getRun = (overrides?: Partial<DreamStatusInput>): DreamStatusInput => ({
  status: 'succeeded',
  error: null,
  startedAt: '2026-09-09T02:00:00.000Z',
  finishedAt: '2026-09-09T02:01:30.000Z',
  ...overrides,
});

describe('the word dreaming', () => {
  it('is defined in one sentence, so the first screen a user meets explains it', () => {
    expect(DREAM_DEFINITION).toMatch(/dreaming is/i);
    expect(DREAM_DEFINITION.split('.').filter((part) => part.trim() !== '')).toHaveLength(1);
  });
});

describe('dream status', () => {
  it('reads a finished run as succeeded', () => {
    const view = describeDreamStatus(getRun());

    expect(view.label).toBe('Succeeded');
    expect(view.tone).toBe('positive');
    expect(view.stage).toBeNull();
  });

  it('reads a running run as in progress', () => {
    const view = describeDreamStatus(getRun({ status: 'running', finishedAt: null }));

    expect(view.tone).toBe('progress');
  });

  it('reads a queued run as waiting rather than as working', () => {
    const view = describeDreamStatus(
      getRun({ status: 'queued', startedAt: null, finishedAt: null }),
    );

    expect(view.label).toBe('Queued');
    expect(view.tone).toBe('neutral');
  });

  it('says which stage a timed-out run died in', () => {
    const view = describeDreamStatus(
      getRun({ status: 'timeout', error: 'synthesize: exceeded the wall clock at 148s' }),
    );

    expect(view.stage).toBe('synthesize');
    expect(view.detail).toBe('Timed out during synthesize. Exceeded the wall clock at 148s.');
  });

  it('reads a run the platform interrupted, which records no stage to report', () => {
    const view = describeDreamStatus(
      getRun({ status: 'timeout', error: 'the run was interrupted and did not finish' }),
    );

    expect(view.stage).toBeNull();
    expect(view.detail).toBe('Timed out. The run was interrupted and did not finish.');
  });

  it('leaves a message that already ends in a full stop alone', () => {
    const view = describeDreamStatus(
      getRun({ status: 'failed', error: 'write: the document could not be stored.' }),
    );

    expect(view.detail).toBe('Failed during write. The document could not be stored.');
  });

  it('admits the stage was not recorded rather than inventing one', () => {
    const view = describeDreamStatus(getRun({ status: 'timeout', error: null }));

    expect(view.stage).toBeNull();
    expect(view.detail).toBe('Timed out. The stage it died in was not recorded.');
  });

  it('reads a failed run as failed and keeps the reason', () => {
    const view = describeDreamStatus(
      getRun({ status: 'failed', error: 'extract: the model refused the batch' }),
    );

    expect(view.tone).toBe('destructive');
    expect(view.stage).toBe('extract');
    expect(view.detail).toBe('Failed during extract. The model refused the batch.');
  });
});

describe('parsing a failure', () => {
  it('splits a stage prefix from its message', () => {
    expect(parseDreamFailure('collect: nothing came back')).toEqual({
      stage: 'collect',
      message: 'nothing came back',
    });
  });

  it('keeps the whole text when the prefix is not a stage we know', () => {
    expect(parseDreamFailure('postgres: connection reset')).toEqual({
      stage: null,
      message: 'postgres: connection reset',
    });
  });

  it('answers with nothing for a run that did not fail', () => {
    expect(parseDreamFailure(null)).toEqual({ stage: null, message: null });
  });
});

describe('dream kinds', () => {
  it('gives every kind a label to pick it by', () => {
    for (const kind of ['entities', 'digest', 'connections'] as const) {
      expect(describeDreamKind(kind).label.length).toBeGreaterThan(0);
    }
  });

  it('names the connections kind for what it produces rather than for the table it writes', () => {
    expect(describeDreamKind('connections').label).toBe('Document links');
  });
});

describe('run duration', () => {
  it('measures a finished run', () => {
    expect(formatRunDuration('2026-09-09T02:00:00.000Z', '2026-09-09T02:01:30.000Z')).toBe(
      '1m 30s',
    );
  });

  it('measures a short run in seconds', () => {
    expect(formatRunDuration('2026-09-09T02:00:00.000Z', '2026-09-09T02:00:12.000Z')).toBe('12s');
  });

  it('says a run has not started rather than showing a zero', () => {
    expect(formatRunDuration(null, null)).toBe('Not started');
  });

  it('says a run is still going when it has a start and no finish', () => {
    expect(formatRunDuration('2026-09-09T02:00:00.000Z', null)).toBe('Still running');
  });
});
