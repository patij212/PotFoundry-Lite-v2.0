// vitest.pf_dslipq.config.ts — DEV-ONLY config for the DragonScales lip quality/serration sweep (ref-free, fast).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_dslipq.test.ts'],
    testTimeout: 900_000,
    hookTimeout: 120_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
