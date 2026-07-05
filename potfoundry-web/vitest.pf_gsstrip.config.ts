// vitest.pf_gsstrip.config.ts — DEV-ONLY config for the GeometricStar structured-quad flank-strip GATE-2 probe
// (research/bridge/_pf_geostar_structstrip.test.ts). Node env, single fork, long timeout for the honest whole-mesh brute.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_geostar_structstrip.test.ts'],
    testTimeout: 21_600_000,
    hookTimeout: 300_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
