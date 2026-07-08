// vitest.ct_pred.config.ts — DEV-ONLY config for E-2026-07-08-CT-PREDICATE
// (research/bridge/_ct_predicate.test.ts). Node env, single fork, long timeout for the per-band whole-mesh BVH.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_ct_predicate.test.ts'],
    testTimeout: 18_000_000,
    hookTimeout: 300_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
