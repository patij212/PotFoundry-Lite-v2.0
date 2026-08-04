// vitest.gsstrip.config.ts — DEV-ONLY config for E-2026-07-22-GEOSTAR-STRIP-EMITTER
// (research/bridge/_geoStarStripEmitter.test.ts). Mirrors vitest.gsprod.config.ts: forks + singleFork, node env.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_geoStarStripEmitter.test.ts'],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
