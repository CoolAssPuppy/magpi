import { describe, expect, it } from 'vitest';

import { asSentence } from './sentence';

describe('joining a message onto a prefix', () => {
  it('finishes a clause the writer left open', () => {
    expect(asSentence('ran out of time after 148s')).toBe('Ran out of time after 148s.');
  });

  it('leaves a finished sentence alone', () => {
    expect(asSentence('Notion refused this connection, reconnect it.')).toBe(
      'Notion refused this connection, reconnect it.',
    );
  });

  // Both columns it reads carry both shapes, so applying it twice has to be safe.
  it('is idempotent, which is what makes a mixed column safe rather than lucky', () => {
    const once = asSentence('the import was interrupted and did not finish');
    expect(asSentence(once)).toBe(once);
  });

  it('trims what the writer left around the edges', () => {
    expect(asSentence('  the chunks could not be stored  ')).toBe(
      'The chunks could not be stored.',
    );
  });

  it('does not lowercase a proper noun that already opens the message', () => {
    expect(asSentence('Google Drive is no longer available')).toBe(
      'Google Drive is no longer available.',
    );
  });
});
