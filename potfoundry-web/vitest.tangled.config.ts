// vitest.tangled.config.ts — DEV-ONLY config for the TANGLED-LATTICE primitive research (Gyroid/Voronoi/Crystalline).
// Node env (no jsdom), generous heap for dense meshes + brute anchoring. Only via `--config` for _tangled* probes.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tangled*.test.ts'],
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
