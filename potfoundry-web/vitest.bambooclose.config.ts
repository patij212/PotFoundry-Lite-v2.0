// vitest.bambooclose.config.ts — DEV-ONLY config for E-2026-07-22-BAMBOO-SCHED
// (research/bridge/_bambooScheduleClose.test.ts). Node env (labkit uses node:fs), forks+singleFork, generous heap.
// Heap flag MUST be on the command line (NODE_OPTIONS=--max-old-space-size=8192) — Vitest 4 ignores
// poolOptions.forks.execArgv (see vitest.dsringstrips.config.ts). Each unit is keyExists-guarded ⇒ resumable.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_bambooScheduleClose.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
