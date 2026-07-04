// vitest.pf_sfbseam.config.ts — DEV-ONLY config for E-2026-07-04-SFB-SEAM (SuperformulaBlossom non-2π seam-wall
// diagnostic + doubled-edge builder). Node env, generous heap. dev-only; src/ never imports research/.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_sfbseam.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
      execArgv: ['--max-old-space-size=16384'],
    },
  },
});
