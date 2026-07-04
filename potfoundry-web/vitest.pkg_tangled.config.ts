// vitest.pkg_tangled.config.ts — DEV-ONLY config for the BEST-20 TANGLED packaging probe (_pkg_tangled).
// Node env (no jsdom), generous heap for dense meshes + brute anchoring. Only via `--config`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pkg_tangled.test.ts', 'research/bridge/_pkg_tangled_frombins.test.ts'],
    testTimeout: 5_400_000,
    hookTimeout: 600_000,
    pool: 'forks',
    // Vitest 4: pool options are top-level (poolOptions.forks was removed).
    // 8 GB heap: the box shares ~9 GB free with a concurrent sibling workstream, so a 16 GB fork gets OS-OOM-killed.
    forks: {
      singleFork: true,
      execArgv: ['--max-old-space-size=8192'],
    },
  },
});
