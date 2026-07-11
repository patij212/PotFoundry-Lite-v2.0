// vitest.tierc_ds_f3.config.ts — DEV-ONLY config for the DS Finding-3 diagnosis probe
// (research/bridge/_tierc_ds_f3.test.ts). Mirrors vitest.tierc_ds_topofix.config.ts's
// pool:'forks' + generous timeout convention.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_ds_f3.test.ts'],
    testTimeout: 600_000,
    hookTimeout: 120_000,
    pool: 'forks',
  },
});
