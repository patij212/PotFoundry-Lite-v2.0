// vitest.ct_hexhive.config.ts — DEV-ONLY config for the HexagonalHive chordTolMm-extension gap probe.
// Node env (no jsdom), generous heap for dense meshes + brute anchoring. Only via `--config` for _ct_hexhive.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_ct_hexhive.test.ts'],
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
