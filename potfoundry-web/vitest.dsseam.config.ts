// vitest.dsseam.config.ts — DEV-ONLY config for E-2026-07-21-DS-SEAM (research/bridge/_dsSeam.test.ts).
// pool 'forks' + singleFork. Env-gated + checkpointed => a killed run resumes.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_dsSeam.test.ts'],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
