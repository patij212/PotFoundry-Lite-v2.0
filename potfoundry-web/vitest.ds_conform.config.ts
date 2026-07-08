// vitest.ds_conform.config.ts — DEV-ONLY config for E-2026-07-08-DS-CONFORMING-RULER
// (research/bridge/_pf_dsconform.test.ts). Node env, single fork, long timeout for the whole-mesh conforming sweep.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_dsconform.test.ts'],
    testTimeout: 21_600_000,
    hookTimeout: 300_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
