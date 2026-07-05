import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true, environment: 'node',
    include: ['research/bridge/_pf_rebaseDiag.test.ts'],
    testTimeout: 1_800_000, hookTimeout: 300_000,
    pool: 'forks', fileParallelism: false, maxWorkers: 1, minWorkers: 1,
  },
});
