// vitest.pf_aniso.config.ts — DEV-ONLY config for the anisotropic-ruler metrology probe
// (research/bridge/_pf_anisoRuler.test.ts). Node env, single fork, long timeout. No new meshing — reuses the two
// persisted 0-outlier bins; the per-triangle centroid-metric FD eval is the only cost (a few minutes at ~170k tris).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_anisoRuler.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 300_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
