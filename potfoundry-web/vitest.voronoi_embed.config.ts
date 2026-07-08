// vitest.voronoi_embed.config.ts — DEV-ONLY config for E-2026-07-09-VORONOI-EMBED.
// Node env, generous heap, single fork. Only via `--config` for the _voronoi_embed probe. ISOLATED.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_voronoi_embed.test.ts'],
    testTimeout: 3_600_000 * 5,
    hookTimeout: 600_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        execArgv: ['--max-old-space-size=8192'],
      },
    },
  },
});
