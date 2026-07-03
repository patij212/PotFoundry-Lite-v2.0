// vitest.gap_gsbss.config.ts — DEV-ONLY config for the GeometricStar / BambooSegments / SpiralRidges gap close.
// Node env (no jsdom), generous heap for dense M-square meshes + brute anchoring. Only via `--config` for the
// _gap_gsbss probe. dev-only; src/ never imports research/.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_gap_gsbss_diag.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
      execArgv: ['--max-old-space-size=16384'],
    },
  },
});
