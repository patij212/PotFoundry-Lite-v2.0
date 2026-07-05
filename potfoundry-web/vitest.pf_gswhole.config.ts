// vitest.pf_gswhole.config.ts — DEV-ONLY config for the GATE-1 GeoStar whole-mesh literal-0 guard + refine probe
// (research/bridge/_pf_perfect_geostar_wholemesh.test.ts). Node env, single fork, long timeout for the honest brute.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_perfect_geostar_wholemesh.test.ts'],
    testTimeout: 21_600_000,
    hookTimeout: 300_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
