// vitest.smoothfix.config.ts — DEV-ONLY config for the smooth-grid density verify-and-bump PROOF probe
// (research/bridge/_pfSmoothGridDensityFix.test.ts). Node env, single fork, generous heap + timeout for the
// production-scale bumped meshes (SpiralRidges/HexHive ~1.5M tris) + true-3D projector scoring.
// Mirrors vitest.smoothcard.config.ts. Run:
//   PF_SMOOTHFIX=1 npx vitest run --config vitest.smoothfix.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pfSmoothGridDensityFix.test.ts'],
    testTimeout: 18_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
