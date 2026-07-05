import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true, environment: 'node',
    include: ['research/bridge/_pf_creststrip_diag.test.ts'],
    testTimeout: 3_600_000, hookTimeout: 300_000,
    pool: 'forks', fileParallelism: false, maxWorkers: 1, minWorkers: 1,
  },
});
