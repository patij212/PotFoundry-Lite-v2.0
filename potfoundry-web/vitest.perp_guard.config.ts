// vitest.perp_guard.config.ts — DEV-ONLY config for E-PERP-GUARD (true-3D-perpendicular-driven refinement guard,
// GothicArches). Node env (no jsdom), generous heap for dense meshes + brute anchoring. Only via `--config` for the
// _perp_guard probe. dev-only; src/ never imports research/.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_perp_guard.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    // vitest 4: forks options are top-level (poolOptions removed).
    forks: {
      singleFork: true,
      execArgv: ['--max-old-space-size=16384'],
    },
  },
});
