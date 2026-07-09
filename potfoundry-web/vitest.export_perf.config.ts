// vitest.export_perf.config.ts — DEV-ONLY config for E-2026-07-09-EXPORT-PERF (production
// validation-stage cost measurement on captured artifacts). Only via `--config` for
// research/bridge/_export_perf.test.ts. Dev-only; src/ never imports research/.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_export_perf.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        execArgv: ['--max-old-space-size=16384'],
      },
    },
  },
});
