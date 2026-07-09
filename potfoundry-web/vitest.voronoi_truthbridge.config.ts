// vitest.voronoi_truthbridge.config.ts — DEV-ONLY config for E-2026-07-09-VORONOI-TRUTHBRIDGE.
// Node env, generous heap for a multi-million-vertex artifact. Only via `--config` for
// research/bridge/_voronoi_truthbridge.test.ts. Dev-only; src/ never imports research/.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_voronoi_truthbridge.test.ts'],
    testTimeout: 900_000,
    hookTimeout: 300_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        execArgv: ['--max-old-space-size=8192'],
      },
    },
  },
});
