import { describe, expect, it } from 'vitest';

import { GENERIC_FAILURE, signInFailureCopy } from './messages';

describe('what the sign in failure page says', () => {
  it('names the failure a provider reports as a refusal', () => {
    expect(signInFailureCopy({ error: 'access_denied' })).toBe(
      'The sign in was refused before a session was created. Start again from the sign in page.',
    );
  });

  it('tells the reader an expired link needs replacing', () => {
    expect(signInFailureCopy({ error: 'access_denied', errorCode: 'otp_expired' })).toBe(
      'That link has expired. Ask for a new one and open it within the hour.',
    );
  });

  it('reads the more specific code when both are present', () => {
    expect(signInFailureCopy({ error: 'server_error', errorCode: 'otp_expired' })).not.toBe(
      signInFailureCopy({ error: 'server_error' }),
    );
  });

  it('shows fixed copy for a code it has never heard of', () => {
    expect(signInFailureCopy({ error: 'made-up-code' })).toBe(GENERIC_FAILURE);
  });

  it('renders none of a sentence an attacker put in the link', () => {
    const injected = 'Your account was suspended. Call 555-0100 to restore it.';

    expect(signInFailureCopy({ error: injected })).toBe(GENERIC_FAILURE);
    expect(signInFailureCopy({ errorCode: injected })).toBe(GENERIC_FAILURE);
  });

  it('explains a link with no token when the page is reached with no code at all', () => {
    expect(signInFailureCopy({})).toBe(
      'The link was missing the token needed to finish signing in.',
    );
  });
});
