// The primary tool. Answers a question across everything the caller can see.

import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { jsonResult, ToolError } from './result.ts';
import type { ToolContext } from './types.ts';

const DEFAULT_LIMIT = 20;

const inputSchema = z.object({
  query: z.string().trim().min(1).max(1000).describe('The question or phrase to search for.'),
  space_ids: z.array(z.string().uuid()).max(50).optional().describe(
    'Narrow the search to these spaces. Omit to search every space the caller can see. ' +
      'Ids the caller cannot see are ignored.',
  ),
  limit: z.number().int().min(1).max(50).default(DEFAULT_LIMIT).describe(
    'Maximum passages to return.',
  ),
});

export type SearchInput = z.infer<typeof inputSchema>;

export interface Passage {
  chunk_id: string;
  document_id: string;
  space_id: string;
  document_title: string;
  document_url: string | null;
  content: string;
  score: number;
}

// The rpc client is untyped here, so the fused search's answer is read at the boundary.
const hitsSchema = z.array(z.object({
  chunk_id: z.string(),
  document_id: z.string(),
  space_id: z.string(),
  content: z.string(),
  score: z.number(),
}));

interface DocumentLabel {
  id: string;
  title: string;
  url: string | null;
}

/** The plan's question meter. The web app counts an answered question; so does a search here. */
async function requireQueryAllowance(ctx: ToolContext): Promise<void> {
  const { data, error } = await ctx.supabase
    .rpc('check_query_allowed', { p_org_id: ctx.orgId })
    .maybeSingle<{ allowed: boolean; reason: string }>();
  if (error) throw new ToolError(`the plan could not be checked: ${error.message}`);
  if (data && !data.allowed) throw new ToolError(data.reason);
}

export async function searchPassages(
  ctx: ToolContext,
  input: SearchInput,
): Promise<{ results: Passage[] }> {
  await requireQueryAllowance(ctx);

  const [embedding] = await ctx.models.embed({ orgId: ctx.orgId, texts: [input.query] });

  // The caller's client, so `search` runs under `chunks_select_visible` and sees only their rows.
  const { data, error } = await ctx.supabase.rpc('search', {
    query_embedding: embedding,
    query_text: input.query,
    match_count: input.limit,
    ...(input.space_ids ? { space_filter: input.space_ids } : {}),
  }).returns<unknown>();
  if (error) throw new ToolError(`the search failed: ${error.message}`);

  const parsed = hitsSchema.safeParse(data ?? []);
  if (!parsed.success) throw new ToolError('the search returned something unreadable');
  const hits = parsed.data;
  if (hits.length === 0) return { results: [] };

  const documentIds = [...new Set(hits.map((hit) => hit.document_id))];
  const { data: documents, error: documentError } = await ctx.supabase
    .from('documents')
    .select('id, title, url')
    .in('id', documentIds)
    .returns<DocumentLabel[]>();
  if (documentError) {
    throw new ToolError(`the documents could not be read: ${documentError.message}`);
  }

  const labels = new Map((documents ?? []).map((row) => [row.id, row]));
  const results = hits.map((hit) => ({
    chunk_id: hit.chunk_id,
    document_id: hit.document_id,
    space_id: hit.space_id,
    document_title: labels.get(hit.document_id)?.title ?? 'Untitled',
    document_url: labels.get(hit.document_id)?.url ?? null,
    content: hit.content,
    score: hit.score,
  }));

  await record(ctx, documentIds);
  return { results };
}

/** Housekeeping that follows a search: the read marks, and the meter. Neither may fail a search. */
async function record(ctx: ToolContext, documentIds: string[]): Promise<void> {
  const { error } = await ctx.supabase.rpc('record_retrieval', { p_document_ids: documentIds });
  if (error) console.error('retrieval not recorded', error.message);

  const { error: meterError } = await ctx.admin
    .from('usage_events')
    .insert({ org_id: ctx.orgId, kind: 'query', quantity: 1 });
  if (meterError) console.error('query meter write failed', meterError.message);
}

export function registerSearchTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'search',
    {
      description:
        "Search the caller's knowledge base and return matching passages with their source " +
        'documents.',
      inputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => jsonResult(await searchPassages(ctx, input)),
  );
}
