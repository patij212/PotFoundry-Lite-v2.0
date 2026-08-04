// vitest.h2eq.config.ts — DEV-ONLY config for the H2 phase-A pool equivalence proof.
// Mirrors vitest.strata.config.ts: pool 'forks' + singleFork, environment 'node'.
//
// environment MUST be 'node': the default jsdom environment does not reliably expose SharedArrayBuffer or
// worker_threads, and a pool that silently falls back to serial would make this test pass vacuously.
// singleFork so the eight phase-A workers are the only thing competing for the box.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_h2Equivalence.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
