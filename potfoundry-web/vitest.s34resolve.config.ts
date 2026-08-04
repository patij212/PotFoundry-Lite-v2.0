// DEV-ONLY config for the S34 FORK of the Strata conforming-bisection driver.
//
// The fork exists for PROVENANCE, not for syntax: the working-tree `_strataConformBisect.test.ts`
// carries ~1,192 lines from another session (now preserved in 814fb069), so an arm run against it
// would not be attributable to the S34 lever alone. This fork is taken from 71d76c39 — the last
// state of the driver committed BEFORE those edits — and differs from it in exactly one place:
// `PF_CB_ALIGNED_RESOLVE_UM`, which forwards the seed builder's stage 1a-bis chain re-solve.
//
// TEMPORARY. Delete the fork and this config once the lever is either promoted into the parent
// driver or refuted.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_strataConformBisectS34.test.ts'],
    testTimeout: 7_200_000,
    hookTimeout: 7_200_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
