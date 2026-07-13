// vitest.dsclose.config.ts — DEV-ONLY config for E-2026-07-13-DS-INTERIOR-CLOSE
// (research/bridge/_dsInteriorClose.test.ts). Same convention as vitest.tierc_fac3d.config.ts: pool
// 'forks' + singleFork; heap flag MUST be on the command line (NODE_OPTIONS=--max-old-space-size=12288)
// since Vitest 4 ignores poolOptions.forks.execArgv. Each arm (mesh build + witness, or + ~16-min
// composite) is a separate keyExists-guarded checkpointed unit → resumable across kills.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_dsInteriorClose.test.ts'],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
