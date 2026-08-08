// DEV-ONLY config for the S119 ladder classifier's planted-defect fixtures.
//   PF_S119V=1 npx vitest run --config vitest.s119ladder.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_s119LadderValidate.test.ts'],
    testTimeout: 120_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
