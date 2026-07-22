// vitest.dssliver.config.ts — DEV-ONLY config for E-2026-07-22-DS-SLIVER
// (research/bridge/_dsSliver.test.ts). pool 'forks' + singleFork; heap flag on the command line
// (NODE_OPTIONS=--max-old-space-size=14336). Env-gated + checkpointed => a killed run resumes.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_dsSliver.test.ts'],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
