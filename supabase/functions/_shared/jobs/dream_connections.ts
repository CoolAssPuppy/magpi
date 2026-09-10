// Connections pass: pairs recent documents about the same thing and writes the explained ones.

import { z } from 'zod';

import { ApiError } from '../errors.ts';
import {
  ask,
  type DreamOutcome,
  enter,
  NOTHING,
  parsed,
  type Pass,
  readAnswer,
  sinceIso,
} from './dream_pass.ts';
import type { LinkDraft, SpaceDocumentRow } from './space_writer.ts';

// One embedding and one search per document, so twenty keeps a pass inside its time budget.
const MAX_COMPARED_DOCUMENTS = 20;

// A page of candidate links a person will actually read.
const MAX_LINKS = 20;

const SEARCH_MATCH_COUNT = 10;

const rationalesSchema = z.array(
  z.object({ pair: z.number().int().min(0), rationale: z.string().trim().min(1).max(400) }),
).max(MAX_LINKS);

const searchHitsSchema = z.array(z.object({ document_id: z.string(), score: z.number() }));

const RATIONALE_SYSTEM =
  'You say in one line why two documents look like they are about the same thing. Answer with ' +
  'STRICT JSON and nothing else: an array of objects with the keys pair (the number given) and ' +
  'rationale (one sentence).';

/** Two documents from one connection are one source talking to itself. */
function sourceOf(document: SpaceDocumentRow): string {
  return document.connection_id ?? 'upload';
}

async function searchNeighbours(pass: Pass, embedding: number[], text: string): Promise<
  { document_id: string; score: number }[]
> {
  // The service role bypasses RLS, so this filter is what keeps the pass inside its own space.
  const { data, error } = await pass.deps.db.rpc('search', {
    query_embedding: embedding,
    query_text: text,
    space_filter: [pass.run.space_id],
    match_count: SEARCH_MATCH_COUNT,
  }).returns<unknown>();
  if (error) {
    console.error('the connections search failed', error.message);
    throw new ApiError(500, 'internal', 'the space could not be searched');
  }
  return parsed(searchHitsSchema, data ?? [], 'search results');
}

/** The pairs worth asking about: distinct documents, one hop from each source. */
async function candidatePairs(pass: Pass, documents: SpaceDocumentRow[]): Promise<
  { sourceId: string; otherId: string; similarity: number }[]
> {
  const { run, deps, db } = pass;
  const found = new Map<string, { sourceId: string; otherId: string; similarity: number }>();

  // Opening chunks in one read and their vectors in one model call.
  enter(pass, 'extract');
  const openings = await db.firstChunksOf(documents.map((document) => document.id));
  const readable = documents.flatMap((document) => {
    const chunk = openings.get(document.id);
    return chunk ? [{ document, chunk }] : [];
  });
  if (readable.length === 0) return [];

  enter(pass, 'extract');
  const embeddings = await deps.models.embed({
    orgId: run.org_id,
    texts: readable.map(({ chunk }) => chunk.content),
  });

  // The whole scan is one stage, however many searches it takes.
  for (const [index, { document, chunk }] of readable.entries()) {
    if (found.size >= MAX_LINKS) break;
    const embedding = embeddings[index];
    if (!embedding) continue;

    enter(pass, 'extract');
    for (const hit of await searchNeighbours(pass, embedding, chunk.content)) {
      if (hit.document_id === document.id) continue;
      const key = [document.id, hit.document_id].sort().join(':');
      if (found.has(key)) continue;
      // The fused search score, which ranks pairs within this pass only.
      found.set(key, { sourceId: document.id, otherId: hit.document_id, similarity: hit.score });
    }
  }
  return [...found.values()].slice(0, MAX_LINKS);
}

export async function dreamConnections(pass: Pass): Promise<DreamOutcome> {
  const { run, deps, db } = pass;
  enter(pass, 'collect');
  const documents = await db.recentDocuments(sinceIso(deps), MAX_COMPARED_DOCUMENTS);
  pass.inputDocumentCount = documents.length;
  if (documents.length === 0) return NOTHING;

  const candidates = await candidatePairs(pass, documents);
  enter(pass, 'collect');
  const others = await db.documentsByIds([...new Set(candidates.map((c) => c.otherId))]);
  const known = new Map([...documents, ...others].map((doc) => [doc.id, doc]));
  const outcome = { ...NOTHING, inputDocumentCount: documents.length };

  // Drop pairs the read could not return and pairs whose halves share a connection.
  const pairs = candidates.flatMap((candidate) => {
    const source = known.get(candidate.sourceId);
    const other = known.get(candidate.otherId);
    if (!source || !other || sourceOf(source) === sourceOf(other)) return [];
    return [{ candidate, title: `${source.title} and ${other.title}` }];
  });
  if (pairs.length === 0) return outcome;

  enter(pass, 'synthesize');
  const prompt = pairs.map((pair, index) => `${index}: ${pair.title}`).join('\n');
  const answer = await ask(pass, RATIONALE_SYSTEM, `CANDIDATE PAIRS\n${prompt}`, 800);
  const rationales = new Map(
    readAnswer(rationalesSchema, answer, 'link rationales').map((row) => [row.pair, row.rationale]),
  );

  // Only links the model explained are written.
  const drafts: LinkDraft[] = pairs.flatMap(({ candidate }, index) => {
    const rationale = rationales.get(index);
    if (!rationale) return [];
    return [{
      dreamRunId: run.id,
      documentA: candidate.sourceId,
      documentB: candidate.otherId,
      similarity: candidate.similarity,
      rationale,
    }];
  });

  enter(pass, 'write');
  await db.insertLinks(drafts);
  return { ...outcome, produced: drafts.length };
}
