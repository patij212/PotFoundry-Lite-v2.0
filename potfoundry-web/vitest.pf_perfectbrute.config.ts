// vitest.pf_perfectbrute.config.ts — DEV-ONLY config for the CRUX experiment (PF_PERFECTBRUTE=1):
// the perfect-mesher end-to-end kernel with the refine-loop TERMINATION driven by the HONEST full-azimuth
// brute interior deviation (NOT GN). Node env, single fork, large heap for the 0.3-0.8M-tri patch + the
// brute-in-the-loop cost. Only via `--config`. ISOLATED include (my file only).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_perfect_gothic_brute.test.ts'],
    testTimeout: 21_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
    execArgv: ['--max-old-space-size=12288'],
  },
});
