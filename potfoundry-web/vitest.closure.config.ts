// vitest.closure.config.ts — DEV-ONLY config for the autonomous style-closure probes/tests
// (research/bridge/_pfClose*.test.ts). Node env, single fork, generous heap + timeout for the
// production-scale structured-emitter meshes + true-3D scoring. Mirrors vitest.prodbase.config.ts.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pfClose*.test.ts'],
    testTimeout: 18_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
