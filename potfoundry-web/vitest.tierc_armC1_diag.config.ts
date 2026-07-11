// vitest.tierc_armC1_diag.config.ts — DEV-ONLY config for the Arm C1 RULER-DISAGREEMENT diagnosis
// probe (research/bridge/_tierc_armC1_rulerdiag.test.ts). Mirrors vitest.tierc_armC1.config.ts.
// This probe rebuilds the Gothic K2 patch once (~45s) and runs cheap surface-diff + few-facet
// arbiter measurements -- NOT the 7006-facet full harness scan the coordinator killed. Pool 'forks'
// for NODE_OPTIONS heap propagation; generous per-test timeout as a safety margin (the probe's own
// 12-min budget guard fires first).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_armC1_rulerdiag.test.ts'],
    testTimeout: 1_200_000,
    hookTimeout: 300_000,
    pool: 'forks',
  },
});
