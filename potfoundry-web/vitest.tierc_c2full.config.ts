// vitest.tierc_c2full.config.ts — DEV-ONLY config for the Arm C2 FULL-PATCH CONFIRM probe
// (research/bridge/_tierc_c2full.test.ts), the deferred C2 follow-up (C2-analytic-surface-verdict.md
// "Honest limitation": full-9917-facet-patch confirm scheduled before any default flip). Mirrors
// vitest.tierc_armC1_diag.config.ts. Pool 'forks' for NODE_OPTIONS heap propagation. PART A
// (sampler-built patch, budget ~9min) and PART B (analytic-built patch, budget ~25min) are two
// separate env-gated `it()`s in the SAME file, run as separate processes — testTimeout sized to
// PART B's worst case (its own internal wall-clock budget guards fire well before this backstop).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_c2full.test.ts'],
    testTimeout: 1_800_000,
    hookTimeout: 300_000,
    pool: 'forks',
  },
});
