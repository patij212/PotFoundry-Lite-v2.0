// vitest.flankband.config.ts — DEV-ONLY config for the E-2026-07-08-TIERC-FLANKBAND
// round-9 probe (_flankBand.test.ts, in the tierC dir). Node env (no jsdom overhead),
// forks pool, single file at a time, hours-sized timeout. The probe is env-gated
// (PF_FLANKBAND=1) so a plain suite run is a no-op.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/renderers/webgpu/parametric/conforming/tierC/_flankBand.test.ts'],
    testTimeout: 21_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
