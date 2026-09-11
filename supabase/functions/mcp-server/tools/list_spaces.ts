// Tells the caller what boundaries exist, so a client can offer a filter without guessing.

import type { McpServer } from '@modelcontextprotocol/server';

import { jsonResult, ToolError } from './result.ts';
import type { ToolContext } from './types.ts';

export interface SpaceSummary {
  space_id: string;
  name: string;
  kind: string;
  document_count: number;
  dreaming_enabled: boolean;
}

interface SpaceRow {
  id: string;
  name: string;
  kind: string;
  dreaming_enabled: boolean;
}

export async function listSpaces(ctx: ToolContext): Promise<{ spaces: SpaceSummary[] }> {
  const { data, error } = await ctx.supabase
    .from('spaces')
    .select('id, name, kind, dreaming_enabled')
    .order('name', { ascending: true })
    .returns<SpaceRow[]>();
  if (error) throw new ToolError(`the spaces could not be read: ${error.message}`);

  const rows = data ?? [];
  // One count each rather than one read of every document, and they go together.
  const counts = await Promise.all(rows.map(async (space) => {
    const { count, error: countError } = await ctx.supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('space_id', space.id);
    if (countError) {
      throw new ToolError(`the documents could not be counted: ${countError.message}`);
    }
    return count ?? 0;
  }));

  return {
    spaces: rows.map((space, index) => ({
      space_id: space.id,
      name: space.name,
      kind: space.kind,
      document_count: counts[index],
      dreaming_enabled: space.dreaming_enabled,
    })),
  };
}

export function registerListSpacesTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'list_spaces',
    {
      description: 'List the spaces the caller can see.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => jsonResult(await listSpaces(ctx)),
  );
}
