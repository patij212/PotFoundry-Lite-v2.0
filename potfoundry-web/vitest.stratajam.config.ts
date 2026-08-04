// DEV-ONLY config for the Strata jam census (population-scale action-frontier audit).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_strataJamCensus.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 3_600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
