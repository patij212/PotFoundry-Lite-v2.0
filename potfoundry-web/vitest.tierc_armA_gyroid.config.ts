// vitest.tierc_armA_gyroid.config.ts — DEV-ONLY config for the PROD-TIERC region-layer-core plan
// task A-4 (research/bridge/_tierc_armA_gyroid.test.ts; docs/superpowers/plans/2026-07-12-region-layer-core.md
// §A-4). Mirrors vitest.tierc_armD_control.config.ts's own convention (pool:'forks', generous
// backstop timeout) since the env-gated suite drives TWO real production-scale builds
// (buildRegionOuterWall + the direct buildGbeTwin champion twin) plus stratified-Newton/coverage
// scoring and an A-2 gates-harness runner pass — see champion-spec-gyroid.md's own "build wall time
// ~92.5s assembly + 4.8s audit" for the single heaviest stage.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_armA_gyroid.test.ts'],
    testTimeout: 2_700_000,
    hookTimeout: 120_000,
    pool: 'forks',
  },
});
