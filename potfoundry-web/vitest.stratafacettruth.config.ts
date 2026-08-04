// DEV-ONLY config for the INDEPENDENT facet-truth auditor (shares no machinery with the mesher).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_strataFacetTruth.test.ts'],
    testTimeout: 7_200_000,
    hookTimeout: 7_200_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
