// vitest.pf_perfectgs.config.ts — DEV-ONLY (PF_PERFECTGS=1): the honest-brute-driven perfect-mesher kernel applied
// to GeometricStar (the chevron-strap count-unstable cusp). Node, single fork, large heap. ISOLATED include.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_perfect_geostar_brute.test.ts'],
    testTimeout: 21_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
    execArgv: ['--max-old-space-size=12288'],
  },
});
