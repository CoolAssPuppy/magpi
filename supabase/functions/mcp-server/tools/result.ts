// Every tool answers with JSON text, which is what the SDK sends and what a model reads.

import type { CallToolResult } from '@modelcontextprotocol/server';

export function jsonResult(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

/** A tool failure the caller can act on. The SDK turns it into a tool error the model sees. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}
