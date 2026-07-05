// vitest.close_tangled.config.ts — DEV-ONLY config for the CLOSE-TANGLED depth-push probe (Voronoi/Crystalline
// residual worst-red: density-responsive vs steep-EXCLUDE floor). Node env, generous heap, single fork.
// Only via `--config` for the _close_tangled probe. ISOLATED — does not touch the _tangled* include set.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_close_tangled.test.ts'],
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
