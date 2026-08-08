// vitest.s120dbase.config.ts — DEV-ONLY, TEMPORARY. S120 TASK D's BYTE-IDENTITY GATE.
//
// `_s120dBaseline.test.ts` is `git show HEAD:research/bridge/_strataConformBisectL.test.ts` VERBATIM, where
// HEAD = a7299ad0 (the S120 Task A landing), placed beside the live driver so its relative imports resolve
// identically. It is a DIFFERENT baseline from `_s120Baseline.test.ts` (pinned at 739252ea, pre-Task-A) and
// from `_s119Baseline.test.ts` (pinned at f7c55ae9, pre-S119).
//
// THE GATE: same env, PF_CB_S120_RETRI unset, md5(STL) equal. Task D adds a MOVE, not a measurement, so the
// gate is stronger than a census gate can be: the flag-OFF arm must be byte-identical to a build that does
// not contain the operator at all. Delete this file and _s120dBaseline.test.ts once Task D lands.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_s120dBaseline.test.ts'],
    testTimeout: 7_200_000,
    hookTimeout: 7_200_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
