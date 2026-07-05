// vitest.pf_wholemesh.config.ts — DEV-ONLY config for GATE-1 (PF_WHOLEMESH=1): the whole-mesh honest-brute refine
// + whole-mesh acceptance guard on GothicArches (research/bridge/_pf_perfect_gothic_wholemesh.test.ts). Node env,
// single fork, large heap for the whole-mesh brute-in-the-loop cost. Only via `--config`. ISOLATED include.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_perfect_gothic_wholemesh.test.ts'],
    testTimeout: 21_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
    execArgv: ['--max-old-space-size=12288'],
  },
});
