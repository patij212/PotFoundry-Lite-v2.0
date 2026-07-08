// vitest.tangled_density.config.ts — DEV-ONLY config for E-2026-07-08-TANGLED-DENSITY-CLOSE (§V11r).
// Density sweep of the 4 DENSITY-FLOOR tangled styles with the Newton true-3D verdict per level.
// Node env, generous heap, single fork. Only via `--config` for _pf_tangledDensity. ISOLATED.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_tangledDensity.test.ts'],
    testTimeout: 6 * 60 * 60 * 1000,
    hookTimeout: 600_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        execArgv: ['--max-old-space-size=8192'],
      },
    },
  },
});
