// vitest.tierc_p2_0.config.ts — DEV-ONLY config for the Curved-Element Phase-2 arm P2.0 probe
// (research/bridge/_tierc_p2_0.test.ts). Mirrors the sibling heavy-probe configs
// (tierc_a3_char / tierc_a3reloc): pool 'forks' + singleFork (NODE_OPTIONS heap flag MUST be on
// the command line — Vitest 4 ignores poolOptions.forks.execArgv in config), generous
// testTimeout covering BOTH gated tests in the file (S1 fast, S2's internal ~14min population
// budget + build + T-junction scan). Liveness is watched externally via
// research/exchange/tierc/p2_0_crumbs.ndjson, not by this in-process ceiling.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_p2_0.test.ts'],
    testTimeout: 1_900_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
