// vitest.s118lat.config.ts — DEV-ONLY config for research/bridge/_s118DriveLattice.test.ts
// (S118 DRIVE: pin the barycentric-lattice containment property that lets a mesh certified at
// PF_S118D_KVER be quoted at the scorer's k=8.)
//   npx vitest run --config vitest.s118lat.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_s118DriveLattice.test.ts'],
    pool: 'forks',
    forks: { singleFork: true },
  },
});
