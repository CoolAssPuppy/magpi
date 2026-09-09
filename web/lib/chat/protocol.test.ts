import { describe, expect, it } from 'vitest';

import { chatRequestSchema, decodeEvents, encodeEvent, type ChatEvent } from './protocol';

const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';

describe('chatRequestSchema', () => {
  it('accepts a question for a conversation', () => {
    const parsed = chatRequestSchema.parse({
      conversationId: CONVERSATION_ID,
      message: '  what did we decide about SSO?  ',
    });

    expect(parsed).toEqual({
      conversationId: CONVERSATION_ID,
      message: 'what did we decide about SSO?',
    });
  });

  it('rejects a question that is only whitespace', () => {
    expect(
      chatRequestSchema.safeParse({ conversationId: CONVERSATION_ID, message: '   ' }).success,
    ).toBe(false);
  });

  it('rejects a conversation id that is not a uuid', () => {
    expect(chatRequestSchema.safeParse({ conversationId: 'nope', message: 'hi' }).success).toBe(
      false,
    );
  });
});

describe('stream framing', () => {
  it('reads back the events it wrote', () => {
    const events: ChatEvent[] = [
      { type: 'delta', text: 'Hel' },
      { type: 'delta', text: 'lo' },
      { type: 'done', messageId: CONVERSATION_ID },
    ];

    const { events: decoded, rest } = decodeEvents(events.map(encodeEvent).join(''));

    expect(decoded).toEqual(events);
    expect(rest).toBe('');
  });

  it('holds a half-arrived line back until the rest of it lands', () => {
    const whole = encodeEvent({ type: 'delta', text: 'streamed' });
    const cut = Math.floor(whole.length / 2);

    const first = decodeEvents(whole.slice(0, cut));
    expect(first.events).toEqual([]);

    const second = decodeEvents(first.rest + whole.slice(cut));
    expect(second.events).toEqual([{ type: 'delta', text: 'streamed' }]);
  });

  it('drops a line that is not an event this version understands', () => {
    const { events } = decodeEvents('{"type":"from-the-future"}\n{"type":"delta","text":"ok"}\n');

    expect(events).toEqual([{ type: 'delta', text: 'ok' }]);
  });
});
