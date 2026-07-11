// vitest.tierc_armC1.config.ts — DEV-ONLY config for the E-2026-07-11-TIERC-HEADTOHEAD Arm C1
// region-layer integration probe (research/bridge/_tierc_armC1.test.ts). Mirrors
// vitest.tierc_armA1.config.ts's convention exactly (every vitest.*.config.ts in this repo scopes
// `include` to one probe's own test file). This probe builds the Gothic K2/R-REFINE patch TWICE
// (native buildRegionOuterWall attempt + a direct K2-kernel reproduction of the CI gate) plus
// scoreAllGates scoring, so it needs the same heavy-probe shape as the sibling arm configs: pool
// 'forks' (required for NODE_OPTIONS heap propagation — Vitest 4 silently ignores
// poolOptions.forks.execArgv in a config file, so the heap flag MUST be passed on the command
// line, not here) and a generous per-test timeout (the probe's own internal 12-minute budget guard
// fires well before this ceiling; this is a safety margin, not the expected runtime — the patch
// scale is cheap, ~6min per gothic-spec.md's own reproduce-target note).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_armC1.test.ts'],
    testTimeout: 1_200_000,
    hookTimeout: 300_000,
    pool: 'forks',
  },
});
