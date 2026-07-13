// vitest.dschord.config.ts — DEV-ONLY config for research/bridge/_dsChordGuard.test.ts
// (E-2026-07-13-DS-CHORDGUARD: does chordTolMm ON close DS body fidelity or reveal a feature-edge class?). singleFork.
// Heap flag MUST be on the command line (Vitest 4 ignores poolOptions execArgv):
//   NODE_OPTIONS=--max-old-space-size=8192 PF_DSCHORD=1 npx vitest run --config vitest.dschord.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_dsChordGuard.test.ts'],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
