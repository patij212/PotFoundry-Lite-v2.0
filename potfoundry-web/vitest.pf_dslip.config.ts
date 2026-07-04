// vitest.pf_dslip.config.ts — DEV-ONLY config for the DragonScales tread-lip close-out probe
// (research/bridge/_pf_dslip.test.ts). Node env, single fork, generous heap for the closed-3D BVH.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_dslip.test.ts'],
    testTimeout: 1_800_000,
    hookTimeout: 300_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
