// vitest.dsconefanprod.config.ts — DEV-ONLY config for E-2026-07-21-DS-CONEFAN-PROD
// (research/bridge/_dsConeFanProd.test.ts). pool 'forks' + singleFork; heap flag on the command line
// (NODE_OPTIONS=--max-old-space-size=14336). Each unit env-gated + checkpointed => a killed run resumes.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_dsConeFanProd.test.ts'],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
