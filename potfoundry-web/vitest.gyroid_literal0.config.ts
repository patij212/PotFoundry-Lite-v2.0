// vitest.gyroid_literal0.config.ts — DEV-ONLY config for E-2026-07-08-GYROID-LITERAL0 (round 4).
// Node env, generous heap, single fork. Only via `--config` for the _gyroid_literal0 probe. ISOLATED.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_gyroid_literal0.test.ts'],
    testTimeout: 3_600_000 * 5,
    hookTimeout: 600_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        execArgv: ['--max-old-space-size=8192'],
      },
    },
  },
});
