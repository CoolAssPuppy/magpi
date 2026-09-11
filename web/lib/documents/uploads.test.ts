import { describe, expect, it } from 'vitest';

import { acceptedTypeFor, MAX_UPLOAD_BYTES, storagePathFor } from './uploads';

const SPACE = '33333333-3333-4333-8333-333333333333';

describe('the type a file is recorded as', () => {
  it('takes the browser at its word when it names a type we accept', () => {
    expect(acceptedTypeFor('application/pdf', 'report.pdf')).toBe('application/pdf');
    expect(acceptedTypeFor('text/csv', 'rows.csv')).toBe('text/csv');
  });

  it('ignores the charset a browser appends', () => {
    expect(acceptedTypeFor('text/plain; charset=utf-8', 'notes.txt')).toBe('text/plain');
  });

  it('reads a type in any case the browser sends it', () => {
    expect(acceptedTypeFor('APPLICATION/PDF', 'report.pdf')).toBe('application/pdf');
  });

  // A browser reports an empty type for .md and .csv, which is the whole reason the fallback
  // exists. It is unreachable through react-dropzone, which fills the type in from the extension
  // before a component sees the file, so it is only provable here.
  it('falls back to the extension when the browser names no type at all', () => {
    expect(acceptedTypeFor('', 'decision.md')).toBe('text/markdown');
    expect(acceptedTypeFor('', 'decision.markdown')).toBe('text/markdown');
    expect(acceptedTypeFor('', 'rows.csv')).toBe('text/csv');
    expect(acceptedTypeFor('', 'page.htm')).toBe('text/html');
    expect(acceptedTypeFor('', 'page.html')).toBe('text/html');
    expect(acceptedTypeFor('', 'body.json')).toBe('application/json');
    expect(acceptedTypeFor('', 'notes.txt')).toBe('text/plain');
    expect(acceptedTypeFor('', 'report.pdf')).toBe('application/pdf');
  });

  it('falls back on the extension when the browser names a type we cannot read', () => {
    expect(acceptedTypeFor('application/octet-stream', 'decision.md')).toBe('text/markdown');
  });

  it('matches an extension whatever case it was typed in', () => {
    expect(acceptedTypeFor('', 'DECISION.MD')).toBe('text/markdown');
  });

  it('refuses a file nothing downstream could read', () => {
    expect(acceptedTypeFor('image/png', 'diagram.png')).toBeNull();
    expect(acceptedTypeFor('', 'archive.zip')).toBeNull();
  });

  it('refuses a name with no extension rather than guessing', () => {
    expect(acceptedTypeFor('', 'README')).toBeNull();
  });
});

describe('where an upload is stored', () => {
  // The first segment is the permission decision, so it has to be the space and nothing else.
  it('puts the space first, because that is what the storage policy reads', () => {
    expect(storagePathFor(SPACE, 'notes.md')).toBe(`${SPACE}/notes.md`);
  });

  it('keeps the object name as given, so two spaces can hold the same name', () => {
    const other = '44444444-4444-4444-8444-444444444444';
    expect(storagePathFor(other, 'notes.md')).not.toBe(storagePathFor(SPACE, 'notes.md'));
  });
});

describe('the size a file may be', () => {
  it('is the limit the bucket is configured with, in bytes', () => {
    expect(MAX_UPLOAD_BYTES).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_UPLOAD_BYTES)).toBe(true);
  });
});
