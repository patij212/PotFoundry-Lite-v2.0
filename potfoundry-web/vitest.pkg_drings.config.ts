// vitest.pkg_drings.config.ts — DEV-ONLY config for the drings-family best-20 packager
// (research/bridge/_pkg_drings.test.ts). Node env, single fork, generous heap for the closed-3D BVH refs.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pkg_drings.test.ts'],
    testTimeout: 1_800_000,
    hookTimeout: 300_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
