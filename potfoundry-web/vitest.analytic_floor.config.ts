// vitest.analytic_floor.config.ts — DEV-ONLY config for E-2026-07-09-ANALYTIC-FLOOR
// (production-twin rebuild + scoring of the SpiralRidges analytic curvature floor).
// Node env, generous heap for the multi-million-tri assembly. Only via `--config` for
// research/bridge/_analytic_floor.test.ts. Dev-only; src/ never imports research/.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_analytic_floor.test.ts'],
    testTimeout: 5_400_000,
    hookTimeout: 600_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        execArgv: ['--max-old-space-size=16384'],
      },
    },
  },
});
