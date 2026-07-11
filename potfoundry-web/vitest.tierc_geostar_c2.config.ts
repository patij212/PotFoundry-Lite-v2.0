// vitest.tierc_geostar_c2.config.ts — DEV-ONLY config for the GeoStar C2-repeat arm probe
// (research/bridge/_tierc_geostar_c2.test.ts), E-2026-07-11-TIERC-HEADTOHEAD. Mirrors
// vitest.tierc_c2full.config.ts (the committed Gothic C2-full config). Pool 'forks' for
// NODE_OPTIONS heap propagation. PART A (sampler-built patch, internal budget 4min) and PART B
// (analytic-built patch, internal budget 5min) are two separate env-gated `it()`s in the SAME
// file, run as separate processes — testTimeout is a backstop above each `it()`'s own explicit
// timeout (8min / 8.5min), which itself sits above each part's internal wall-clock budget guard.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_geostar_c2.test.ts'],
    testTimeout: 600_000,
    hookTimeout: 120_000,
    pool: 'forks',
  },
});
