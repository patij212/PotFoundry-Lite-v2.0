// vitest.col_gothicseg.config.ts — DEV-ONLY config for E-2026-07-04-COL-SUBDIV Phase-1 close. dev-only.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_col_gothicseg.test.ts'],
    testTimeout: 5_400_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true, execArgv: ['--max-old-space-size=16384'] },
  },
});
