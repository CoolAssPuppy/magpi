import { describe, expect, it, vi } from 'vitest';

import { requestDreamRun } from './edge';

const getClient = (response: { data?: unknown; error?: { message: string } | null }) => ({
  functions: {
    invoke: vi
      .fn()
      .mockResolvedValue({ data: response.data ?? null, error: response.error ?? null }),
  },
});

describe('starting a dream run by hand', () => {
  it('asks the worker for one kind of run in one space', async () => {
    const client = getClient({ data: { dream_run_id: '11111111-2222-4333-8444-555555555555' } });

    const result = await requestDreamRun(client, { spaceId: 'space-1', kind: 'digest' });

    expect(result).toEqual({
      ok: true,
      data: { dreamRunId: '11111111-2222-4333-8444-555555555555' },
    });
    expect(client.functions.invoke).toHaveBeenCalledWith('dream-worker', {
      body: { space_id: 'space-1', kind: 'digest' },
    });
  });

  it('reports a worker that refused the run', async () => {
    const client = getClient({ error: { message: 'dreaming is off for this space' } });

    const result = await requestDreamRun(client, { spaceId: 'space-1', kind: 'entities' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('dreaming is off for this space');
  });
});
