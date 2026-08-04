// vitest.hexhive.config.ts — DEV-ONLY config for E-2026-07-22-HEXHIVE-LAYERED-CERT (_hexHiveLayeredCert). Node env
// (no jsdom) + generous per-worker heap for the dense true-3D reference + up to ~2M-tri structured meshes. Used only
// via `--config` for the _hexHiveLayeredCert probe. Research-only; src never imports research.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_hexHiveLayeredCert.test.ts'],
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
