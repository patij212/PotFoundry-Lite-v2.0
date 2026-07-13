// vitest.tierc_armC1_gothic.config.ts — DEV-ONLY config for PROD-TIERC region-layer-core plan task
// A-6 (research/bridge/_tierc_armC1_gothic.test.ts). Mirrors vitest.tierc_armC1.config.ts's own
// convention exactly (every vitest.*.config.ts in this repo scopes `include` to one probe's own test
// file). This probe builds the Gothic K2/R-REFINE patch TWICE (native buildRegionOuterWall attempt +
// a direct K2-kernel reproduction of the CI gate) plus a FAST-bounded scoreAllGates scoring pass, so
// it needs the same heavy-probe shape as the sibling arm configs: pool 'forks' (required for
// NODE_OPTIONS heap propagation — Vitest 4 silently ignores poolOptions.forks.execArgv in a config
// file, so the heap flag MUST be passed on the command line, not here) and a generous per-test
// timeout (safety margin only — the FAST g1Brute/stride overrides this probe's own test file adds
// keep the expected runtime to low minutes, well under this ceiling).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_armC1_gothic.test.ts'],
    testTimeout: 900_000,
    hookTimeout: 300_000,
    pool: 'forks',
  },
});
