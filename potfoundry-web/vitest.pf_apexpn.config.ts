// vitest.pf_apexpn.config.ts — DEV-ONLY config for the Gothic apex-PN sliver lever 13a probe
// (research/bridge/_pf_apex_pn.test.ts). Node env, single fork, long timeout for the honest whole-mesh brute guard.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_apex_pn.test.ts'],
    testTimeout: 21_600_000,
    hookTimeout: 300_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
