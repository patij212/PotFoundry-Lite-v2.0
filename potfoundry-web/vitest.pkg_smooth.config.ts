// vitest.pkg_smooth.config.ts — DEV-ONLY config for the SMOOTH-family _best20 packaging probe (_pkg_smooth).
// Node env + generous heap for the dense reference in the true-3D ruler. Only used via `--config`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pkg_smooth.test.ts'],
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
