// vitest.gsseam.config.ts — DEV-ONLY config for the GeometricStar seam-weld root-cause + fix probe
// (research/bridge/_gsSeamWeld.test.ts). Node env, single fork, generous heap + timeout for the
// production-scale region-kernel meshes + true-3D scoring. Mirrors vitest.gsprod.config.ts.
// Heap flag MUST be on the command line (NODE_OPTIONS=--max-old-space-size=...) — Vitest 4 ignores execArgv.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_gsSeamWeld.test.ts'],
    testTimeout: 18_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
