// vitest.structcol.config.ts — DEV-ONLY config for E-2026-07-02-STRUCTCOL ridge-graph builder probes.
// Node env (no jsdom), generous heap for dense meshes + BVH. Only via `--config` for _structCol* probes.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_structCol*.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        execArgv: ['--max-old-space-size=16384'],
      },
    },
  },
});
