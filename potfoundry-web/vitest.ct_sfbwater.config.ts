// vitest.ct_sfbwater.config.ts — DEV-ONLY config for E-2026-07-03-SFB-WATER (SuperformulaBlossom seam-cliff
// ladder watertightness fix). Node env, generous heap for dense structured meshes + brute anchoring.
// Only via `--config` for the _ct_sfbwater probe. dev-only; src/ never imports research/.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_ct_sfbwater.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
      execArgv: ['--max-old-space-size=16384'],
    },
  },
});
