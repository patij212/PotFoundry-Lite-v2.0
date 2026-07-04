// vitest.gd_gothic.config.ts — DEV-ONLY config for the GD-GOTHIC decisive probe (E-2026-07-04-GD-GOTHIC):
// Is GothicArches' true-3D floor density-RESPONSIVE (panels) or density-INVARIANT (near-vertical crest)?
// Node env, generous heap, single fork. Only via `--config` for the _gd_gothic probe. ISOLATED include set.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_gd_gothic.test.ts'],
    testTimeout: 7_200_000,
    hookTimeout: 600_000,
    pool: 'forks',
    // Vitest 4: poolOptions removed → top-level.
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
    execArgv: ['--max-old-space-size=16384'],
  },
});
