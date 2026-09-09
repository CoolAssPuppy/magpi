import { describe, expect, it } from 'vitest';

import { safeNextPath } from './safe-next-path';

describe('redirect targets', () => {
  it('keeps a same-origin path', () => {
    expect(safeNextPath('/chat/abc')).toBe('/chat/abc');
  });

  it('rejects an absolute url', () => {
    expect(safeNextPath('https://evil.example/steal')).toBe('/');
  });

  it('rejects a protocol-relative url, which resolves off-origin', () => {
    expect(safeNextPath('//evil.example')).toBe('/');
  });

  it('rejects a backslash variant', () => {
    expect(safeNextPath('/\\evil.example')).toBe('/');
  });

  it('falls back when there is nothing to redirect to', () => {
    expect(safeNextPath(null)).toBe('/');
    expect(safeNextPath('')).toBe('/');
    expect(safeNextPath(undefined, '/chat')).toBe('/chat');
  });
})
