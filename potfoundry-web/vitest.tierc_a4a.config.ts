// vitest.tierc_a4a.config.ts — DEV-ONLY config for Arm A4a (orientation-seam fix, opt-in) of
// E-2026-07-11-TIERC-HEADTOHEAD (research/bridge/_tierc_a4a.test.ts). Mirrors the sibling
// heavy-probe configs (a1_orient / a4_diag): pool 'forks' (NODE_OPTIONS heap flag MUST be on the
// command line — Vitest 4 ignores poolOptions.forks.execArgv in config) + a generous per-test
// timeout. Two 'off'-policy Delta2-exact twin builds (baseline + periodic-linked, ~60-90s each)
// plus Map-free topology classification, a geometric diff-confinement scan, and a fidelity
// re-score (prescreen + stratified Newton + coverage) on both outer submeshes.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_a4a.test.ts'],
    testTimeout: 1_200_000,
    hookTimeout: 600_000,
    pool: 'forks',
  },
});
