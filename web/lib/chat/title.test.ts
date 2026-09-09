import { describe, expect, it } from 'vitest';

import { generateTitle, normalizeTitle, TITLE_MAX_LENGTH } from './title';

describe('normalizeTitle', () => {
  it('strips the quotes a model likes to wrap a title in', () => {
    expect(normalizeTitle('"SSO rollout status"')).toBe('SSO rollout status');
  });

  it('collapses whitespace and trailing punctuation', () => {
    expect(normalizeTitle('  SSO   rollout.  ')).toBe('SSO rollout');
  });

  it('truncates a title that would break the sidebar', () => {
    const title = normalizeTitle('word '.repeat(40));

    expect(title.length).toBeLessThanOrEqual(TITLE_MAX_LENGTH);
  });

  it('falls back to the question when the model returns nothing usable', () => {
    expect(normalizeTitle('   ', 'What did we decide about SSO?')).toBe(
      'What did we decide about SSO?',
    );
  });
});

describe('generateTitle', () => {
  it('titles a conversation from its first question', async () => {
    const asked: string[] = [];

    const title = await generateTitle(
      { question: 'What did we decide about SSO?', orgId: 'org-1' },
      {
        complete: async (messages) => {
          asked.push(messages.map((message) => message.content).join('\n'));
          return 'SSO decision';
        },
      },
    );

    expect(title).toBe('SSO decision');
    expect(asked[0]).toContain('What did we decide about SSO?');
  });

  it('falls back to the question rather than leaving a conversation unnamed', async () => {
    const title = await generateTitle(
      { question: 'What did we decide about SSO?', orgId: 'org-1' },
      {
        complete: async () => {
          throw new Error('model unavailable');
        },
      },
    );

    expect(title).toBe('What did we decide about SSO?');
  });
});
