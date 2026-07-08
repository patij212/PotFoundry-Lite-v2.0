// vitest.ds_steptwin_diag.config.ts — DEV-ONLY config for E-2026-07-08-DS-STEPTWIN-CLOSE diagnostic.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_dssteptwin_diag.test.ts'],
    testTimeout: 7_200_000,
    hookTimeout: 300_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
