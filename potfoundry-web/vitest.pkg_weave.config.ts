// vitest.pkg_weave.config.ts — DEV-ONLY config for the BEST-20 weave packaging driver (_pkg_weave.test.ts).
// Node env, large heap (14-22M-tri meshes + ~1GB STL buffers), single fork. ISOLATED.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pkg_weave.test.ts'],
    testTimeout: 5_400_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
      execArgv: ['--max-old-space-size=24576'],
    },
  },
});
