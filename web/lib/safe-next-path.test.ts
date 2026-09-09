import { describe, expect, it } from 'vitest';

import { safeNextPath } from './safe-next-path';

const ORIGIN = 'https://recall.test';

describe('redirect targets', () => {
  it('keeps a same-origin path with its query and hash', () => {
    expect(safeNextPath('/chat/abc?q=1#top', '/', ORIGIN)).toBe('/chat/abc?q=1#top');
  });

  it('rejects an absolute url', () => {
    expect(safeNextPath('https://evil.example/steal', '/', ORIGIN)).toBe('/');
  });

  it('rejects a protocol-relative url, which resolves off-origin', () => {
    expect(safeNextPath('//evil.example', '/', ORIGIN)).toBe('/');
  });

  it('rejects a value that is not a string', () => {
    expect(safeNextPath(null, '/', ORIGIN)).toBe('/');
    expect(safeNextPath(42, '/', ORIGIN)).toBe('/');
  });

  it('uses the fallback it was given', () => {
    expect(safeNextPath(undefined, '/chat', ORIGIN)).toBe('/chat');
  });
});
