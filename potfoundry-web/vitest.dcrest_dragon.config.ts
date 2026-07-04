// vitest.dcrest_dragon.config.ts — DEV-ONLY config for the PHASE-2 doubled-crest → DragonScales probe.
// Node env, generous heap, single fork. Only via `--config` for _doubledCrestDragon.test.ts. ISOLATED.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_doubledCrestDragon.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        execArgv: ['--max-old-space-size=16384'],
      },
    },
  },
});
