// vitest.s118score.config.ts — DEV-ONLY config for research/bridge/_s118ScoreValidate.test.ts
// (S118: validate the 1e7-facet scorecard's algorithms on PLANTED defects before any DRIVE agent scores
// a mesh with it. Reproducing published numbers is one-sided; this is the other side.)
//   npx vitest run --config vitest.s118score.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_s118ScoreValidate.test.ts'],
    pool: 'forks',
    forks: { singleFork: true },
  },
});
