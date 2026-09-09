// The entities pass: read the day's chunks, extract who and what they are about,
// and record where each mention came from.

import { z } from 'zod';

import {
  ask,
  chunkPrompt,
  documentCount,
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

const ENTITY_SYSTEM =
  'You extract entities from workplace notes: people, projects, customers and decisions. ' +
  'Answer with STRICT JSON and nothing else: an array of objects with the keys kind (one of ' +
  'person, project, customer, decision), name, canonicalName (the name lowercased with no ' +
  'punctuation), summary (one sentence or null) and chunkIds (the ids in square brackets above ' +
  'the text it came from). Use only ids that appear in the input.';

export async function dreamEntities(pass: Pass): Promise<DreamOutcome> {
  const { deps, db } = pass;
  enter(pass, 'collect');
  const chunks = await db.recentChunks(sinceIso(deps), MAX_INPUT_CHUNKS);
  if (chunks.length === 0) return NOTHING;

  enter(pass, 'synthesize');
  const answer = await ask(pass, ENTITY_SYSTEM, chunkPrompt(chunks), 2000);

  enter(pass, 'extract');
  const drafts = readAnswer(entitiesSchema, answer, 'entities');

  // A chunk id the model was not given is one it invented, and an invented id
  // either fails the foreign key or names a row in somebody else's space.
  const known = new Map(chunks.map((chunk) => [chunk.id, chunk.document_id]));

  for (const draft of drafts) {
    enter(pass, 'write');
    const entityId = await db.upsertEntity({
      kind: draft.kind,
      name: draft.name,
      canonicalName: draft.canonicalName,
      summary: draft.summary ?? null,
    });
    await db.insertMentions(draft.chunkIds.flatMap((chunkId) => {
      const documentId = known.get(chunkId);
      return documentId ? [{ entityId, documentId, chunkId }] : [];
    }));
  }

  return { ...NOTHING, inputDocumentCount: documentCount(chunks), produced: drafts.length };
}
