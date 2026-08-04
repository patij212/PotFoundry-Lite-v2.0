// vitest.microsweep.config.ts — DEV-ONLY config for the 20-style crease-crossing contingency sweep.
// Mirrors vitest.micro.config.ts. Heap flag MUST be on the command line.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_strataMicroSweep.test.ts'],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
