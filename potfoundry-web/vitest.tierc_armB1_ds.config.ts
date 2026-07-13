// vitest.tierc_armB1_ds.config.ts — DEV-ONLY config for the PROD-TIERC region-layer-core plan task
// A-5 suite (research/bridge/_tierc_armB1_ds.test.ts;
// docs/superpowers/plans/2026-07-12-region-layer-core.md §A-5). Mirrors vitest.tierc_armB1.config.ts's
// own convention (pool 'forks' required for NODE_OPTIONS heap propagation; generous per-test timeout
// as a safety margin over the suite's own internal per-stage timeouts/budget guards).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_armB1_ds.test.ts'],
    testTimeout: 1_800_000,
    hookTimeout: 300_000,
    pool: 'forks',
  },
});
