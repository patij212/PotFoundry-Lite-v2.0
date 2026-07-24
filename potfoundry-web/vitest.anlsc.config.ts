// vitest.anlsc.config.ts — DEV-ONLY config for the analytic-scoring close probe
// (research/bridge/_analyticScoreClose.test.ts). Node env, single fork, generous timeout.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_analyticScoreClose.test.ts'],
    testTimeout: 7_200_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
