// vitest.tierc_p2_5b.config.ts — DEV-ONLY config for the Curved-Element Phase-2 arm P2.5b probe
// (research/bridge/_tierc_p2_5b.test.ts). Mirrors vitest.tierc_p2_4.config.ts (this lineage's own
// precedent): pool 'forks' + singleFork (NODE_OPTIONS heap flag MUST be on the command line —
// Vitest 4 ignores poolOptions.forks.execArgv in config), generous testTimeout covering the file's
// internal budget (direct baseline build ~85s + ≤3 escalated rebuilds ~90-120s each + full 1,891
// hot-point Newton scoring ~130s/round + residual characterization). Liveness is watched externally
// via research/exchange/tierc/p2_5b_crumbs.ndjson, not by this in-process ceiling.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_p2_5b.test.ts'],
    testTimeout: 2_400_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
