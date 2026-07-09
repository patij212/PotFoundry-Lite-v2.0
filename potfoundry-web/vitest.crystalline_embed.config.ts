// vitest.crystalline_embed.config.ts — DEV-ONLY config for E-2026-07-09-CRYSTALLINE-VALLEY-EMBED.
// Node env, generous heap, single fork. Only via `--config` for the _crystalline_valley_embed probe. ISOLATED.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_crystalline_valley_embed.test.ts'],
    testTimeout: 3_600_000 * 6,
    hookTimeout: 600_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        execArgv: ['--max-old-space-size=8192'],
      },
    },
  },
});
