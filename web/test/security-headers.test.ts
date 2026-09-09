import { afterEach, describe, expect, it } from 'vitest';

import nextConfig from '../next.config';

const PROJECT_URL = 'https://project-ref.supabase.co';

async function headerMap(): Promise<Record<string, string>> {
  const rules = await nextConfig.headers?.();
  const everyPath = (rules ?? []).find((rule) => rule.source === '/:path*');
  if (!everyPath) throw new Error('no rule covers every path');

  return Object.fromEntries(everyPath.headers.map((header) => [header.key, header.value]));
}

async function policy(): Promise<readonly string[]> {
  const map = await headerMap();
  return (map['Content-Security-Policy'] ?? '').split(';').map((part) => part.trim());
}

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:55321';
});

describe('the headers every response carries', () => {
  it('refuses to be framed, so a clickjacking page cannot wrap the app', async () => {
    expect(await policy()).toContain("frame-ancestors 'none'");
  });

  it('pins the browser to https for two years', async () => {
    const map = await headerMap();

    expect(map['Strict-Transport-Security']).toBe('max-age=63072000; includeSubDomains');
  });

  it('stops the browser guessing a content type for an ingested file', async () => {
    const map = await headerMap();

    expect(map['X-Content-Type-Options']).toBe('nosniff');
  });

  it('keeps the path and query off the referrer of an outbound link', async () => {
    const map = await headerMap();

    expect(map['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  it('loads everything from this origin unless a directive says otherwise', async () => {
    expect(await policy()).toContain("default-src 'self'");
    expect(await policy()).toContain("object-src 'none'");
    expect(await policy()).toContain("base-uri 'self'");
  });

  it('lets the browser reach the Supabase project over https and realtime over wss', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = `${PROJECT_URL}/`;

    const connect = (await policy()).find((part) => part.startsWith('connect-src'));

    expect(connect).toBe(`connect-src 'self' ${PROJECT_URL} wss://project-ref.supabase.co`);
  });

  it('falls back to this origin alone when no project is configured', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    expect(await policy()).toContain("connect-src 'self'");
  });

  it('posts a billing form to Stripe and nowhere else off this origin', async () => {
    const formAction = (await policy()).find((part) => part.startsWith('form-action'));

    expect(formAction).toBe(
      "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
    );
  });
});
