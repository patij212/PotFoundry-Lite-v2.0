// vitest.pf_bvh.config.ts — DEV-ONLY config for the BVH-truth-twin ruler probe (E-2026-07-06-BVH-RULER).
// Node env, single fork, large heap for the multi-M-tri bin meshes + the ~19M-tri dense radial twins.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_bvhRuler.test.ts'],
    testTimeout: 18_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
