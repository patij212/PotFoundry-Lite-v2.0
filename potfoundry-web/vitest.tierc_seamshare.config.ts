// vitest.tierc_seamshare.config.ts — DEV-ONLY config for the PROD-TIERC wire-and-validate T3.1 probe
// (research/bridge/_tierc_seamshare_probe.test.ts). Mirrors vitest.tierc_p2_5b.config.ts: pool
// 'forks' + singleFork (NODE_OPTIONS heap flag MUST be on the command line — Vitest 4 ignores
// poolOptions.forks.execArgv in config), generous testTimeout covering the file's internal budget
// (protected-complex extraction + a tractable single-pass Tier-C outer-wall seed build + the
// production-density inner wall build). Liveness is watched externally via
// research/exchange/tierc/seamshare_crumbs.ndjson, not by this in-process ceiling.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_seamshare_probe.test.ts'],
    testTimeout: 2_400_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
