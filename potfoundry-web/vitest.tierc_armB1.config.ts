// vitest.tierc_armB1.config.ts — DEV-ONLY config for the E-2026-07-11-TIERC-HEADTOHEAD Arm B1
// probe (research/bridge/_tierc_armB1.test.ts). Mirrors vitest.tierc_armC1.config.ts's convention
// (pool 'forks' required for NODE_OPTIONS heap propagation; generous per-test timeout as a safety
// margin over the probe's own internal per-stage timeouts/budget guards).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_armB1.test.ts'],
    testTimeout: 1_800_000,
    hookTimeout: 300_000,
    pool: 'forks',
  },
});
