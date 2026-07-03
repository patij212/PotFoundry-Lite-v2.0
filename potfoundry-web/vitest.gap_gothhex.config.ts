// vitest.gap_gothhex.config.ts — DEV-ONLY config for the GothicArches/HexagonalHive tangled-CDT-under-M gap probe.
// Node env (no jsdom), generous heap for dense meshes + brute anchoring. Only via `--config` for _gap_gothhex.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_gap_gothhex.test.ts'],
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
