// vitest.dshybrid.config.ts — DEV-ONLY config for E-2026-07-20-DS-HYBRID (research/bridge/_dsHybrid.test.ts).
// pool 'forks' + singleFork; heap flag MUST be on the command line (NODE_OPTIONS=--max-old-space-size=14336) since
// Vitest 4 ignores poolOptions.forks.execArgv. Each unit is env-gated, keyExists-guarded, checkpointed => a killed
// run resumes by re-running the unfinished budget.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_dsHybrid.test.ts'],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
