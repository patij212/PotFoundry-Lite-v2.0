// vitest.msurfih.config.ts — DEV-ONLY config for research/bridge/_msurf_inhouseVsGmsh.test.ts
// (E-2026-07-13-MSURF-INHOUSE: browser-capable in-house M=g/h² mesher vs gmsh BAMG surf baseline). singleFork.
// Heap flag MUST be on the command line (Vitest 4 ignores poolOptions execArgv):
//   NODE_OPTIONS=--max-old-space-size=8192 PF_MSURFIH=1 npx vitest run --config vitest.msurfih.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_msurf_inhouseVsGmsh.test.ts'],
    testTimeout: 3_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
