// vitest.pf_race_intrinsic.config.ts — DEV-ONLY config for the intrinsic-apex cusp proxy
// (research/bridge/_pf_race_intrinsicApex.test.ts). Node env, single fork, no parallelism (brute ruler is CPU-bound).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_race_intrinsicApex.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 300_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
