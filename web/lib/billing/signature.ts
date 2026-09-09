import { createHmac, timingSafeEqual } from 'node:crypto';

import { err, ok, type Result } from '@/lib/result';

/**
 * Stripe's own default. A signature older than this is a replay, and one from
 * the future is the same attack with the clock turned around.
 */
const TOLERANCE_SECONDS = 300;

type SignatureInput = {
  readonly payload: string;
  readonly header: string | null;
  readonly secret: string;
  readonly now: Date;
};

type ParsedHeader = {
  readonly timestamp: number;
  readonly signatures: readonly string[];
};

function parseHeader(header: string): ParsedHeader | null {
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of header.split(',')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;

    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();

    if (key === 't') timestamp = Number(value);
    else if (key === 'v1') signatures.push(value);
  }

  if (timestamp === null || !Number.isFinite(timestamp) || signatures.length === 0) return null;
  return { timestamp, signatures };
}

function matches(expected: string, candidate: string): boolean {
  const expectedBytes = Buffer.from(expected, 'hex');
  const candidateBytes = Buffer.from(candidate, 'hex');
  if (expectedBytes.length === 0 || expectedBytes.length !== candidateBytes.length) return false;
  return timingSafeEqual(expectedBytes, candidateBytes);
}

/**
 * Verifies a Stripe webhook against the endpoint secret and returns the raw
 * body, unparsed. The body has to be the exact bytes Stripe signed, so nothing
 * upstream of this may re-serialize it.
 *
 * An endpoint mid secret-rotation sends several v1 signatures in one header, so
 * any one of them matching is a pass.
 */
export function verifyStripeSignature({
  payload,
  header,
  secret,
  now,
}: SignatureInput): Result<string> {
  const parsed = header === null ? null : parseHeader(header);
  if (!parsed) return err('signature header is malformed');

  const ageSeconds = Math.abs(Math.floor(now.getTime() / 1000) - parsed.timestamp);
  if (ageSeconds > TOLERANCE_SECONDS) return err('signature timestamp outside tolerance');

  const expected = createHmac('sha256', secret)
    .update(`${parsed.timestamp}.${payload}`)
    .digest('hex');

  if (!parsed.signatures.some((candidate) => matches(expected, candidate))) {
    return err('no signature matched the endpoint secret');
  }

  return ok(payload);
}
