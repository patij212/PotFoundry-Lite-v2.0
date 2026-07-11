// vitest.tierc_armD_qualdiag.config.ts — DEV-ONLY config for the Arm D quality-miss DIAGNOSIS probe
// (research/bridge/_tierc_armD_qualdiag.test.ts; coordinator follow-up to the Arm D FAIL verdict).
// Mirrors vitest.tierc_armD.config.ts's heavy-probe shape (same rationale: one production-scale twin
// rebuild ~25s + two 3.14M-triangle angle scans + a 3.14M-entry centroid correspondence). Heap via
// CLI NODE_OPTIONS, not forks.execArgv (vitest 4 ignores config-level heap — established precedent,
// see vitest.tierc_bench.config.ts's header).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_armD_qualdiag.test.ts'],
    testTimeout: 900_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
