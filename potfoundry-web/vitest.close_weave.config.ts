// vitest.close_weave.config.ts — DEV-ONLY config for E-2026-07-03-CLOSE-WEAVE (weave/braid axis close-out).
// Node env (no jsdom), generous heap for dense doubled-grid meshes + brute anchor. Only via `--config` for
// research/bridge/_close_weave*.test.ts.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_close_weave*.test.ts'],
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
