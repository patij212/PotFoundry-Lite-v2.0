// vitest.pf_race_fgjunction.config.ts — DEV-ONLY config for the FRONTIER PROXY probe (PF_FGJ=1):
// feature-graph + junction resolution vs flat-UV bridging on a single Gothic arch-apex patch.
// Node env, single fork, generous heap. Only via `--config`. ISOLATED include (my file only).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_race_fgjunction.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
    execArgv: ['--max-old-space-size=8192'],
  },
});
