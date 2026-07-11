// vitest.tierc_winding_diag.config.ts — DEV-ONLY config for the WINDING-ROOT diagnosis probe
// (research/bridge/_tierc_winding_diag.test.ts). Small toy rebuild (seconds), but mirrors the
// sibling tierc configs' pool:'forks' + generous timeout convention for consistency.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_winding_diag.test.ts'],
    testTimeout: 300_000,
    hookTimeout: 120_000,
    pool: 'forks',
  },
});
