// vitest.dcrest.config.ts — DEV-ONLY config for E-2026-07-04-DCREST (structured doubled-crest feature-conforming
// primitive). Node env, generous heap for dense structured meshes + brute anchoring. Only via `--config` for the
// _doubledCrest probe. dev-only; src/ never imports research/.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_doubledCrest.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
      execArgv: ['--max-old-space-size=16384'],
    },
  },
});
