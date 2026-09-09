import { decodeEvents, type ChatEvent, type ChatRequest } from './protocol';

export const CHAT_ENDPOINT = '/api/chat';

const UNEXPLAINED_FAILURE = 'The answer could not be reached. Ask again.';

export type AskDeps = {
  readonly fetch?: typeof fetch;
  readonly signal?: AbortSignal;
};

/**
 * Reads the newline delimited answer stream. A refusal before the stream opens
 * arrives as JSON and is handed on as an error event, so a caller has one shape
 * to handle either way.
 */
export async function askChat(
  request: ChatRequest,
  onEvent: (event: ChatEvent) => void,
  deps: AskDeps = {},
): Promise<void> {
  const send = deps.fetch ?? fetch;

  const response = await send(CHAT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: deps.signal,
  });

  if (!response.ok || !response.body) {
    onEvent({ type: 'error', message: await refusalMessage(response) });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let rest = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    const decoded = decodeEvents(rest + decoder.decode(value, { stream: true }));
    rest = decoded.rest;
    for (const event of decoded.events) onEvent(event);
  }
}

async function refusalMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const { message } = body as { message: unknown };
      if (typeof message === 'string') return message;
    }
  } catch {
    return UNEXPLAINED_FAILURE;
  }

  return UNEXPLAINED_FAILURE;
}
