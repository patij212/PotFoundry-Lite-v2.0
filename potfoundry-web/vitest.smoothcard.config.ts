// vitest.smoothcard.config.ts — DEV-ONLY config for the smooth-grid production scorecard probe
// (research/bridge/_pfCloseSmoothCard.test.ts). Node env, single fork, generous heap + timeout for the
// production-scale structured-emitter meshes (SpiralRidges ~4M tris) + true-3D projector scoring.
// Mirrors vitest.closure.config.ts. Run:
//   PF_SMOOTHCARD=1 npx vitest run --config vitest.smoothcard.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pfCloseSmoothCard.test.ts'],
    testTimeout: 18_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
