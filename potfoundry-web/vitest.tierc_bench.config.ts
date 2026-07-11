// vitest.tierc_bench.config.ts — DEV-ONLY config for the PROD-TIERC Phase-1 gates-harness BENCHMARK arm
// (research/bridge/tierc_gatesBench.test.ts). Mirrors vitest.tierc_gates.config.ts's shape (Node env, one
// isolated `include`, single forks pool) but this probe drives `scoreAllGates` against REAL captured
// production bins (research/exchange/_prod_truth/<style>/, up to ~3.1M full / ~1.4M outer tris) instead
// of the synthetic fixtures tierc_gatesHarness.test.ts uses — so it needs the heavy-probe timeout/heap
// shape (vitest.prod_truth.config.ts / vitest.close_theta.config.ts precedent), not the 60s synthetic one.
//
// testTimeout is a generous BACKSTOP only: the actual GothicArches kill/report decision (mission's ~40min
// G1-stage time-gate) is made EXTERNALLY by watching research/exchange/tierc/bench_crumbs.ndjson and
// killing the process by PID, per CROSS-WORKSTREAM-NOTES.md's "kill by PID/cmdline match" convention —
// this in-process ceiling should never actually fire.
//
// NODE_OPTIONS (heap) is passed on the CLI per the mission brief, not via forks.execArgv here: this repo's
// vitest 4 install ignores config-level poolOptions heap (vitest.voronoi_inthash.config.ts's own comment
// confirms this precedent) — `forks.execArgv` below is therefore omitted deliberately, not an oversight.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/tierc_gatesBench.test.ts'],
    testTimeout: 21_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
