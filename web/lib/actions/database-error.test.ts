import { afterEach, describe, expect, it, vi } from 'vitest';

import { databaseErrorState, type DatabaseError } from './database-error';

const refusal = (overrides: Partial<DatabaseError> = {}): DatabaseError => ({
  code: '42501',
  message: 'new row violates row-level security policy for table "conversations"',
  details: '',
  ...overrides,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reporting a database refusal', () => {
  it('answers with product copy rather than the schema the reader cannot see', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const state = databaseErrorState('creating a conversation', refusal(), {
      fallback: 'That conversation could not be started.',
    });

    expect(state).toEqual({
      status: 'error',
      message: 'That conversation could not be started.',
    });
  });

  it('keeps the raw error where an operator can read it', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    databaseErrorState('creating a conversation', refusal(), { fallback: 'Nope.' });

    expect(consoleError).toHaveBeenCalledWith('creating a conversation', {
      code: '42501',
      message: 'new row violates row-level security policy for table "conversations"',
      details: '',
    });
  });

  // A unique violation is the one refusal a reader can act on, so the caller
  // that knows which constraint it is says what to do about it.
  it('uses the copy a caller wrote for a code it recognises', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const state = databaseErrorState('adding a member', refusal({ code: '23505' }), {
      fallback: 'That member could not be added.',
      byCode: { '23505': 'They are already in this space.' },
    });

    expect(state).toEqual({ status: 'error', message: 'They are already in this space.' });
  });

  it('falls back when the code is one no caller anticipated', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const state = databaseErrorState('adding a member', refusal({ code: '40001' }), {
      fallback: 'That member could not be added.',
      byCode: { '23505': 'They are already in this space.' },
    });

    expect(state).toEqual({ status: 'error', message: 'That member could not be added.' });
  });
});
