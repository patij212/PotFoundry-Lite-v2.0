// vitest.orient.config.ts — DEV-ONLY config for research/bridge/_orientRulerValidate.test.ts
// (S112: validate the angular ruler BEFORE using it as the session's instrument — the standing rule is
// that a verdict is only as good as the ruler's own two-sided fixtures.)
//   npx vitest run --config vitest.orient.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_orientRulerValidate.test.ts'],
    pool: 'forks',
    forks: { singleFork: true },
  },
});
