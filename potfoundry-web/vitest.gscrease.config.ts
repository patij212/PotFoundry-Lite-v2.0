// vitest.gscrease.config.ts — DEV-ONLY config for E-2026-07-19-GEOSTAR-CREASE-CDT-BYCONSTRUCTION
// (research/bridge/_geoStarCreaseConform.test.ts). pool 'forks' + singleFork to dodge the Vitest 4
// worker-fork crash; heap flag MUST be on the command line (NODE_OPTIONS=--max-old-space-size=...) since
// Vitest 4 ignores poolOptions.forks.execArgv. Each ARM is a separate env-gated checkpointed unit.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_geoStarCreaseConform.test.ts'],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
