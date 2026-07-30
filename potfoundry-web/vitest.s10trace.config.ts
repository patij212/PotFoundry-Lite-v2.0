// vitest.s10trace.config.ts — DEV-ONLY config for the S10 locus-tracer negative control and seed probes.
// Same shape as vitest.strata.config.ts (pool 'forks' + singleFork, environment 'node').
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'research/bridge/_strataLocusTrace*.test.ts',
      'research/bridge/_strataAlignedSeed*.test.ts',
    ],
    testTimeout: 3_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
