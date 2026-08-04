// DEV-ONLY config for the Strata S24 corridor-ownership shadow audit.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'research/bridge/_strataCorridorOwnership.test.ts',
      'research/bridge/_strataCorridorLedger.test.ts',
    ],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
