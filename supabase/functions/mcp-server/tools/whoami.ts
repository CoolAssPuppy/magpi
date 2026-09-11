// Proves the transport and the auth path end to end, and says which of the two it was.

import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { jsonResult, ToolError } from './result.ts';
import type { ToolContext } from './types.ts';

export interface Identity {
  user_id: string;
  email: string | null;
  /** Present for an OAuth token, null for a session forwarded by the product itself. */
  client_id: string | null;
  org_id: string;
  space_count: number;
}

export async function identify(ctx: ToolContext): Promise<Identity> {
  const { data, error } = await ctx.supabase.rpc('visible_space_ids').returns<unknown>();
  if (error) throw new ToolError(`the visible spaces could not be read: ${error.message}`);
  const spaces = z.array(z.string()).safeParse(data ?? []);

  const clientId = ctx.jwtClaims.client_id;
  return {
    user_id: ctx.userClaims.id,
    email: ctx.userClaims.email ?? null,
    client_id: typeof clientId === 'string' && clientId.length > 0 ? clientId : null,
    org_id: ctx.orgId,
    space_count: spaces.success ? spaces.data.length : 0,
  };
}

export function registerWhoamiTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'whoami',
    {
      description: 'Return the identity of the calling user.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => jsonResult(await identify(ctx)),
  );
}
