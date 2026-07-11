// vitest.tierc_gates.config.ts — DEV-ONLY config for the PROD-TIERC Phase-1 composite gates harness
// (research/bridge/tierc_gatesHarness.test.ts; E-2026-07-11-TIERC-HEADTOHEAD-prereg.md build items 1-2).
// Node env. The suite is synthetic + small by design (no production bins loaded), so this needs no
// special heap and only a modest per-test timeout ceiling — unlike the multi-hour heavy-probe configs
// (vitest.prod_truth.config.ts, vitest.rebaseline20.config.ts, ...) this sits alongside.
//
// No shared "all research/bridge tests" config exists in this repo (verified: every vitest.*.config.ts
// scopes `include` to one probe's own test file(s)) — this file follows that exact convention.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/tierc_gatesHarness.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
  },
});
