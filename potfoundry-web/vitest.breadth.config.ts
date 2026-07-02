// vitest.breadth.config.ts — DEV-ONLY config for TEAM B BREADTH probes. Node environment (no jsdom overhead) +
// generous per-worker heap so the dense reference BVH fits. Only used via `--config` for the _breadth* probes.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_breadth*.test.ts'],
    testTimeout: 1_800_000,
    hookTimeout: 300_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        execArgv: ['--max-old-space-size=12288'],
      },
    },
  },
});
