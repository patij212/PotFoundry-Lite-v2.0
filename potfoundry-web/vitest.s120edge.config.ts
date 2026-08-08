// vitest.s120edge.config.ts — DEV-ONLY config for research/bridge/_s120EdgeRulerValidate.test.ts
// (S120: validate the EDGE-conformance ruler on closed forms BEFORE any mesh is scored with it.)
//   npx vitest run --config vitest.s120edge.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_s120EdgeRulerValidate.test.ts'],
    testTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
