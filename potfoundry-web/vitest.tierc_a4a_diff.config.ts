// vitest.tierc_a4a_diff.config.ts — DEV-ONLY config for the A4a geometric-diff FOLLOW-UP probe
// (research/bridge/_tierc_a4a_diffcheck.test.ts). Narrow question only: is the vertex-set diff
// between the baseline and periodic-linked 'off' builds confined to a small U-neighborhood of the
// seam across its FULL (uncapped, un-t-restricted) extent? Skips the expensive fidelity re-score
// (already measured in the main A4a probe) — extract + build x2 + diff only, ~3 min.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_a4a_diffcheck.test.ts'],
    testTimeout: 600_000,
    hookTimeout: 300_000,
    pool: 'forks',
  },
});
