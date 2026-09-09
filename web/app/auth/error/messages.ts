/**
 * Sign in failures arrive as a query parameter on a link anyone can compose and
 * send, so the page renders copy this file owns and treats the parameter as a
 * lookup key. A value that misses every key gets the generic sentence.
 *
 * The keys are the codes GoTrue puts on a failed redirect. `error_code` is the
 * narrower of the two and wins when both are present.
 */
const FAILURES: Record<string, string> = {
  access_denied:
    'The sign in was refused before a session was created. Start again from the sign in page.',
  otp_expired: 'That link has expired. Ask for a new one and open it within the hour.',
  invalid_request: 'That link is missing something the sign in needs. Ask for a new one.',
  unauthorized_client:
    'This deployment is not registered with that provider. Tell whoever set it up.',
  server_error: 'The sign in provider had trouble. Try again in a moment.',
  temporarily_unavailable: 'The sign in provider had trouble. Try again in a moment.',
  provider_email_needs_verification:
    'Verify your email address with the provider, then sign in again.',
};

export const GENERIC_FAILURE = 'Sign in did not finish. Start again from the sign in page.';

const NO_CODE = 'The link was missing the token needed to finish signing in.';

export function signInFailureCopy(params: {
  readonly error?: string;
  readonly errorCode?: string;
}): string {
  const { error, errorCode } = params;
  if (!error && !errorCode) return NO_CODE;

  const known =
    (errorCode ? FAILURES[errorCode] : undefined) ?? (error ? FAILURES[error] : undefined);
  return known ?? GENERIC_FAILURE;
}
