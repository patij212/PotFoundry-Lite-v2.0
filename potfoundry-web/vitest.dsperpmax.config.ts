// vitest.dsperpmax.config.ts — DEV-ONLY config for E-2026-07-14-DS-PERP-MAX (research/bridge/_dsPerpMax.test.ts).
// Measurement-only (loads pre-dumped bins); forks + singleFork; heap flag on the CLI
// (NODE_OPTIONS=--max-old-space-size=12288) since Vitest 4 ignores poolOptions.forks.execArgv.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_dsPerpMax.test.ts'],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
