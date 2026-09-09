import { describe, expect, it } from 'vitest';

import { EMBEDDING_DIMENSIONS, MODELS } from './models';

describe('pinned models', () => {
  it('pins every model to an exact id, never a floating alias', () => {
    for (const [purpose, id] of Object.entries(MODELS)) {
      expect(id, `${purpose} must not use a floating alias`).not.toMatch(/latest/);
      expect(id, `${purpose} must be a non-empty id`).toMatch(/^[a-z0-9.-]+$/);
    }
  });

  it('keeps the embedding model at the dimension count the chunks column declares', () => {
    expect(MODELS.embedding).toBe('text-embedding-3-small');
    expect(EMBEDDING_DIMENSIONS).toBe(1536);
  });
});
