// vitest.srclose.config.ts — DEV-ONLY config for the SpiralRidges production-scale close (_srClose). Node env,
// generous heap for dense M-square meshes (~9-12M tris) + brute anchoring. Only via `--config` for _srClose.test.ts.
// dev-only; src/ never imports research/. vitest-4: forks.execArgv directly (poolOptions.forks is the footgun).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_srClose.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
      execArgv: ['--max-old-space-size=16384'],
    },
  },
});
