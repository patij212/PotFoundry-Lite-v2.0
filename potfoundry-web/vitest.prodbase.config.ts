// vitest.prodbase.config.ts — DEV-ONLY config for the production-scale true-3D baseline probe
// (research/bridge/_prodScaleBaseline.test.ts). Node env, single fork, generous heap + timeout for the ~0.6M-tri
// region-kernel meshes + true-3D scoring. Mirrors vitest.rebaseline20.config.ts.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_prodScaleBaseline.test.ts'],
    testTimeout: 18_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
