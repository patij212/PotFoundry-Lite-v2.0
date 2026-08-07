// vitest.s117visbar.config.ts — DEV-ONLY config for research/tools/s117VisBarKernel.test.ts
// (S117 P5: retire the inherited 45 deg adjacent-dihedral bar and replace it with derived quantities).
// Closed-form only — milliseconds.
//   npx vitest run --config vitest.s117visbar.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/tools/s117VisBarKernel.test.ts'],
    pool: 'forks',
    forks: { singleFork: true },
  },
});
