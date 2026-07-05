// vitest.pf_tierab.config.ts — DEV-ONLY config for E-2026-07-05-PERFECT-MESHER-TIERAB-SLIVERS
// (PF_TIERAB=1 byte-identity; PF_SLIVERM=1 M=g/h2 sliver pass). Node env, single fork, large heap.
// Only via `--config`. ISOLATED include (my file only).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_tierab_slivers.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
    execArgv: ['--max-old-space-size=12288'],
  },
});
