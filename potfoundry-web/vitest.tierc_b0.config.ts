// vitest.tierc_b0.config.ts — DEV-ONLY config for E-2026-07-11-TIERC-HEADTOHEAD Arm B0
// (research/bridge/_tierc_b0_toy.test.ts — the boundary-contract toy, PF_TIERC_B0=1).
// Mirrors vitest.tierc_gates.config.ts's convention (Node env, one file, modest timeout) — the
// toy is synthetic + small by design (one ring, two narrow K1 z-bands), so no special heap is
// needed beyond the NODE_OPTIONS the run invocation sets.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_b0_toy.test.ts'],
    testTimeout: 300_000,
    hookTimeout: 60_000,
    pool: 'forks',
  },
});
