// vitest.tierc_armD_control.config.ts — DEV-ONLY config for the PROD-TIERC region-layer-core plan
// task A-3 (research/bridge/_tierc_armD_control.test.ts). Mirrors vitest.tierc_a2_gatesrunner.config.ts's
// convention (pool:'forks', generous backstop timeout) since the env-gated suite drives a real
// production-scale buildRegionOuterWall build + a direct assembleWatertight twin build + full-density
// scoreAllGates scoring end to end.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_armD_control.test.ts'],
    testTimeout: 2_700_000,
    hookTimeout: 120_000,
    pool: 'forks',
  },
});
