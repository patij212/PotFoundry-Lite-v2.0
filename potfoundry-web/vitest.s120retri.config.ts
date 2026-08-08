// vitest.s120retri.config.ts — DEV-ONLY config for research/bridge/_s120RetriKernel.test.ts
// (S120 Task D: the 1-ring retriangulation kernel — the LEGAL MOVE for a facet the driver admitted
// above aspect3 = 25 and can therefore never split. Validated on closed forms BEFORE it is wired.)
//   npx vitest run --config vitest.s120retri.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_s120RetriKernel.test.ts'],
    testTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
