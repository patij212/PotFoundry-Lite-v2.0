// vitest.pf_direct.config.ts — DEV-ONLY config for the direct-emit structured crest-strip sliver-close probe
// (research/bridge/_pf_creststrip_direct.test.ts). Node env, single fork, long timeout for the honest whole-mesh brute.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_creststrip_direct.test.ts'],
    testTimeout: 21_600_000,
    hookTimeout: 300_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
