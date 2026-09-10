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
  /** The tool it came from, so a citation shows its mark. Null for an upload and a dream. */
  documentSource: z.string().nullable(),
  excerpt: z.string(),
  /** The position this passage held in the prompt, which is the number the answer cites. */
  label: z.number().int().positive(),
});

export type Citation = z.infer<typeof citationSchema>;

/** One JSON object per line: citations before the first token, the title after it closes. */
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
  // Separate from rate_limited because asking again in a minute works for one and not the other.
  'plan_limited',
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

/** Splits a buffer on line boundaries and returns the unfinished tail for the next read. */
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
