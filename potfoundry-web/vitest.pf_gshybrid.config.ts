// vitest.pf_gshybrid.config.ts — DEV-ONLY config for the GeometricStar HYBRID (clean structured strip + localized
// honest-brute apex refine) probes: _pf_geostar_hybrid_diag.test.ts + _pf_geostar_hybrid.test.ts. Node env, single
// fork, long timeout for the honest whole-mesh brute guard.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_geostar_hybrid*.test.ts'],
    testTimeout: 21_600_000,
    hookTimeout: 300_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
