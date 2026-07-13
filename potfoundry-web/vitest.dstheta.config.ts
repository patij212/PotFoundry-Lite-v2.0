// vitest.dstheta.config.ts — DEV-ONLY config for research/bridge/_dsThetaEdge.test.ts
// (E-2026-07-13-DS-THETAEDGE: embed the DS scale-tile θ-edge constraint graph into the M-kernel and re-score BODY
// under the certified TRUE-3D composite ruler — does it close DS body to 0.01 without regressing the sliver win?).
// Heap flag MUST be on the command line (Vitest 4 ignores poolOptions execArgv):
//   NODE_OPTIONS=--max-old-space-size=8192 PF_DSTHETA=1 npx vitest run --config vitest.dstheta.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_dsThetaEdge.test.ts'],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
