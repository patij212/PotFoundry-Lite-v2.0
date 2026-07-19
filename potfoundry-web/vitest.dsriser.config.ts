// vitest.dsriser.config.ts — DEV-ONLY config for E-2026-07-19-DS-RISER-CLOSE
// (research/bridge/_dsRiserClose.test.ts). Same convention as vitest.dsclose.config.ts: pool 'forks'
// + singleFork; heap flag MUST be on the command line (NODE_OPTIONS=--max-old-space-size=12288) since
// Vitest 4 ignores poolOptions.forks.execArgv. Each arm (mesh build + certified composite score) is a
// separate keyExists-guarded checkpointed unit → resumable across kills.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_dsRiserClose.test.ts'],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
