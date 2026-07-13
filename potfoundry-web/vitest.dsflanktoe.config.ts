// vitest.dsflanktoe.config.ts — DEV-ONLY config for research/bridge/_dsFlankToe.test.ts
// (E-2026-07-13-DS-FLANKTOE: STEP 1 worst-locus confirmation + STEP 2 flank-toe contour embed).
// Heap flag MUST be on the command line (Vitest 4 ignores poolOptions execArgv):
//   NODE_OPTIONS=--max-old-space-size=8192 PF_DSFLANKTOE=1 npx vitest run --config vitest.dsflanktoe.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_dsFlankToe.test.ts'],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
