import { describe, expect, it } from 'vitest';

import { usageKindFor } from './usage-kind';

describe('usageKindFor', () => {
  it('meters embeddings and chat separately', () => {
    expect(usageKindFor('embedding')).toBe('embedding_tokens');
    expect(usageKindFor('chat')).toBe('chat_tokens');
    expect(usageKindFor('condense')).toBe('chat_tokens');
    expect(usageKindFor('title')).toBe('chat_tokens');
    expect(usageKindFor('dream')).toBe('chat_tokens');
  });
});
