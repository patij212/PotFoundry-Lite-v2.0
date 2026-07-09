// vitest.tangled_targeted.config.ts — DEV-ONLY config for E-2026-07-08-TANGLED-TARGETED / E-2026-07-09-CRYSTALLINE-LITERAL0.
// LOCAL injected-Steiner refinement to Newton-0 (§V11u / §V11ab / §V11ad). Node env, generous heap, single fork.
// Only via `--config` for _pf_tangledTargeted. ISOLATED (matches the density-probe config pattern).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_tangledTargeted.test.ts'],
    testTimeout: 6 * 60 * 60 * 1000,
    hookTimeout: 600_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
