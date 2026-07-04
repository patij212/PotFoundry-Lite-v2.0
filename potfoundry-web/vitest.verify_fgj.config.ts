// vitest.verify_fgj.config.ts — DEV-ONLY skeptic re-check config (PF_VFGJ=1).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_verify_fgj.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
    execArgv: ['--max-old-space-size=8192'],
  },
});
