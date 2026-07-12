// vitest.tierc_analytic_ship.config.ts — DEV-ONLY config for the T3.4 ship gate
// (research/bridge/_tierc_analytic_ship.test.ts): the C2 analytic-surface lever wired into
// production behind the __pfTierCAnalyticSurface sub-flag, validated via the PRODUCTION
// src/geometry/analyticRadius.ts#buildAnalyticRadiusFn (not the research getManifest). Mirrors
// vitest.tierc_c2full.config.ts. Pool 'forks' so NODE_OPTIONS heap propagates to the child. The
// fast PART A byte-identity + faithfulness checks run with no env var; the heavy analytic-build
// PART B parts are env-gated (PF_ANALYTIC_SHIP_A / _B / _GEOSTAR). testTimeout sized to Gothic
// PART B's worst case (~5-6min analytic build); the test's own budget guards fire first.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_analytic_ship.test.ts'],
    testTimeout: 1_800_000,
    hookTimeout: 300_000,
    pool: 'forks',
  },
});
