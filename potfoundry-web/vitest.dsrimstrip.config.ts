// vitest.dsrimstrip.config.ts — DEV-ONLY config for research/bridge/_dsRimStrip.test.ts
// (E-2026-07-13-DS-RIMSTRIP: definitive DS body 0.01-close attempt — u-running rim/row strips vs rim floor() artifact).
// Heap flag MUST be on the command line (Vitest 4 ignores poolOptions execArgv):
//   NODE_OPTIONS=--max-old-space-size=8192 PF_DSRIM=1 npx vitest run --config vitest.dsrimstrip.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_dsRimStrip.test.ts'],
    testTimeout: 12_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
