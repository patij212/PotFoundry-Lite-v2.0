// vitest.pkg_theta.config.ts — DEV-ONLY config for the THETA-family packaging probe
// (research/bridge/_pkg_theta.test.ts). Node env, single fork, generous heap for dense structured sheets + CDT.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pkg_theta.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 300_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
