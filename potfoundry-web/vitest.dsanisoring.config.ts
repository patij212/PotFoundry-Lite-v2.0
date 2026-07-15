// vitest.dsanisoring.config.ts — DEV-ONLY config for E-2026-07-14-DS-ANISO-RING
// (research/bridge/_dsAnisoRing.test.ts). forks + singleFork; heap flag on the CLI
// (NODE_OPTIONS=--max-old-space-size=12288). Each unit is keyDone-guarded + checkpointed => resumable.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_dsAnisoRing.test.ts'],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
