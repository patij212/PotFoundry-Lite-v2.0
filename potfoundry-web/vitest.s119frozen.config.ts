// DEV-ONLY config for the S119 TASK-2 FROZEN DRIVER COPY.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY A FROZEN COPY EXISTS. IT IS PROVENANCE, NOT SYNTAX — the identical reason
// `_strataConformBisectL.test.ts` itself was forked from `_strataConformBisectS34.test.ts`.
//
// S119 task 2 is a DENSITY LADDER: six meshes whose only intended difference is the triangle allocation.
// That claim is void if the rungs were produced by different driver bytes. And they could be: the S119
// task-1 agent is editing `_strataConformBisectL.test.ts` in this same worktree, live, while the ladder
// runs. Its edits are flag-gated and default OFF, but "should be byte-identical when off" is an argument,
// and a ladder resting on an argument is not a measurement.
//
// So `_strataConformBisectS119F.test.ts` is `git show HEAD:...` of the driver — the COMMITTED S118 state,
// f7c55ae9 — copied byte for byte, with ZERO edits:
//   git show HEAD:potfoundry-web/research/bridge/_strataConformBisectL.test.ts | md5sum
//     == md5sum of the frozen file  == dc18a5879397e1e1652c7f37df7c5e30
// This is NOT a replacement driver and NOT a new generator. It is the same seed, the same refinement loop
// and the same emit choke point; only the file name differs, so the ladder has one provenance.
//
// THE GATE. A rung already produced against the LIVE file is re-run against this copy and the two STLs
// must be BYTE-IDENTICAL (md5). Until that passes, no rung produced through this config is admissible.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_strataConformBisectS119F.test.ts'],
    testTimeout: 36_000_000,
    hookTimeout: 36_000_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
