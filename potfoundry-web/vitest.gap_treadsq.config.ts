// vitest.gap_treadsq.config.ts — DEV-ONLY config for the tread-square %<20 close-out probe
// (research/bridge/_gap_treadsq.test.ts). Node env, single fork, generous heap for the closed-3D BVH.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_gap_treadsq.test.ts'],
    testTimeout: 1_800_000,
    hookTimeout: 300_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
