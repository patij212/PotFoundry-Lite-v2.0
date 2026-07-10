// vitest.voronoi_inthash.config.ts — DEV-ONLY config for E-2026-07-10-INTHASH.
// Node env. Only via `--config` for research/bridge/_voronoi_inthash.test.ts. Dev-only; src/ never
// imports research/. Vitest 4 ignores config poolOptions heap — pass NODE_OPTIONS on the CLI if a
// run needs more heap than the default (this spike's arrays are modest: largest is SIZE*SIZE
// Float64Array pairs at 1024x1024, well under default heap).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_voronoi_inthash.test.ts'],
    testTimeout: 600_000,
    hookTimeout: 120_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
