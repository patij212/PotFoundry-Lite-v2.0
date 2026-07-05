// vitest.pf_hyrender.config.ts — DEV-ONLY config for the hybrid-mesh true-3D heatmap render probe.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_hybrid_render.test.ts'],
    testTimeout: 1_800_000,
    hookTimeout: 120_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
