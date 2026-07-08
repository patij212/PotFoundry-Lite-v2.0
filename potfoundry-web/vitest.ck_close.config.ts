// vitest.ck_close.config.ts — DEV-ONLY config for E-2026-07-08-CK-CLOSE (CelticKnot weave/braid cliff close).
// Node env (no jsdom), generous heap for dense doubled-picket meshes + Newton verdict. Only via `--config` for
// research/bridge/_ck_close*.test.ts. Dev-only; src/ never imports research/.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_ck_close*.test.ts'],
    testTimeout: 5_400_000,
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
