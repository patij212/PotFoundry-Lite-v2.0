// vitest.pf_bamboo.config.ts — DEV-ONLY config for the BambooSegments doubled-RINGS Phase-3 probe. Node env,
// generous heap for dense structured meshes + BVH reference. dev-only; src/ never imports research/.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_bamboo.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
      execArgv: ['--max-old-space-size=16384'],
    },
  },
});
