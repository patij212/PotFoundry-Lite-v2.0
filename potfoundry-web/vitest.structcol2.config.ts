// vitest.structcol2.config.ts — DEV-ONLY config for E-2026-07-03-STRUCTCOL2 (SFB@1 M-square sliver-kill).
// Node env (no jsdom), generous heap for dense meshes + BVH. Only via `--config` for _qcol*/_structCol2* probes.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_qcol*.test.ts', 'research/bridge/_structCol2*.test.ts'],
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
