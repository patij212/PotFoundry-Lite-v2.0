// vitest.strata.config.ts — DEV-ONLY config for STRATA-001 (E-2026-07-23-STRATA001-*).
// Mirrors vitest.gsprod.config.ts: pool 'forks' + singleFork, environment 'node'.
// Heap flag MUST be on the command line (NODE_OPTIONS=--max-old-space-size=12288);
// Vitest 4 ignores poolOptions.forks.execArgv.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'research/bridge/_gothicScreenSlackAudit.test.ts',
      'research/bridge/_strata*.test.ts',
      // S0 root-cause arm: the REAL certifier (certifyContinuousMappedPatchDistance)
      // per patch with failing-cell UV — tests whether the reported Voronoi hang is
      // the exact-evaluator escalation at the 128 site-cone refusals (PF_SLICE11_VOR_PP).
      'research/bridge/_gothicVoronoiConformingSpike.test.ts',
    ],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
