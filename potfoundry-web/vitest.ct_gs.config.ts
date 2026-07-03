// vitest.ct_gs.config.ts — DEV-ONLY config for E-2026-07-03-CT-GEOMETRICSTAR (GeometricStar crease-conforming).
// Node env, generous heap for the dense structured wall + brute anchoring. Only via `--config` for _ct_gs.
// dev-only; src/ never imports research/.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_ct_gs.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true, execArgv: ['--max-old-space-size=16384'] },
  },
});
