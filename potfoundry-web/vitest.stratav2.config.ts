// DEV-ONLY config for the FORKED Strata conforming-bisection driver (V2).
// The fork exists so the V2 levers cannot perturb any committed _strataConformBisect baseline.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_strataConformBisectV2.test.ts'],
    testTimeout: 7_200_000,
    hookTimeout: 7_200_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
