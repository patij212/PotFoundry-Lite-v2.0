// vitest.geostar.config.ts — DEV-ONLY config for E-2026-07-14-GEOSTAR-CLOSE
// (research/bridge/_geoStarClose.test.ts). Mirrors vitest.dsclose.config.ts: pool 'forks' + singleFork;
// heap flag on the command line (NODE_OPTIONS=--max-old-space-size=12288) since Vitest 4 ignores
// poolOptions.forks.execArgv. Each arm is a keyExists-guarded checkpointed unit → resumable across kills.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_geoStarClose.test.ts'],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
