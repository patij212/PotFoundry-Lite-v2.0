// vitest.scalecol.config.ts — DEV-ONLY config for E-2026-07-03-SCALECOL (generalize structured-column + M-square
// recipe across the style family). Node env, generous heap for dense meshes + brute rulers. Only via `--config`
// for _scaleCol*/_qcolScale* probes. Dev-only; src/ never imports research/.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_scaleCol*.test.ts', 'research/bridge/_qcolScale*.test.ts'],
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
