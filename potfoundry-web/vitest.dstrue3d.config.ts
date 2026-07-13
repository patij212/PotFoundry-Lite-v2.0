// vitest.dstrue3d.config.ts — DEV-ONLY config for research/bridge/_dsTrue3d.test.ts
// (E-2026-07-13-DS-TRUE3D: re-score the DS M-kernel OFF-baseline BODY under the certified TRUE-3D composite ruler
// vs the RADIAL ruler — is the 0.0282/1.13 residual a radial-ruler ARTIFACT or a real feature-edge residual?).
// Heap flag MUST be on the command line (Vitest 4 ignores poolOptions execArgv):
//   NODE_OPTIONS=--max-old-space-size=8192 PF_DSTRUE3D=1 npx vitest run --config vitest.dstrue3d.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_dsTrue3d.test.ts'],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
