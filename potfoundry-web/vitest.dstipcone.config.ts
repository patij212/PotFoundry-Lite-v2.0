// vitest.dstipcone.config.ts — DEV-ONLY config for E-2026-07-23-DS-TIPCONE-RULER
// (research/bridge/_dsTipCone.test.ts). pool 'forks' + singleFork; bump heap on the command line
// (NODE_OPTIONS=--max-old-space-size=14336). Each unit env-gated + checkpointed => a killed run resumes.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_dsTipCone.test.ts'],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
