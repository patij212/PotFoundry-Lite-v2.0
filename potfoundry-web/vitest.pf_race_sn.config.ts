// vitest.pf_race_sn.config.ts — DEV-ONLY config for the SURFACE-NATIVE single-cusp race proxy
// (research/bridge/_pf_race_surfnative*.test.ts). Node env, single fork, generous heap for the brute nearest ruler.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_race_surfnative_probe.test.ts', 'research/bridge/_pf_race_surfnative.test.ts', 'research/bridge/_pf_race_sn_time.test.ts', 'research/bridge/_pf_race_sn_diag.test.ts', 'research/bridge/_pf_race_sn_verify.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 300_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
