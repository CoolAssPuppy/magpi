// Every read and every write a dream run makes, scoped to one space.
//
// A dream run reads only its own space and writes only into its own space. That
// is the security model, not a simplification: a synthesis job reading across
// spaces under the service role and surfacing the result is a permission bypass
// wearing a friendly name, and nobody would notice until it mattered.
//
// The scope is not a parameter the caller passes per query, because a caller can
// forget one. It is fixed when the writer is built: every read carries the space
// filter, and every write has its org_id and space_id overwritten from the scope
// after the caller's fields are spread, so a row naming another space cannot be
// written even deliberately.

import type { SupabaseClient } from '@supabase/supabase-js';

import { ApiError } from '../errors.ts';

export interface SpaceScope {
  orgId: string;
  spaceId: string;
}

export interface SpaceChunkRow {
  id: string;
  document_id: string;
  ordinal: number;
  content: string;
  created_at: string;
}

/** What the similarity pass reads of a document: its opening chunk. */
export interface SpaceOpeningChunk {
  id: string;
  content: string;
}

export interface SpaceDocumentRow {
  id: string;
  title: string;
  origin: 'upload' | 'sync' | 'dream';
  connection_id: string | null;
  url: string | null;
  updated_at: string;
}

export interface EntityDraft {
  kind: 'person' | 'project' | 'customer' | 'decision';
  name: string;
  canonicalName: string;
  summary: string | null;
}

export interface MentionDraft {
  entityId: string;
  documentId: string;
  chunkId: string;
}

export interface LinkDraft {
  dreamRunId: string;
  documentA: string;
  documentB: string;
  similarity: number;
  rationale: string;
}

export interface DreamDocumentDraft {
  dreamRunId: string;
  title: string;
  text: string;
  /** The chunks this synthesis was built from. Never empty. */
  sourceChunkIds: string[];
}

export interface SpaceScopedDb {
  readonly scope: SpaceScope;
  recentChunks(sinceIso: string, limit: number): Promise<SpaceChunkRow[]>;
  documentsByIds(ids: string[]): Promise<SpaceDocumentRow[]>;
  recentDocuments(sinceIso: string, limit: number): Promise<SpaceDocumentRow[]>;
  /** The opening chunk of each document, keyed by document, for the similarity pass. */
  firstChunksOf(documentIds: string[]): Promise<Map<string, SpaceOpeningChunk>>;
  insertDreamDocument(draft: DreamDocumentDraft): Promise<string>;
  insertChunks(
    documentId: string,
    chunks: { ordinal: number; content: string; tokenCount: number; embedding: number[] }[],
  ): Promise<void>;
  /** Files a batch of entities and answers with an id per draft, in draft order. */
  upsertEntities(drafts: EntityDraft[]): Promise<string[]>;
  insertMentions(drafts: MentionDraft[]): Promise<void>;
  insertLinks(drafts: LinkDraft[]): Promise<void>;
}

/** The conflict key entities are filed under, within one space. */
function entityKey(kind: string, canonicalName: string): string {
  return `${kind}:${canonicalName}`;
}

function failed(what: string, detail: string): ApiError {
  console.error(`${what} failed`, detail);
  return new ApiError(500, 'internal', `${what} failed`);
}

export function spaceScoped(db: SupabaseClient, scope: SpaceScope): SpaceScopedDb {
  /** The two columns no caller is allowed to choose. */
  const stamped = (row: Record<string, unknown>): Record<string, unknown> => ({
    ...row,
    org_id: scope.orgId,
    space_id: scope.spaceId,
  });

  return {
    scope,

    async recentChunks(sinceIso, limit) {
      const { data, error } = await db
        .from('chunks')
        .select('id, document_id, ordinal, content, created_at')
        .eq('space_id', scope.spaceId)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: true })
        .limit(limit)
        .returns<SpaceChunkRow[]>();
      if (error) throw failed('reading recent chunks', error.message);
      return data ?? [];
    },

    async documentsByIds(ids) {
      if (ids.length === 0) return [];
      const { data, error } = await db
        .from('documents')
        .select('id, title, origin, connection_id, url, updated_at')
        .eq('space_id', scope.spaceId)
        .in('id', ids)
        .returns<SpaceDocumentRow[]>();
      if (error) throw failed('reading documents', error.message);
      return data ?? [];
    },

    async recentDocuments(sinceIso, limit) {
      const { data, error } = await db
        .from('documents')
        .select('id, title, origin, connection_id, url, updated_at')
        .eq('space_id', scope.spaceId)
        .gte('updated_at', sinceIso)
        // A dream output is not an input to the next dream, or the space fills
        // with syntheses of syntheses.
        .neq('origin', 'dream')
        .order('updated_at', { ascending: false })
        .limit(limit)
        .returns<SpaceDocumentRow[]>();
      if (error) throw failed('reading documents', error.message);
      return data ?? [];
    },

    async firstChunksOf(documentIds) {
      if (documentIds.length === 0) return new Map();
      const { data, error } = await db
        .from('chunks')
        .select('id, document_id, content')
        .eq('space_id', scope.spaceId)
        .in('document_id', documentIds)
        // A document's chunks are written in one statement starting at zero and
        // replaced the same way, so the opening chunk is the row at ordinal
        // zero. Reading it by ordinal is what makes this one round trip for a
        // whole pass rather than one per document.
        .eq('ordinal', 0)
        .returns<{ id: string; document_id: string; content: string }[]>();
      if (error) throw failed('reading chunks', error.message);

      return new Map(
        (data ?? []).map((row) => [row.document_id, { id: row.id, content: row.content }]),
      );
    },

    async insertDreamDocument(draft) {
      const { data, error } = await db
        .from('documents')
        .insert(
          stamped({
            title: draft.title,
            origin: 'dream',
            dream_run_id: draft.dreamRunId,
            mime_type: 'text/markdown',
            version: 1,
            source_chunk_ids: draft.sourceChunkIds,
          }),
        )
        .select('id')
        .single<{ id: string }>();
      if (error || !data) throw failed('writing the dream document', error?.message ?? 'no row');
      return data.id;
    },

    async insertChunks(documentId, chunks) {
      if (chunks.length === 0) return;
      const { error } = await db.from('chunks').insert(
        chunks.map((chunk) =>
          stamped({
            document_id: documentId,
            ordinal: chunk.ordinal,
            content: chunk.content,
            token_count: chunk.tokenCount,
            embedding: chunk.embedding,
          })
        ),
      );
      if (error) throw failed('writing chunks', error.message);
    },

    async upsertEntities(drafts) {
      if (drafts.length === 0) return [];

      // Deduplicated on the conflict key, because a statement may not write the
      // same row twice, and a model asked for a hundred entities will name one
      // of them twice. The last draft wins, which is what a run of single
      // upserts left behind anyway.
      const byKey = new Map(
        drafts.map((draft) => [entityKey(draft.kind, draft.canonicalName), draft]),
      );

      const { data, error } = await db
        .from('entities')
        .upsert(
          [...byKey.values()].map((draft) =>
            stamped({
              kind: draft.kind,
              name: draft.name,
              canonical_name: draft.canonicalName,
              summary: draft.summary,
            })
          ),
          { onConflict: 'space_id,kind,canonical_name' },
        )
        .select('id, kind, canonical_name')
        .returns<{ id: string; kind: string; canonical_name: string }[]>();
      if (error || !data) throw failed('writing entities', error?.message ?? 'no rows');

      // Matched on the conflict key rather than on position: the order rows come
      // back in is the database's business, and a mention filed against the
      // wrong id is a claim about the wrong person.
      const ids = new Map(data.map((row) => [entityKey(row.kind, row.canonical_name), row.id]));
      return drafts.map((draft) => {
        const id = ids.get(entityKey(draft.kind, draft.canonicalName));
        if (!id) throw failed('writing entities', `no row came back for ${draft.canonicalName}`);
        return id;
      });
    },

    async insertMentions(drafts) {
      if (drafts.length === 0) return;
      // entity_mentions carries space_id but no org_id, so the shared stamp
      // would add a column the table does not have.
      const { error } = await db.from('entity_mentions').upsert(
        drafts.map((draft) => ({
          entity_id: draft.entityId,
          document_id: draft.documentId,
          chunk_id: draft.chunkId,
          space_id: scope.spaceId,
        })),
        { onConflict: 'entity_id,chunk_id', ignoreDuplicates: true },
      );
      if (error) throw failed('writing entity mentions', error.message);
    },

    async insertLinks(drafts) {
      if (drafts.length === 0) return;
      const { error } = await db.from('dream_links').upsert(
        drafts.map((draft) => ({
          dream_run_id: draft.dreamRunId,
          space_id: scope.spaceId,
          // The table checks document_a < document_b so a pair is stored once
          // whichever order it was found in.
          document_a: draft.documentA < draft.documentB ? draft.documentA : draft.documentB,
          document_b: draft.documentA < draft.documentB ? draft.documentB : draft.documentA,
          similarity: draft.similarity,
          rationale: draft.rationale,
        })),
        { onConflict: 'space_id,document_a,document_b', ignoreDuplicates: true },
      );
      if (error) throw failed('writing dream links', error.message);
    },
  };
}
