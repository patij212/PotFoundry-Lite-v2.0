// vitest.col_gothicdiag.config.ts — DEV-ONLY config for E-2026-07-04-COL-SUBDIV failure classification. dev-only.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_col_gothicdiag.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true, execArgv: ['--max-old-space-size=16384'] },
  },
});
