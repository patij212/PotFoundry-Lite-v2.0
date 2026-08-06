// vitest.dihedral.config.ts — DEV-ONLY config for research/bridge/dihedralRuler.test.ts
// (E-2026-08-06-ANGLE-BAR-CALIB: the adjacent-facet dihedral, i.e. the quantity a preview shades).
// Closed-form folds only — milliseconds.
//   npx vitest run --config vitest.dihedral.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/dihedralRuler.test.ts'],
    pool: 'forks',
    forks: { singleFork: true },
  },
});
