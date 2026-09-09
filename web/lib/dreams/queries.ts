import 'server-only';

import type { SessionContext } from '@/lib/supabase/context';

import { describeDreamOutput, splitCitedText, type CitedSegment } from './citations';
import { buildEntityGroups, type EntityGroup } from './entities';
import {
  buildLinkCandidates,
  buildRunSummaries,
  type DreamRunSummary,
  type LinkCandidate,
  type SpaceRecord,
} from './view-model';

const RUN_COLUMNS =
  'id, space_id, kind, status, started_at, finished_at, input_document_count, output_document_id, error, created_at';

async function fetchSpaces(context: SessionContext): Promise<readonly SpaceRecord[]> {
  const { data, error } = await context.supabase
    .from('spaces')
    .select('id, name, dreaming_enabled')
    .order('name');
  if (error) throw new Error(`Could not read spaces: ${error.message}`);
  return data;
}

export type DreamsPageData = {
  readonly runs: readonly DreamRunSummary[];
  readonly spaces: readonly SpaceRecord[];
};

export async function loadDreamsPage(context: SessionContext): Promise<DreamsPageData> {
  const [spaces, runs] = await Promise.all([
    fetchSpaces(context),
    context.supabase
      .from('dream_runs')
      .select(RUN_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  if (runs.error) throw new Error(`Could not read dream runs: ${runs.error.message}`);

  return { runs: buildRunSummaries({ runs: runs.data, spaces }), spaces };
}

export type DreamSource = {
  readonly index: number;
  readonly chunkId: string;
  readonly documentId: string;
  readonly documentTitle: string;
  readonly excerpt: string;
};

export type DreamOutputView =
  | { readonly kind: 'none' }
  | { readonly kind: 'uncited'; readonly documentId: string; readonly title: string }
  | {
      readonly kind: 'cited';
      readonly documentId: string;
      readonly title: string;
      readonly segments: readonly CitedSegment[];
      readonly sources: readonly DreamSource[];
    };

export type DreamRunDetail = {
  readonly run: DreamRunSummary;
  readonly output: DreamOutputView;
  readonly candidates: readonly LinkCandidate[];
};

const EXCERPT_LENGTH = 240;

function excerpt(content: string): string {
  const stripped = content.replace(/\s+/g, ' ').trim();
  return stripped.length <= EXCERPT_LENGTH ? stripped : `${stripped.slice(0, EXCERPT_LENGTH)}...`;
}

/**
 * Citations are resolved on read, through the caller's own RLS. A reader who
 * lost access to a source space sees the digest with that reference dropped,
 * which is correct rather than a bug.
 */
async function loadOutput(
  context: SessionContext,
  outputDocumentId: string | null,
): Promise<DreamOutputView> {
  if (!outputDocumentId) return { kind: 'none' };

  const [{ data: document }, { data: chunks }] = await Promise.all([
    context.supabase.from('documents').select('id, title').eq('id', outputDocumentId).maybeSingle(),
    context.supabase
      .from('chunks')
      .select('id, content, ordinal')
      .eq('document_id', outputDocumentId)
      .order('ordinal'),
  ]);

  if (!document) return { kind: 'none' };

  const body = (chunks ?? []).map((chunk) => chunk.content);
  const described = describeDreamOutput({
    documentId: document.id,
    title: document.title,
    chunkTexts: body,
  });

  if (described.kind !== 'cited') return described;

  const { data: cited } = await context.supabase
    .from('chunks')
    .select('id, content, document_id, documents(title)')
    .in('id', [...described.chunkIds]);

  const visible = cited ?? [];
  const visibleIds = visible.map((chunk) => chunk.id);
  const numbering = new Map(visibleIds.map((id, index) => [id, index + 1]));

  return {
    kind: 'cited',
    documentId: described.documentId,
    title: described.title,
    segments: splitCitedText(body.join('\n\n'), visibleIds),
    sources: visible.map((chunk) => ({
      index: numbering.get(chunk.id) ?? 0,
      chunkId: chunk.id,
      documentId: chunk.document_id,
      documentTitle: chunk.documents?.title ?? 'Untitled',
      excerpt: excerpt(chunk.content),
    })),
  };
}

async function loadCandidates(
  context: SessionContext,
  runId: string,
): Promise<readonly LinkCandidate[]> {
  const { data: links } = await context.supabase
    .from('dream_links')
    .select('id, document_a, document_b, similarity, rationale, confirmed_at, dismissed_at')
    .eq('dream_run_id', runId)
    .order('similarity', { ascending: false });

  if (!links || links.length === 0) return [];

  const documentIds = [...new Set(links.flatMap((link) => [link.document_a, link.document_b]))];
  const { data: documents } = await context.supabase
    .from('documents')
    .select('id, title, url, origin')
    .in('id', documentIds);

  return buildLinkCandidates({ links, documents: documents ?? [] });
}

export async function loadDreamRun(
  context: SessionContext,
  runId: string,
): Promise<DreamRunDetail | null> {
  const [{ data: run }, spaces] = await Promise.all([
    context.supabase.from('dream_runs').select(RUN_COLUMNS).eq('id', runId).maybeSingle(),
    fetchSpaces(context),
  ]);

  if (!run) return null;

  const [summary] = buildRunSummaries({ runs: [run], spaces });
  if (!summary) return null;

  const [output, candidates] = await Promise.all([
    loadOutput(context, run.output_document_id),
    run.kind === 'connections' ? loadCandidates(context, run.id) : Promise.resolve([]),
  ]);

  return { run: summary, output, candidates };
}

export type EntitiesPageData = {
  readonly groups: readonly EntityGroup[];
  readonly spaces: readonly SpaceRecord[];
};

export async function loadEntities(
  context: SessionContext,
  spaceId?: string,
): Promise<EntitiesPageData> {
  const spaces = await fetchSpaces(context);

  const entityQuery = context.supabase
    .from('entities')
    .select('id, kind, name, summary, space_id')
    .order('name')
    .limit(500);

  const { data: entities, error } = spaceId
    ? await entityQuery.eq('space_id', spaceId)
    : await entityQuery;
  if (error) throw new Error(`Could not read entities: ${error.message}`);
  if (entities.length === 0) return { groups: [], spaces };

  const { data: mentions } = await context.supabase
    .from('entity_mentions')
    .select('entity_id, document_id')
    .in(
      'entity_id',
      entities.map((entity) => entity.id),
    );

  const documentIds = [...new Set((mentions ?? []).map((mention) => mention.document_id))];
  const { data: documents } = await context.supabase
    .from('documents')
    .select('id, title, url')
    .in('id', documentIds);

  return {
    groups: buildEntityGroups({
      entities,
      mentions: mentions ?? [],
      documents: documents ?? [],
    }),
    spaces,
  };
}
