// vitest.verify_ia.config.ts — DEV-ONLY config for the adversarial intrinsic-apex verifier
// (research/bridge/_verify_intrinsicApex.test.ts). Node env, single fork.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_verify_intrinsicApex.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 300_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
