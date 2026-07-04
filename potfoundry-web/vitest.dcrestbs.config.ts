// vitest.dcrestbs.config.ts — DEV-ONLY config for E-2026-07-04-DCREST-BAMBOO (Phase-2: doubled-crest primitive on
// BambooSegments). Node env, generous heap for dense structured meshes + brute anchoring. dev-only; src/ never
// imports research/.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_doubledCrestBamboo.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
      execArgv: ['--max-old-space-size=16384'],
    },
  },
});
