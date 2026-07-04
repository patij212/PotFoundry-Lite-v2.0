// vitest.pf_sfbseam2.config.ts — DEV-ONLY config for E-2026-07-04-SFB-SEAM builder+scorer. dev-only.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_sfbseam2.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true, execArgv: ['--max-old-space-size=16384'] },
  },
});
