// vitest.sblind.config.ts — DEV-ONLY config for the styleSampler-blindness probe
// (research/bridge/_samplerBlindness.test.ts). Node env, single fork, generous timeout.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_samplerBlindness.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
