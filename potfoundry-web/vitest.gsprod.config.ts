// vitest.gsprod.config.ts — DEV-ONLY config for E-2026-07-22-GEOSTAR-PROD-CLOSE
// (research/bridge/_geoStarProdClose.test.ts). Mirrors vitest.dsflankaniso.config.ts: pool 'forks' + singleFork,
// environment 'node'. Heap flag MUST be on the command line (NODE_OPTIONS=--max-old-space-size=12288) since Vitest 4
// ignores poolOptions.forks.execArgv. Each arm is a keyExists-guarded checkpointed unit ⇒ resumable across kills.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_geoStarProdClose.test.ts'],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
