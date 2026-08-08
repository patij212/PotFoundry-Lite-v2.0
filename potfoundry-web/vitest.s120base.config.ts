// DEV-ONLY, TEMPORARY. S120's BYTE-IDENTITY GATE: this config runs `_s120Baseline.test.ts`, which is
// `git show HEAD:research/bridge/_strataConformBisectL.test.ts` verbatim (HEAD = 739252ea, the S119
// landing), placed beside the live driver so its relative imports resolve identically.
//
// THE GATE: same env, PF_CB_S120_LINEAGE unset, md5(STL) equal. S120 adds MEASUREMENT ONLY — five
// per-triangle columns, a pop-side tally and a report block — so a single differing byte means an
// instrument is reaching into the mesh and the census is not free.
//
// NB this is a DIFFERENT baseline from `_s119Baseline.test.ts`, which is pinned at f7c55ae9 (PRE-S119).
// Delete both this file and _s120Baseline.test.ts once S120 lands.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_s120Baseline.test.ts'],
    testTimeout: 7_200_000,
    hookTimeout: 7_200_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
