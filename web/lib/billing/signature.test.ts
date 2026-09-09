import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { verifyStripeSignature } from './signature';

const SECRET = 'whsec_test_secret';
const PAYLOAD = '{"id":"evt_1","type":"customer.subscription.deleted"}';
const NOW = new Date('2026-09-09T14:20:00.000Z');

function signatureHeader({
  payload = PAYLOAD,
  secret = SECRET,
  timestamp = Math.floor(NOW.getTime() / 1000),
  scheme = 'v1',
}: {
  payload?: string;
  secret?: string;
  timestamp?: number;
  scheme?: string;
} = {}): string {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},${scheme}=${digest}`;
}

describe('stripe signature verification', () => {
  it('accepts a payload signed with the endpoint secret', () => {
    const result = verifyStripeSignature({
      payload: PAYLOAD,
      header: signatureHeader(),
      secret: SECRET,
      now: NOW,
    });

    expect(result).toEqual({ ok: true, data: PAYLOAD });
  });

  it('accepts a header carrying several v1 signatures, as a rotating endpoint sends', () => {
    const stale = createHmac('sha256', 'whsec_old').update('0.nonsense').digest('hex');
    const header = `${signatureHeader()},v1=${stale}`;

    expect(verifyStripeSignature({ payload: PAYLOAD, header, secret: SECRET, now: NOW }).ok).toBe(
      true,
    );
  });

  it('rejects a payload signed with a different secret', () => {
    const result = verifyStripeSignature({
      payload: PAYLOAD,
      header: signatureHeader({ secret: 'whsec_someone_else' }),
      secret: SECRET,
      now: NOW,
    });

    expect(result).toEqual({ ok: false, error: 'no signature matched the endpoint secret' });
  });

  it('rejects a body that changed after it was signed', () => {
    const result = verifyStripeSignature({
      payload: '{"id":"evt_1","type":"customer.subscription.updated"}',
      header: signatureHeader(),
      secret: SECRET,
      now: NOW,
    });

    expect(result.ok).toBe(false);
  });

  it('rejects a signature older than the replay tolerance', () => {
    const result = verifyStripeSignature({
      payload: PAYLOAD,
      header: signatureHeader({ timestamp: Math.floor(NOW.getTime() / 1000) - 3600 }),
      secret: SECRET,
      now: NOW,
    });

    expect(result).toEqual({ ok: false, error: 'signature timestamp outside tolerance' });
  });

  it('rejects a timestamp far in the future, which is the same replay in reverse', () => {
    const result = verifyStripeSignature({
      payload: PAYLOAD,
      header: signatureHeader({ timestamp: Math.floor(NOW.getTime() / 1000) + 3600 }),
      secret: SECRET,
      now: NOW,
    });

    expect(result.ok).toBe(false);
  });

  it('rejects a header with no v1 signature in it', () => {
    const result = verifyStripeSignature({
      payload: PAYLOAD,
      header: signatureHeader({ scheme: 'v0' }),
      secret: SECRET,
      now: NOW,
    });

    expect(result).toEqual({ ok: false, error: 'signature header is malformed' });
  });

  it('rejects a missing header', () => {
    const result = verifyStripeSignature({
      payload: PAYLOAD,
      header: null,
      secret: SECRET,
      now: NOW,
    });

    expect(result).toEqual({ ok: false, error: 'signature header is malformed' });
  });

  it('rejects a header with no timestamp', () => {
    const digest = createHmac('sha256', SECRET).update(`0.${PAYLOAD}`).digest('hex');

    const result = verifyStripeSignature({
      payload: PAYLOAD,
      header: `v1=${digest}`,
      secret: SECRET,
      now: NOW,
    });

    expect(result).toEqual({ ok: false, error: 'signature header is malformed' });
  });
});
