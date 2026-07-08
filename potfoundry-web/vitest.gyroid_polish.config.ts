// vitest.gyroid_polish.config.ts — DEV-ONLY config for E-2026-07-08-GYROID-POLISH (round 3).
// Node env, generous heap, single fork. Only via `--config` for the _gyroid_polish probe. ISOLATED.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_gyroid_polish.test.ts'],
    testTimeout: 3_600_000,
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
