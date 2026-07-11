// vitest.tierc_armD.config.ts — DEV-ONLY config for the PROD-TIERC Phase-1 Arm D SCORED RUN
// (research/bridge/_tierc_armD.test.ts). Mirrors vitest.tierc_bench.config.ts's heavy-probe shape
// exactly (same rationale: this probe builds a PRODUCTION-scale mesh — resU=resT=128, nRing=2048,
// featureLevel=11 — via the region layer, then scores it with the full composite gates harness; the
// mission's own cost note budgets up to 30 minutes for the build alone, on top of scoring time).
//
// testTimeout is a generous BACKSTOP only (matching vitest.tierc_bench.config.ts's own documented
// philosophy): liveness is watched externally via research/exchange/tierc/armD_crumbs.ndjson, not by
// this in-process ceiling.
//
// NODE_OPTIONS (heap) is passed on the CLI per the mission brief (--max-old-space-size=12288), not via
// forks.execArgv here — this repo's vitest 4 install ignores config-level poolOptions heap
// (vitest.voronoi_inthash.config.ts's own comment / vitest.tierc_bench.config.ts's own precedent
// confirm this) — `forks.execArgv` is therefore omitted deliberately, not an oversight.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_armD.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
