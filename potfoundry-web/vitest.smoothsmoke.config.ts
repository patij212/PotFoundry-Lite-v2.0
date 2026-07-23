// vitest.smoothsmoke.config.ts — DEV-ONLY FAST de-risk config for the smooth-grid verify-and-bump core logic
// (research/bridge/_pfSmoothFixSmoke.test.ts — no measureProjectorMax). Run:
//   PF_SMOOTHSMOKE=1 npx vitest run --config vitest.smoothsmoke.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pfSmoothFixSmoke.test.ts'],
    testTimeout: 300_000,
    hookTimeout: 120_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
