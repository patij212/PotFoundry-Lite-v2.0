// vitest.tierc_p2_4.config.ts — DEV-ONLY config for the Curved-Element Phase-2 arm P2.4 probe
// (research/bridge/_tierc_p2_4.test.ts). Mirrors vitest.tierc_p2_3.config.ts (this lineage's own
// precedent): pool 'forks' + singleFork (NODE_OPTIONS heap flag MUST be on the command line —
// Vitest 4 ignores poolOptions.forks.execArgv in config), generous testTimeout covering the
// file's internal budget (twin build ~85-90s + Stage B field builds ~35s + Stage C buffered-gate
// scope sweep over 2.24M facets ~95s + Stage D's hard-capped 8min dense sweep + Stage E/F cheap
// hot-set-only checks). Liveness is watched externally via
// research/exchange/tierc/p2_4_crumbs.ndjson, not by this in-process ceiling.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_p2_4.test.ts'],
    testTimeout: 1_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
