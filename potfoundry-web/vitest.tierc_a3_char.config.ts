// vitest.tierc_a3_char.config.ts — DEV-ONLY config for Arm A3 characterization (diagnosis-only)
// of E-2026-07-11-TIERC-HEADTOHEAD (research/bridge/_tierc_a3_char.test.ts). Mirrors the sibling
// heavy-probe configs (a1_orient / a4_diag / a2_accept): pool 'forks' (NODE_OPTIONS heap flag
// MUST be on the command line — Vitest 4 ignores poolOptions.forks.execArgv in config) + a
// generous per-test timeout matching the probe's own 31-minute internal ceiling (30min budget +
// 1min safety margin so vitest never kills the process before the probe's own graceful stop/write
// logic gets to run).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_a3_char.test.ts'],
    testTimeout: 1_900_000,
    hookTimeout: 600_000,
    pool: 'forks',
  },
});
