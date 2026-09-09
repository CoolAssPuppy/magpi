import { z } from 'zod';

export const chatRequestSchema = z.object({
  conversationId: z.uuid(),
  message: z.string().trim().min(1).max(4000),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const citationSchema = z.object({
  chunkId: z.uuid(),
  documentId: z.uuid(),
  documentTitle: z.string(),
  excerpt: z.string(),
});

export type Citation = z.infer<typeof citationSchema>;

/**
 * One JSON object per line. Citations arrive before the first token so the UI
 * can show its sources while the answer is still being written, and the title
 * arrives after the answer is closed so naming a conversation never delays it.
 */
export const chatEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('citations'), citations: z.array(citationSchema) }),
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({ type: z.literal('done'), messageId: z.uuid() }),
  z.object({ type: z.literal('title'), title: z.string() }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);

export type ChatEvent = z.infer<typeof chatEventSchema>;

export const CHAT_ERROR_CODES = [
  'unauthorized',
  'invalid_request',
  'not_found',
  'rate_limited',
  'server_error',
] as const;

export type ChatErrorCode = (typeof CHAT_ERROR_CODES)[number];

export type ChatErrorBody = {
  readonly code: ChatErrorCode;
  readonly message: string;
};

export function encodeEvent(event: ChatEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/**
 * Splits a buffer on line boundaries and returns whatever tail has not
 * completed yet, which the caller prepends to the next read.
 */
export function decodeEvents(buffer: string): {
  readonly events: readonly ChatEvent[];
  readonly rest: string;
} {
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  const events: ChatEvent[] = [];

  for (const line of lines) {
    if (line.trim() === '') continue;
    const parsed = chatEventSchema.safeParse(safeJson(line));
    if (parsed.success) events.push(parsed.data);
  }

  return { events, rest };
}

function safeJson(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}
