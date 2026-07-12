// vitest.tierc_a1_dschain.config.ts — DEV-ONLY config for the PROD-TIERC region-layer-core plan
// task A-1 TDD suite (research/bridge/_tierc_a1_dschain.test.ts;
// docs/superpowers/plans/2026-07-12-region-layer-core.md §4 A-1). Mirrors
// vitest.tierc_ds_topofix.config.ts's own convention (pool:'forks', generous timeout) since
// assertion 3 drives one real DS-scale native-chain build (~5-8s per DS-topofix-verdict.md's own
// measured timing, PF_TIERC_A1_DSCHAIN=1-gated) alongside the two always-on pure-data assertions.
//
// NOTE: deliberately named distinctly from `vitest.tierc_regionLayer.config.ts` (NOT
// `vitest.tierc_regionlayer.config.ts`) — this filesystem is case-insensitive (verified), so a
// lowercase-only variant of that existing camelCase filename would silently collide with it.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_a1_dschain.test.ts'],
    testTimeout: 600_000,
    hookTimeout: 120_000,
    pool: 'forks',
  },
});
