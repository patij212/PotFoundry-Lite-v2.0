// vitest.close_theta.config.ts — DEV-ONLY config for the θ-RIDGE axis close (SuperformulaBlossom / GothicArches /
// SpiralRidges / HexagonalHive). Node env (no jsdom), generous heap for dense meshes + brute anchoring.
// Only via `--config` for the _close_theta probe. dev-only; src/ never imports research/.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_close_theta_fold.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    // vitest 4: forks options are top-level (poolOptions removed). Raise the worker heap so the dense
    // structured meshes (2M+ tris + brute anchoring) don't OOM the fork.
    forks: {
      singleFork: true,
      execArgv: ['--max-old-space-size=16384'],
    },
  },
});
