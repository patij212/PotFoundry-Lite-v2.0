// vitest.tierc_p2_3.config.ts — DEV-ONLY config for the Curved-Element Phase-2 arm P2.3 probe
// (research/bridge/_tierc_p2_3.test.ts). Mirrors vitest.tierc_p2_0.config.ts (the P2.0/P2.1/P2.2
// lineage's own precedent): pool 'forks' + singleFork (NODE_OPTIONS heap flag MUST be on the
// command line — Vitest 4 ignores poolOptions.forks.execArgv in config), generous testTimeout
// covering the file's internal budget (twin build ~80-90s + Stage C buffered-gate scope sweep
// over 2.24M facets + Stage D's hard-capped 13min dense sweep + Stage E/F cheap hot-set-only
// checks). Liveness is watched externally via research/exchange/tierc/p2_3_crumbs.ndjson, not
// by this in-process ceiling.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_p2_3.test.ts'],
    testTimeout: 1_700_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
