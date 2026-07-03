// vitest.close_ztiled.config.ts — DEV-ONLY config for the z-TILED axis close-out probe
// (research/bridge/_close_ztiled.test.ts). Node env + generous heap for the dense closed-3D reference BVH.
// Vitest 4: poolOptions were flattened to top-level (single-worker fork + heap via execArgv).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_close_ztiled.test.ts'],
    testTimeout: 1_800_000,
    hookTimeout: 300_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
