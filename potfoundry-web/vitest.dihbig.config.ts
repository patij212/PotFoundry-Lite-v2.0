// vitest.dihbig.config.ts — DEV-ONLY config for research/bridge/dihedralRulerBig.test.ts
// (S117 P0: the Map-free edge pairing that lifts facetDihedrals' 2^23-edge ceiling).
// Equivalence fixtures are milliseconds; the >2^23 capacity case is opt-in via PF_DIHBIG_HUGE=1.
//   npx vitest run --config vitest.dihbig.config.ts
//   PF_DIHBIG_HUGE=1 npx vitest run --config vitest.dihbig.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/dihedralRulerBig.test.ts'],
    pool: 'forks',
    forks: { singleFork: true },
    testTimeout: 600000,
    hookTimeout: 600000,
  },
});
