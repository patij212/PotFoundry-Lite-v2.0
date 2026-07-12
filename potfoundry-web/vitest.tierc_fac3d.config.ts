// vitest.tierc_fac3d.config.ts — DEV-ONLY config for the FAC-3D arm probe
// (research/bridge/_tierc_fac3d.test.ts): the true-3D fidelity confirm for flipping
// featureAlignedCell default-ON. Mirrors vitest.tierc_p2_4.config.ts's convention (this repo has no
// shared "all research/bridge" config — every probe scopes `include` to its own file): pool 'forks'
// + singleFork (Vitest 4 ignores poolOptions.forks.execArgv, so the heap flag MUST be on the command
// line: NODE_OPTIONS=--max-old-space-size=12288). Generous per-test timeout covers each style's
// OFF+ON build (~1M+ tris ×2) + whole-mesh true-3D projection; liveness is watched externally via
// research/exchange/tierc/fac3d_crumbs.ndjson, not this in-process ceiling.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_fac3d.test.ts'],
    testTimeout: 2_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
