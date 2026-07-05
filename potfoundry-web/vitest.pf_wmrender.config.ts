// vitest.pf_wmrender.config.ts — DEV-ONLY render config (PF_WMRENDER=1) for the whole-mesh Gothic heatmap.
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true, environment: 'node',
    include: ['research/bridge/_pf_wholemesh_render.test.ts'],
    testTimeout: 1_800_000, hookTimeout: 300_000,
    pool: 'forks', fileParallelism: false, minWorkers: 1, maxWorkers: 1,
    execArgv: ['--max-old-space-size=8192'],
  },
});
