// vitest.col_byteid.config.ts — DEV-ONLY config for E-2026-07-04-COL-SUBDIV byte-identical-off proof. dev-only.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_col_byteid.test.ts'],
    testTimeout: 600_000,
    hookTimeout: 120_000,
    pool: 'forks',
    forks: { singleFork: true, execArgv: ['--max-old-space-size=8192'] },
  },
});
