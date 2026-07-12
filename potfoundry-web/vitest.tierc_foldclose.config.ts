// vitest.tierc_foldclose.config.ts — DEV-ONLY config for the fold-close probe
// (research/bridge/_tierc_foldclose.test.ts). Mirrors vitest.tierc_p2_5c.config.ts: pool 'forks' +
// singleFork (NODE_OPTIONS heap flag MUST be on the command line — Vitest 4 ignores
// poolOptions.forks.execArgv in config). Generous testTimeout covers ~6 sequential wall builds
// (baseline + mid-embed + mid-escalation sweep + a cross-attribution control, ~100s each) plus the
// mid-isolevel extraction and Newton region scoring. Liveness is watched externally via
// research/exchange/tierc/foldclose_crumbs.ndjson; the probe resumes completed arms from
// foldclose_summary.json if killed mid-sweep.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_foldclose.test.ts'],
    testTimeout: 2_940_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
