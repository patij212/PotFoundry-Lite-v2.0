// vitest.tierc_a2_gatesrunner.config.ts — DEV-ONLY config for the PROD-TIERC region-layer-core plan
// task A-2 TDD suite (research/bridge/_tierc_a2_gatesrunner.test.ts;
// docs/superpowers/plans/2026-07-12-region-layer-core.md §A-2). Mirrors vitest.tierc_a1_dschain.config.ts's
// own convention (pool:'forks', generous timeout) since the env-gated suite drives FOUR real
// production-scale buildRegionOuterWall builds (FourierBloom/GyroidManifold/DragonScales/GothicArches
// at TIERC_COMMON_DIMS) end to end — see champion-spec-gyroid.md §... "build wall time ~92.5s assembly"
// for the single heaviest arm.
//
// NOTE: deliberately named `vitest.tierc_a2_gatesrunner.config.ts` — NOT a lowercase variant of the
// existing `vitest.tierc_regionLayer.config.ts` (which vitest.tierc_a1_dschain.config.ts's own header
// already flagged as a silent-collision trap on this case-insensitive filesystem). Task-numbered
// naming matches vitest.tierc_a1_dschain.config.ts's own precedent exactly.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_a2_gatesrunner.test.ts'],
    testTimeout: 2_400_000,
    hookTimeout: 120_000,
    pool: 'forks',
  },
});
