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
}

export interface SpaceScopedDb {
  readonly scope: SpaceScope;
  recentChunks(sinceIso: string, limit: number): Promise<SpaceChunkRow[]>;
  documentsByIds(ids: string[]): Promise<SpaceDocumentRow[]>;
  recentDocuments(sinceIso: string, limit: number): Promise<SpaceDocumentRow[]>;
  /** Chunk ids and their embeddings, for the similarity pass. */
  firstChunkOf(documentId: string): Promise<{ id: string; content: string } | null>;
  insertDreamDocument(draft: DreamDocumentDraft): Promise<string>;
  insertChunks(
    documentId: string,
    chunks: { ordinal: number; content: string; tokenCount: number; embedding: number[] }[],
  ): Promise<void>;
  upsertEntity(draft: EntityDraft): Promise<string>;
  insertMentions(drafts: MentionDraft[]): Promise<void>;
  insertLinks(drafts: LinkDraft[]): Promise<void>;
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

    async firstChunkOf(documentId) {
      const { data, error } = await db
        .from('chunks')
        .select('id, content')
        .eq('space_id', scope.spaceId)
        .eq('document_id', documentId)
        .order('ordinal', { ascending: true })
        .limit(1)
        .maybeSingle<{ id: string; content: string }>();
      if (error) throw failed('reading a chunk', error.message);
      return data;
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

    async upsertEntity(draft) {
      const { data, error } = await db
        .from('entities')
        .upsert(
          stamped({
            kind: draft.kind,
            name: draft.name,
            canonical_name: draft.canonicalName,
            summary: draft.summary,
          }),
          { onConflict: 'space_id,kind,canonical_name' },
        )
        .select('id')
        .single<{ id: string }>();
      if (error || !data) throw failed('writing an entity', error?.message ?? 'no row');
      return data.id;
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
