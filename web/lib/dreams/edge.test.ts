import { describe, expect, it, vi } from 'vitest';

import { requestDreamRun } from './edge';

const getClient = (response: { data?: unknown; error?: { message: string } | null }) => ({
  functions: {
    invoke: vi
      .fn()
      .mockResolvedValue({ data: response.data ?? null, error: response.error ?? null }),
  },
});

const RUN_ID = '11111111-2222-4333-8444-555555555555';
const DOC_ID = '22222222-3333-4444-8555-666666666666';

describe('starting a dream run by hand', () => {
  it('asks dream-run for one kind of run in one space', async () => {
    const client = getClient({
      data: { dream_run_id: RUN_ID, status: 'succeeded', output_document_id: DOC_ID },
    });

    const result = await requestDreamRun(client, { spaceId: 'space-1', kind: 'digest' });

    expect(client.functions.invoke).toHaveBeenCalledWith('dream-run', {
      body: { space_id: 'space-1', kind: 'digest' },
    });
    expect(result).toEqual({
      ok: true,
      data: { dreamRunId: RUN_ID, status: 'succeeded', outputDocumentId: DOC_ID },
    });
  });

  it('reads a run back as timed out rather than as a failed request, because the run happened', async () => {
    const client = getClient({
      data: { dream_run_id: RUN_ID, status: 'timeout', output_document_id: null },
    });

    const result = await requestDreamRun(client, { spaceId: 'space-1', kind: 'connections' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe('timeout');
      expect(result.data.outputDocumentId).toBeNull();
    }
  });

  it('reads a succeeded run that wrote nothing, which is what an uncited digest now does', async () => {
    const client = getClient({
      data: { dream_run_id: RUN_ID, status: 'succeeded', output_document_id: null },
    });

    const result = await requestDreamRun(client, { spaceId: 'space-1', kind: 'digest' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.outputDocumentId).toBeNull();
  });

  it('reports a worker that refused the run', async () => {
    const client = getClient({ error: { message: 'dreaming_disabled' } });

    const result = await requestDreamRun(client, { spaceId: 'space-1', kind: 'entities' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('dreaming_disabled');
  });

  it('refuses a status the run cannot actually have finished in', async () => {
    const client = getClient({
      data: { dream_run_id: RUN_ID, status: 'running', output_document_id: null },
    });

    const result = await requestDreamRun(client, { spaceId: 'space-1', kind: 'digest' });

    expect(result.ok).toBe(false);
  });
});
