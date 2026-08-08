// DEV-ONLY, TEMPORARY. S119's BYTE-IDENTITY GATE: this config runs `_s119Baseline.test.ts`, which is
// `git show HEAD:research/bridge/_strataConformBisectL.test.ts` verbatim, placed beside the live driver so
// its relative imports resolve identically. The gate is: same env, PF_CB_S119_PARAMSEL unset, md5(STL) equal.
// Delete both this file and _s119Baseline.test.ts once S119 lands.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_s119Baseline.test.ts'],
    testTimeout: 7_200_000,
    hookTimeout: 7_200_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
