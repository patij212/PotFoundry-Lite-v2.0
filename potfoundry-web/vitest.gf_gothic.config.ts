// vitest.gf_gothic.config.ts — DEV-ONLY config for the GF-GOTHIC flank-strip probe (E-2026-07-04-GF-GOTHIC):
// THE LAST distinct Gothic lever — explicit structured tessellation of the near-vertical rib-crest FLANK.
// Node env, generous heap, single fork. Only via `--config`. ISOLATED include set (my files only).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_gf_gothic_recon.test.ts', 'research/bridge/_gf_gothic.test.ts', 'research/bridge/_gf_gothic_diag.test.ts', 'research/bridge/_gf_gothic_render.test.ts'],
    testTimeout: 7_200_000,
    hookTimeout: 600_000,
    pool: 'forks',
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
    execArgv: ['--max-old-space-size=16384'],
  },
});
