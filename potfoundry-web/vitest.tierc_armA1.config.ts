// vitest.tierc_armA1.config.ts — DEV-ONLY config for the E-2026-07-11-TIERC-HEADTOHEAD Arm A1
// region-layer integration probe (research/bridge/_tierc_armA1.test.ts). Mirrors
// vitest.tierc_a2_accept.config.ts's convention exactly (every vitest.*.config.ts in this repo
// scopes `include` to one probe's own test file). This probe builds the full Delta2-exact
// production twin THREE times (native buildRegionOuterWall attempt + 'off'-policy fallback
// verification + 'fanRepair'-policy fallback) plus full prescreen/stratified/scoreAllGates
// scoring, so it needs the SAME heavy-probe shape as the A2/prod_truth config family: pool
// 'forks' (required for NODE_OPTIONS heap propagation — Vitest 4 silently ignores
// poolOptions.forks.execArgv in a config file, so the heap flag MUST be passed on the command
// line, not here) and a generous per-test timeout.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_armA1.test.ts'],
    testTimeout: 2_400_000,
    hookTimeout: 600_000,
    pool: 'forks',
  },
});
