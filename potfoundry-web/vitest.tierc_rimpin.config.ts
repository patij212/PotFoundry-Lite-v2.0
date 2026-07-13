// vitest.tierc_rimpin.config.ts — DEV-ONLY config for the PROD-TIERC T3.3 path-(b) rim-pin probe
// (research/bridge/_tierc_rimpin_probe.test.ts). Mirrors vitest.tierc_seamshare.config.ts: pool
// 'forks' + singleFork (the NODE_OPTIONS heap flag MUST be on the command line — Vitest 4 ignores
// poolOptions.forks.execArgv in config), generous testTimeout for the protected-complex extraction +
// bounded-pass Tier-C outer-wall builds.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_rimpin_probe.test.ts'],
    testTimeout: 2_400_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
