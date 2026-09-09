// The digest pass: summarise the day's chunks into one cited document, then
// chunk and embed it so the digest is searchable like any other document.

import { chunkText } from '../chunking.ts';
import { ApiError } from '../errors.ts';
import {
  ask,
  chunkPrompt,
  documentCount,
  type DreamOutcome,
  MAX_INPUT_CHUNKS,
  NOTHING,
  type Pass,
  sinceIso,
} from './dream_pass.ts';
import type { SpaceChunkRow, SpaceDocumentRow } from './space_writer.ts';

const DIGEST_SYSTEM =
  'You summarise what a team changed, decided and left unresolved. Answer in short markdown ' +
  'with three sections: What changed, What was decided, What is unresolved. Say only what the ' +
  'notes say.';

/**
 * Where a digest says what it read.
 *
 * documents has no citation column, so the provenance goes in the body. A
 * documents.source_chunk_ids uuid[] column is where this belongs, and adding one
 * is a schema change this job may not make. No dream document ships uncited.
 */
function sourcesSection(chunks: SpaceChunkRow[], documents: SpaceDocumentRow[]): string {
  const titles = new Map(documents.map((document) => [document.id, document.title]));
  const byDocument = new Map<string, string[]>();
  for (const chunk of chunks) {
    byDocument.set(chunk.document_id, [...byDocument.get(chunk.document_id) ?? [], chunk.id]);
  }
  const lines = [...byDocument].map(([id, chunkIds]) =>
    `- ${titles.get(id) ?? 'Untitled'}: ${[...chunkIds].sort().join(', ')}`
  );
  return ['## Sources', ...lines.sort()].join('\n');
}

export async function dreamDigest(pass: Pass): Promise<DreamOutcome> {
  const { run, deps, db, budget } = pass;
  budget.checkpoint('read');
  const chunks = await db.recentChunks(sinceIso(deps), MAX_INPUT_CHUNKS);
  if (chunks.length === 0) return NOTHING;

  budget.checkpoint('summarise');
  const summary = await ask(pass, DIGEST_SYSTEM, chunkPrompt(chunks), 1500);

  budget.checkpoint('read');
  const documents = await db.documentsByIds([...new Set(chunks.map((c) => c.document_id))]);
  const body = `${summary.trim()}\n\n${sourcesSection(chunks, documents)}`;

  budget.checkpoint('store');
  const day = deps.http.now().toISOString().slice(0, 10);
  const documentId = await db.insertDreamDocument({
    dreamRunId: run.id,
    title: `Digest for ${day}`,
    text: body,
  });

  const pieces = chunkText(body);
  budget.checkpoint('embed');
  const vectors = await deps.models.embed({
    orgId: run.org_id,
    texts: pieces.map((piece) => piece.content),
  });
  if (vectors.length !== pieces.length) {
    throw new ApiError(502, 'model_error', 'the digest could not be embedded');
  }

  budget.checkpoint('store');
  await db.insertChunks(
    documentId,
    pieces.map((piece, index) => ({ ...piece, embedding: vectors[index] })),
  );
  return {
    inputDocumentCount: documentCount(chunks),
    outputDocumentId: documentId,
    produced: pieces.length,
  };
}
