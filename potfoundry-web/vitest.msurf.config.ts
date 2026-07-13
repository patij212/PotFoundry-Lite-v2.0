// vitest.msurf.config.ts — DEV-ONLY config for research/bridge/_msurf_isoVsSurf.test.ts
// (E-2026-07-13-MSURF-ISOVSSURF: M=g/h² surface metric vs isotropic sizing). singleFork; generous
// timeout covers the gmsh sweep (2 styles × 2 tols × 2 arms) + DS composite-ruler fidelity scoring.
// Heap flag MUST be on the command line (Vitest 4 ignores poolOptions execArgv):
//   NODE_OPTIONS=--max-old-space-size=8192 PF_MSURF=1 npx vitest run --config vitest.msurf.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_msurf_isoVsSurf.test.ts'],
    testTimeout: 3_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
