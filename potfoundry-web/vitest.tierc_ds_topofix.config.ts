// vitest.tierc_ds_topofix.config.ts — DEV-ONLY config for the DS-topology-fix GATE probe
// (research/bridge/_tierc_ds_topofix.test.ts). Single native chain build (~5s, per
// B1-dragonscales-verdict.md's own timing) + cheap topology audits — mirrors the sibling tierc
// configs' pool:'forks' + generous timeout convention for consistency.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_ds_topofix.test.ts'],
    testTimeout: 600_000,
    hookTimeout: 120_000,
    pool: 'forks',
  },
});
