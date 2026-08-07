// DEV-ONLY, TEMPORARY. S118's BYTE-IDENTITY GATE: this config runs `_s118Baseline.test.ts`, which is
// `git show HEAD:research/bridge/_strataConformBisectL.test.ts` verbatim, placed beside the live driver so
// its relative imports resolve identically. The gate is: same env, S118 flags OFF, md5(STL) equal.
// Delete both this file and _s118Baseline.test.ts once S118 lands.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_s118Baseline.test.ts'],
    testTimeout: 7_200_000,
    hookTimeout: 7_200_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
