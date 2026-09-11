// The entities pass: extract people, projects, customers and decisions from the day's chunks.

import { z } from 'zod';

import {
  ask,
  chunkPrompt,
  counted,
  type DreamOutcome,
  enter,
  MAX_INPUT_CHUNKS,
  NOTHING,
  type Pass,
  readAnswer,
  sinceIso,
} from './dream_pass.ts';

const entitiesSchema = z.array(z.object({
  kind: z.enum(['person', 'project', 'customer', 'decision']),
  name: z.string().trim().min(1).max(200),
  canonicalName: z.string().trim().min(1).max(200),
  summary: z.string().max(2000).nullish(),
  chunkIds: z.array(z.string()).max(50).default([]),
})).max(100);

// JSON mode answers with an object, so the array arrives under a key rather than on its own.
const entityAnswerSchema = z.object({ entities: entitiesSchema });

const ENTITY_SYSTEM =
  'You extract entities from workplace notes: people, projects, customers and decisions. ' +
  'Answer with a JSON object and nothing else, of the form {"entities": [...]}, where each ' +
  'entry has the keys kind (one of person, project, customer, decision), name, canonicalName ' +
  '(the name lowercased with no punctuation), summary (one sentence or null) and chunkIds (the ' +
  'ids in square brackets above the text it came from). Use only ids that appear in the input. ' +
  'An empty array is a valid answer.';

export async function dreamEntities(pass: Pass): Promise<DreamOutcome> {
  const { deps, db } = pass;
  enter(pass, 'collect');
  const chunks = counted(pass, await db.recentChunks(sinceIso(deps), MAX_INPUT_CHUNKS));
  if (chunks.length === 0) return NOTHING;

  enter(pass, 'synthesize');
  const answer = await ask(pass, ENTITY_SYSTEM, chunkPrompt(chunks), 6000, true);

  enter(pass, 'extract');
  const drafts = readAnswer(entityAnswerSchema, answer, 'entities').entities;

  // Only chunk ids that were in the input are kept, so invented ids never reach a write.
  const known = new Map(chunks.map((chunk) => [chunk.id, chunk.document_id]));

  // Two batched statements for the whole answer rather than two per entity.
  enter(pass, 'write');
  const entityIds = await db.upsertEntities(drafts.map((draft) => ({
    kind: draft.kind,
    name: draft.name,
    canonicalName: draft.canonicalName,
    summary: draft.summary ?? null,
  })));

  await db.insertMentions(drafts.flatMap((draft, index) =>
    draft.chunkIds.flatMap((chunkId) => {
      const documentId = known.get(chunkId);
      return documentId ? [{ entityId: entityIds[index], documentId, chunkId }] : [];
    })
  ));

  return { ...NOTHING, inputDocumentCount: pass.inputDocumentCount, produced: drafts.length };
}
