// vitest.pf_best20gg.config.ts — DEV-ONLY config (PF_BEST20GG=1): Gothic+GeoStar STL/heatmap deliverable build.
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true, environment: 'node',
    include: ['research/bridge/_pf_best20_gothgeo_stl.test.ts'],
    testTimeout: 1_800_000, hookTimeout: 300_000,
    pool: 'forks', fileParallelism: false, minWorkers: 1, maxWorkers: 1,
    execArgv: ['--max-old-space-size=8192'],
  },
});
