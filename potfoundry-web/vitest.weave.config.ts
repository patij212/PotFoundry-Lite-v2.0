// vitest.weave.config.ts — DEV-ONLY config for the WEAVE/BRAID frontier (BasketWeave, CelticKnot).
// FRONTIER task: mesh the weave/braid class to <=0.01mm true-3D chord + good quality + raw-index watertight via a
// strand-CREASE-conforming structured primitive. Node env, generous heap for dense meshes + brute rulers.
// Only via `--config` for _weave*/_braid* probes. Dev-only; src/ never imports research/.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_weave*.test.ts', 'research/bridge/_braid*.test.ts'],
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
