// vitest.pf_hybrid.config.ts — DEV-ONLY config for the HYBRID clean-strip + local brute apex-refine sliver-close
// probe (research/bridge/_pf_hybrid_apex.test.ts). Node env, single fork, long timeout for the honest whole-mesh brute.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_hybrid_apex.test.ts'],
    testTimeout: 21_600_000,
    hookTimeout: 300_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
