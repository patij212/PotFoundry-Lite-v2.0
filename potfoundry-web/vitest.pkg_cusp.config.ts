// vitest.pkg_cusp.config.ts — DEV-ONLY config for the _best20 cusp-family package probe (GothicArches, GeometricStar).
// Node env, generous heap, single fork. Only via `--config` for _pkg_cusp. ISOLATED.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pkg_cusp.test.ts'],
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
