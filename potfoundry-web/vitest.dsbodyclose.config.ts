// vitest.dsbodyclose.config.ts — DEV-ONLY config for E-2026-07-20-DS-BODY-CLOSE
// (research/bridge/_dsBodyClose.test.ts). pool 'forks' + singleFork; heap flag MUST be on the command line
// (NODE_OPTIONS=--max-old-space-size=14336) since Vitest 4 ignores poolOptions.forks.execArgv. Each unit is a
// separate env-gated, keyExists-guarded, checkpointed probe => a killed run resumes by re-running the unfinished unit.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_dsBodyClose.test.ts'],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
