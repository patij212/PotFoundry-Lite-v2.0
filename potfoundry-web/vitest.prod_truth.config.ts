// vitest.prod_truth.config.ts — DEV-ONLY config for E-2026-07-09-PROD-ARTIFACT-TRUTH
// (score the captured production default export under the honest every-facet ruler).
// Node env, generous heap for multi-million-facet artifacts. Only via `--config` for
// research/bridge/_prod_truth.test.ts. Dev-only; src/ never imports research/.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_prod_truth.test.ts'],
    testTimeout: 5_400_000,
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
