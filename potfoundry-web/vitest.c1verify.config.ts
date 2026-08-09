// S121 TASK C1 — the INDEPENDENT confirmation test. Separate config so it cannot alter the fix's own
// vitest.s121unit.config.ts (which is one of the artifacts under review).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_c1VerifyBefore.test.ts'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
