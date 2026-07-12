// vitest.tierc_p2_5c.config.ts — DEV-ONLY config for the Curved-Element Phase-2 arm P2.5c probe
// (research/bridge/_tierc_p2_5c.test.ts). Mirrors vitest.tierc_p2_5b.config.ts: pool 'forks' +
// singleFork (NODE_OPTIONS heap flag MUST be on the command line — Vitest 4 ignores
// poolOptions.forks.execArgv in config). Generous testTimeout covers ~7 sequential wall builds
// (baseline + augment-control + a level 12..16 escalation sweep, ~100s each) plus Newton scoring.
// Liveness is watched externally via research/exchange/tierc/p2_5c_crumbs.ndjson; the probe resumes
// completed arms from p2_5c_summary.json if killed mid-sweep.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_p2_5c.test.ts'],
    testTimeout: 2_700_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
