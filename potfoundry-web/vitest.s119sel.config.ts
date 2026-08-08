// DEV-ONLY config for S119's parameter-metric edge-selection unit tests.
//   npx vitest run --config vitest.s119sel.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_s119Sel.test.ts'],
    testTimeout: 120_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
