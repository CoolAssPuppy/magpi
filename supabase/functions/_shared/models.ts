// Every model id the edge functions use. Must match web/lib/models.ts; models_test.ts checks it.

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

/** Changing this means a migration on chunks.embedding and a full re-embed. */
export const EMBEDDING_DIMENSIONS = 1536;

export type ModelPurpose = keyof typeof MODELS;
export type ModelId = (typeof MODELS)[ModelPurpose];

/** The purposes that take a prompt and return prose, as opposed to a vector. */
export type CompletionPurpose = Exclude<ModelPurpose, 'embedding'>;
