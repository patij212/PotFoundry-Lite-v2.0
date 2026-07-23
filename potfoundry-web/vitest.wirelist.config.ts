// vitest.wirelist.config.ts — DEV-ONLY config for the WIRE-LIST audit probe
// (research/bridge/_wireListSmoothGrid.test.ts). Node env, single fork, generous heap + timeout
// for the ~2-3M-tri production-scale smooth-grid meshes + measureProjectorMax scoring.
// Research-only; src never imports research. Mirrors vitest.closure.config.ts.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_wireListSmoothGrid.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    // v4: heap for the ~2-4M-tri meshes is supplied via NODE_OPTIONS=--max-old-space-size (workers inherit it);
    // the removed `test.poolOptions.forks.execArgv` is intentionally omitted.
  },
});
