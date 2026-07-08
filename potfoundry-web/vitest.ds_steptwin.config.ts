// vitest.ds_steptwin.config.ts — DEV-ONLY config for E-2026-07-08-DS-STEPTWIN-CLOSE
// (research/bridge/_pf_dssteptwin.test.ts). Node env, single fork, long timeout for the whole-mesh step-twin sweep.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_dssteptwin.test.ts'],
    testTimeout: 21_600_000,
    hookTimeout: 300_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
