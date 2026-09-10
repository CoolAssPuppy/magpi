// POST /mcp-server stub, one whoami tool. TODO(edge-functions): real tools once BYO MCP ships.

import { ApiError, jsonResponse } from '../_shared/errors.ts';
import { serveFunction } from '../_shared/http.ts';
import { requireUser } from '../_shared/auth.ts';
import { serviceClient } from '../_shared/db.ts';
import { enforceRateLimits } from '../_shared/rate_limit.ts';

const PROTOCOL_VERSION = '2025-06-18';

const WHOAMI = {
  name: 'whoami',
  description: 'Returns the Magpi account this connection is acting as.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
} as const;

/** The four tools the real server will expose. */
const PLANNED_TOOLS = ['search', 'get_document', 'list_spaces', 'add_note'] as const;

serveFunction('mcp-server', async (core) => {
  const user = await requireUser(core.headers);
  const db = serviceClient();

  await enforceRateLimits(db, [
    { bucket: `mcp:user:${user.id}`, limit: 120, windowSeconds: 600 },
  ]);

  if (core.method !== 'POST') {
    throw new ApiError(405, 'method_not_allowed', 'this endpoint takes POST');
  }

  const request = typeof core.body === 'object' && core.body !== null
    ? (core.body as Record<string, unknown>)
    : {};
  const method = typeof request.method === 'string' ? request.method : '';

  switch (method) {
    case 'initialize':
      return jsonResponse({
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: { name: 'magpi', version: '0.1.0' },
        capabilities: { tools: {} },
      });

    case 'tools/list':
      return jsonResponse({ tools: [WHOAMI], planned: PLANNED_TOOLS });

    case 'tools/call': {
      const params = typeof request.params === 'object' && request.params !== null
        ? (request.params as Record<string, unknown>)
        : {};
      if (params.name !== WHOAMI.name) {
        throw new ApiError(400, 'unknown_tool', 'this server exposes only whoami for now');
      }
      return jsonResponse({
        content: [{ type: 'text', text: `Signed in as ${user.email ?? user.id}` }],
      });
    }

    default:
      throw new ApiError(400, 'unsupported_method', 'this stub answers initialize and tools only');
  }
});
