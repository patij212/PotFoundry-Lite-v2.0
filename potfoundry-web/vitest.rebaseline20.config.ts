// vitest.rebaseline20.config.ts — DEV-ONLY config for the definitive 20-style whole-mesh re-baseline probe
// (research/bridge/_pf_rebaseline20.test.ts). Node env, single fork, generous heap for the multi-M-tri bin meshes.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_rebaseline20.test.ts'],
    testTimeout: 18_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
