import type { NextConfig } from 'next';

/**
 * typedRoutes is deliberately off. It derives its route union from `.next/types`,
 * which does not exist until a build has run, so it turns `tsc --noEmit` on a
 * cold checkout into a wall of errors on every dynamic href. Broken links are
 * caught by the Playwright journeys instead.
 */
const nextConfig: NextConfig = {};

export default nextConfig;
