// vitest.lsc.config.ts — DEV-ONLY config for the lever-stack close probe
// (research/bridge/_leverStackClose.test.ts). Node env, single fork, generous timeout.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_leverStackClose.test.ts'],
    testTimeout: 7_200_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
