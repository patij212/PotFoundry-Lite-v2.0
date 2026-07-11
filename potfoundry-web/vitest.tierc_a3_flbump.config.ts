// vitest.tierc_a3_flbump.config.ts — DEV-ONLY config for the Arm A3 BONUS featureLevel 11->12
// feasibility check (research/bridge/_tierc_a3_flbump.test.ts). Mirrors the sibling heavy-probe
// configs: pool 'forks' (NODE_OPTIONS heap flag MUST be on the command line — Vitest 4 ignores
// poolOptions.forks.execArgv in config). Tightly bounded (build + prescreenCount only, no
// Newton), so a smaller timeout than the main char probe suffices.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_a3_flbump.test.ts'],
    testTimeout: 600_000,
    hookTimeout: 300_000,
    pool: 'forks',
  },
});
