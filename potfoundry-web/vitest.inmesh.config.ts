// vitest.inmesh.config.ts — DEV-ONLY config for research/bridge/inhouseMetricMesh.test.ts.
// The oracle rung is gated behind PF_INMESH=1; the angle-bar pass-through test is always-on and runs
// in seconds, so this config is safe to run without the env flag.
//   npx vitest run --config vitest.inmesh.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/inhouseMetricMesh.test.ts'],
    testTimeout: 1_800_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
