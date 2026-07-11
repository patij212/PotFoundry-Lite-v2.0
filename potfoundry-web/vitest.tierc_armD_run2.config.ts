// vitest.tierc_armD_run2.config.ts — DEV-ONLY config for the Arm D SCORED RUN 2
// (research/bridge/_tierc_armD_run2.test.ts; coordinator-directed re-run under Prereg Addendum 2
// after the run-1 evaluator-bug fix). Mirrors vitest.tierc_armD.config.ts exactly (same heavy-probe
// shape; run 2 additionally builds a direct twin for the same-provenance hash-identity primary, so
// the ceiling stays generous). Heap via CLI NODE_OPTIONS, not forks.execArgv (vitest 4 ignores
// config-level heap — vitest.tierc_bench.config.ts precedent).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_armD_run2.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
