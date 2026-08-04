// vitest.micro.config.ts — DEV-ONLY config for the STRATA-001 fundamental-domain causal probe.
// Mirrors vitest.maxadj.config.ts: pool 'forks' + singleFork, environment 'node'.
// Heap flag MUST be on the command line (NODE_OPTIONS=--max-old-space-size=6144);
// Vitest 4 ignores poolOptions.forks.execArgv.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_strataMicro.test.ts'],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
