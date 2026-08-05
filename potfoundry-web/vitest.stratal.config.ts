// DEV-ONLY config for the L FORK of the Strata conforming-bisection driver (agent LAND).
//
// THE FORK EXISTS FOR PROVENANCE, NOT SYNTAX. `_strataConformBisectS34.test.ts` is another agent's live
// workstream on a shared branch; editing it would make an arm unattributable and would sweep their WIP.
// This fork is a byte-for-byte copy of that file at the state that produced `S39CTL` and differs from it
// in exactly TWO places:
//   1. an import of `../tools/landFlipPass`,
//   2. §5.3b — a `PF_LAND_FLIP`-gated constrained-flip pass over the finished soup, DEFAULT OFF.
// With the flag off the fork must produce a mesh BYTE-IDENTICAL to S39CTL; that is the gate, and no
// treatment number is admissible until it passes (scar: project_strata_baselines_not_reproducible).
//
// Reproduce S39CTL through this fork:
//   bash research/tools/run-land-driver.sh L0CTL 0        # control, flag OFF
//   bash research/tools/run-land-driver.sh L1FLIP 1       # treatment, flag ON
//
// TEMPORARY. Delete the fork and this config once the pass is either promoted or refuted.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_strataConformBisectL.test.ts'],
    testTimeout: 7_200_000,
    hookTimeout: 7_200_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
