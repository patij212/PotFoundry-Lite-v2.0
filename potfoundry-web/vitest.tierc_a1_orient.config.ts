// vitest.tierc_a1_orient.config.ts — DEV-ONLY config for the Arm A1 orient/boundary isolation
// follow-up (research/bridge/_tierc_a1_orient.test.ts). Mirrors vitest.tierc_a1_orient's sibling
// heavy-probe configs (a2_accept / armA1): pool 'forks' (NODE_OPTIONS heap flag MUST be on the
// command line — Vitest 4 ignores poolOptions.forks.execArgv in config) + a generous per-test
// timeout. Builds two full Delta2-exact twins (off + fanRepair) plus loads one captured artifact
// and runs topologyMetric at two weld tolerances on each.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_a1_orient.test.ts'],
    testTimeout: 1_200_000,
    hookTimeout: 600_000,
    pool: 'forks',
  },
});
