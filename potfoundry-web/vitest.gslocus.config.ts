// vitest.gslocus.config.ts — DEV-ONLY config for the GeometricStar feature-locus classification probe
// (research/bridge/_gsLocus.test.ts). Node env, single fork. Pure analytic sampling — fast.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_gsLocus.test.ts'],
    testTimeout: 600_000,
    hookTimeout: 120_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
