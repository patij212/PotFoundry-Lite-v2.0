// vitest.msurfregion.config.ts — DEV-ONLY config for research/bridge/_msurf_regionKernel.test.ts
// (port-fidelity reproduction: SRC buildMetricOuterWall reproduces the E-2026-07-13-MSURF-INHOUSE M=g/h² win). singleFork.
// Heap flag MUST be on the command line (Vitest 4 ignores poolOptions execArgv):
//   NODE_OPTIONS=--max-old-space-size=8192 PF_MSURFIH_REGION=1 npx vitest run --config vitest.msurfregion.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_msurf_regionKernel.test.ts'],
    testTimeout: 3_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
