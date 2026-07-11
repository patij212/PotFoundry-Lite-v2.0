// vitest.tierc_a2_accept.config.ts — DEV-ONLY config for the E-2026-07-11-TIERC-HEADTOHEAD
// Arm A2 twin-scale acceptance run (research/bridge/_tierc_a2_accept.test.ts).
// Mirrors vitest.tierc_gates.config.ts's convention exactly (every vitest.*.config.ts
// in this repo scopes `include` to one probe's own test file). This probe builds the
// full Delta2-exact production twin TWICE (an off-policy verification build + the
// policy-under-test build) plus full prescreen/stratified/coverage scoring, so it needs
// the SAME heavy-probe shape as vitest.prod_truth.config.ts / the parent arm's own
// config family: pool 'forks' (required for NODE_OPTIONS heap propagation — Vitest 4
// silently ignores poolOptions.forks.execArgv in a config file, so the heap flag MUST
// be passed on the command line, not here) and a generous per-test timeout.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_a2_accept.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
  },
});
