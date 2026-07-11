// vitest.tierc_a4_diag.config.ts — DEV-ONLY config for Arm A4 (diagnosis-only) of
// E-2026-07-11-TIERC-HEADTOHEAD (research/bridge/_tierc_a4_diag.test.ts). Mirrors the sibling
// heavy-probe configs (a1_orient / a2_accept / armA1): pool 'forks' (NODE_OPTIONS heap flag MUST
// be on the command line — Vitest 4 ignores poolOptions.forks.execArgv in config) + a generous
// per-test timeout. One 'off'-policy Delta2-exact twin build (~70-140s) plus Map-free topology
// classification + local-patch dumps over the full 4.36M-tri assembly.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_a4_diag.test.ts'],
    testTimeout: 1_200_000,
    hookTimeout: 600_000,
    pool: 'forks',
  },
});
