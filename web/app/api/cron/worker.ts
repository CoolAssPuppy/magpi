import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { publicEnv, serverEnv } from '@/lib/env';

/**
 * The bridge between a Vercel cron tick and an Edge Function worker.
 *
 * The workers refuse a caller who does not present the service role key, which
 * a browser cannot hold, so something server-side has to make the call. These
 * three routes are that something and they do nothing else: no business logic
 * lives here, because the job bodies are deliberately runtime-agnostic and
 * moving off Edge Functions later should stay a wrapper change.
 *
 * Vercel signs a cron invocation with CRON_SECRET. Without that check the route
 * is an unauthenticated way for anyone to make us pay for a worker run, so a
 * missing secret refuses rather than defaulting open.
 */
export type WorkerName = 'ingest-worker' | 'sync-worker' | 'dream-worker';

function isVercelCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function runWorker(request: NextRequest, worker: WorkerName, body: unknown) {
  if (!isVercelCron(request)) {
    // Deliberately the same answer as a wrong secret. A caller learning that
    // the secret is merely unset knows more than a caller who does not.
    return NextResponse.json(
      { code: 'forbidden', message: 'not a scheduled call' },
      { status: 403 },
    );
  }

  const serviceRoleKey = serverEnv().SB_SERVICE_ROLE_KEY;
  const base = publicEnv().NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, '');

  const response = await fetch(`${base}/functions/v1/${worker}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();

  // Passed through rather than reshaped. A cron log showing the worker's own
  // status and body is the only place an operator sees why a tick did nothing.
  return new NextResponse(text, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  });
}
