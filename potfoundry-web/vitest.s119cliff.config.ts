// vitest.s119cliff.config.ts — DEV-ONLY config for research/bridge/_s119CliffRuler.test.ts
// (S119 task 3: two-sided validation of the CLIFF-AWARE position ruler on a closed-form step fixture,
// before it is allowed to re-score anything.)
//   npx vitest run --config vitest.s119cliff.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_s119CliffRuler.test.ts'],
    pool: 'forks',
    forks: { singleFork: true },
    testTimeout: 300000,
  },
});
