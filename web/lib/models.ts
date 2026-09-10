/** Every model id in Magpi, pinned to exact ids rather than floating aliases. */
export const MODELS = {
  /** Pinned 2026-09-09. 1536 dimensions, which is why chunks.embedding is vector(1536). */
  embedding: 'text-embedding-3-small',
  /** Pinned 2026-09-09. The answer turn. */
  chat: 'gpt-4.1-2025-04-14',
  /** Pinned 2026-09-09. Rewrites a follow-up into a standalone question. Cheap and short. */
  condense: 'gpt-4.1-mini-2025-04-14',
  /** Pinned 2026-09-09. Titles a conversation from its first question. */
  title: 'gpt-4.1-mini-2025-04-14',
  /** Pinned 2026-09-09. Entity extraction, digests and link rationales. */
  dream: 'gpt-4.1-2025-04-14',
} as const;

export const EMBEDDING_DIMENSIONS = 1536;

export type ModelPurpose = keyof typeof MODELS;
export type ModelId = (typeof MODELS)[ModelPurpose];
