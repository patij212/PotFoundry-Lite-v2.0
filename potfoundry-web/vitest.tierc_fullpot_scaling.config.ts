// vitest.tierc_fullpot_scaling.config.ts — DEV-ONLY config for the full-pot tractability probe
// (research/bridge/_tierc_fullpot_scaling.test.ts). Pool 'forks' for NODE_OPTIONS heap propagation.
// Each domain is a separate env-gated it(); run one per process (serialize for clean uncontended
// timing). testTimeout sized above the largest domain's internal wall-clock budget guard.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_fullpot_scaling.test.ts'],
    testTimeout: 1_800_000,
    hookTimeout: 300_000,
    pool: 'forks',
  },
});
