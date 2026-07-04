// vitest.pf_race_ribbon.config.ts — DEV-ONLY config for the CREST-RIBBON P2-oracle frontier proxy
// (E-2026-07-04-RACE-CRESTRIBBON): one-sided PN element vs flat P1 bridge on Gothic zero-width cusps.
// Node env, generous heap, single fork. Only via `--config`. ISOLATED include set (my file only).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_race_crestribbon.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 300_000,
    pool: 'forks',
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
    execArgv: ['--max-old-space-size=8192'],
  },
});
