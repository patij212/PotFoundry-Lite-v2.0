// vitest.lowpoly.config.ts — DEV-ONLY config for E-2026-07-22-LOWPOLY-GRID-CLOSE (_lowPolyGridClose). Node env +
// generous heap for the dense structured grids + brute cross-check. Only used via `--config` for _lowPolyGridClose.
// dev-only; src/ never imports research/.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Pin root to this file's dir (potfoundry-web) so `include` resolves even when launched from the repo root
  // (repo-root launch is required so node resolves the root vitest 1.6.1 worker, not potfoundry-web's 4.0.17).
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_lowPolyGridClose.test.ts'],
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
