import type { NextConfig } from 'next';

/**
 * typedRoutes is deliberately off. It derives its route union from `.next/types`,
 * which does not exist until a build has run, so it turns `tsc --noEmit` on a
 * cold checkout into a wall of errors on every dynamic href. Broken links are
 * caught by the Playwright journeys instead.
 */
const nextConfig: NextConfig = {
  /**
   * The dev server treats 127.0.0.1 as cross-origin and blocks its own client
   * chunks, so nothing hydrates and every form falls back to a native GET. The
   * Supabase CLI prints 127.0.0.1 URLs and Playwright drives that host, so both
   * spellings have to be allowed.
   */
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
};

export default nextConfig;
