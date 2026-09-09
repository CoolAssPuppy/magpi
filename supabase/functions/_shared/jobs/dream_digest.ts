// The digest pass: summarise the day's chunks into one cited document, then
// chunk and embed it so the digest is searchable like any other document.

import { chunkText } from '../chunking.ts';
import { ApiError } from '../errors.ts';
import {
  ask,
  chunkPrompt,
  documentCount,
  type DreamOutcome,
  enter,
  MAX_INPUT_CHUNKS,
  NOTHING,
  type Pass,
  sinceIso,
} from './dream_pass.ts';
import type { SpaceChunkRow } from './space_writer.ts';

const DIGEST_SYSTEM =
  'You summarise what a team changed, decided and left unresolved. Answer in short markdown ' +
  'with three sections: What changed, What was decided, What is unresolved. Say only what the ' +
  'notes say. Answer in prose. Do not add a sources or citations section.';

const MARKER = /\[\[chunk:[^\]]*\]\]/g;

/**
 * What a digest read, for documents.source_chunk_ids.
 *
 * From what this pass put in the prompt, never from the answer, so a digest
 * cannot cite a chunk that was never read. The client resolves these through RLS
 * on read, the same rule chat citations follow, so a reader who lost access to a
 * space sees the digest without the citation.
 *
 * Read order, not sorted: the client numbers these, and the order chunks were
 * read in is the order they were written in, so source 1 is the oldest thing the
 * digest drew on. Sorting by id would number them at random. A Set keeps first
 * insertion, which is what makes the list stable for every reader even when RLS
 * hides different parts of it from each.
 */
function citedChunkIds(chunks: SpaceChunkRow[]): string[] {
  return [...new Set(chunks.map((chunk) => chunk.id))];
}

/**
 * A marker in the answer is one the model invented, and citations live in a
 * column now, so nothing shaped like one belongs in the prose.
 */
function prose(summary: string): string {
  return summary.replace(MARKER, '').trim();
}

export async function dreamDigest(pass: Pass): Promise<DreamOutcome> {
  const { run, deps, db } = pass;
  enter(pass, 'collect');
  const chunks = await db.recentChunks(sinceIso(deps), MAX_INPUT_CHUNKS);
  // A digest of nothing would be a document with no citations, which the client
  // reads as a run that produced nothing. Better to produce nothing.
  if (chunks.length === 0) return NOTHING;

  enter(pass, 'synthesize');
  const summary = await ask(pass, DIGEST_SYSTEM, chunkPrompt(chunks), 1500);

  enter(pass, 'write');
  const body = prose(summary);
  const day = deps.http.now().toISOString().slice(0, 10);
  const documentId = await db.insertDreamDocument({
    dreamRunId: run.id,
    title: `Digest for ${day}`,
    text: body,
    sourceChunkIds: citedChunkIds(chunks),
  });

  const pieces = chunkText(body);
  enter(pass, 'write');
  const vectors = await deps.models.embed({
    orgId: run.org_id,
    texts: pieces.map((piece) => piece.content),
  });
  if (vectors.length !== pieces.length) {
    throw new ApiError(502, 'model_error', 'the digest could not be embedded');
  }

  enter(pass, 'write');
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
