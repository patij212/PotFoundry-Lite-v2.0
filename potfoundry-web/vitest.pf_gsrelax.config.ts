// vitest.pf_gsrelax.config.ts — DEV-ONLY config for the GeoStar sliver-close relaxation probe
// (research/bridge/_pf_perfect_geostar_relax.test.ts). Node env, single fork, long timeout for the honest brute.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_perfect_geostar_relax.test.ts'],
    testTimeout: 21_600_000,
    hookTimeout: 300_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    // Vitest 4: pool options are top-level. Raise the worker heap ceiling; the honest whole-mesh 45-pt brute over
    // 116889 facets + the resumable dev array run under heavy machine contention (a concurrent mesher loop shares
    // the box).
    forks: { execArgv: ['--max-old-space-size=4096'] },
  },
});
