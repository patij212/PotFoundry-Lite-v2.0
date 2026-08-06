// vitest.smfield.config.ts — DEV-ONLY config for research/bridge/surfaceMetricField.test.ts
// (E-2026-08-06-ANGLE-SIZING: the ANGLE sizing law h₃D = θ*/κ alongside UNIFORM and CHORD).
// Pure arithmetic on an analytic surface — no gmsh, no STL, no GPU — so the default timeouts are ample.
//   npx vitest run --config vitest.smfield.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/surfaceMetricField.test.ts'],
    pool: 'forks',
    forks: { singleFork: true },
  },
});
