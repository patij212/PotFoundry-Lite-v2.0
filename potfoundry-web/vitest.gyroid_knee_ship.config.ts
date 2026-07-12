// vitest.gyroid_knee_ship.config.ts — DEV-ONLY config for the Gyroid-knee-ship T6
// end-to-end gate (research/bridge/_gyroid_knee_ship.test.ts). Mirrors
// vitest.tierc_p2_5b.config.ts / vitest.tierc_p2_5c.config.ts (this lineage's own
// precedent): pool 'forks' + singleFork (NODE_OPTIONS heap flag MUST be on the
// command line — Vitest 4 ignores poolOptions.forks.execArgv in config), generous
// testTimeout covering the file's internal budget (flag-OFF baseline build ~85s +
// flag-ON two-pass loop = pass-0 build + ≤4 escalated rebuilds ~90-120s each +
// full 2105-hot-point Newton scoring ~130s/arm). Liveness is watched externally
// via research/exchange/tierc/gyroid_knee_ship_crumbs.ndjson, not by this ceiling.
//
// Run: NODE_OPTIONS=--max-old-space-size=12288 PF_GYROID_KNEE_SHIP=1 \
//   node node_modules/vitest/vitest.mjs run --config vitest.gyroid_knee_ship.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_gyroid_knee_ship.test.ts'],
    testTimeout: 2_640_000, // 44 min
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
