// vitest.tierc_regionLayer.config.ts — DEV-ONLY config for the PROD-TIERC Phase-1 region layer CORE
// TDD suite (research/bridge/tierc_regionLayer.test.ts; architecture-v1.md build item 4). Mirrors
// vitest.tierc_gates.config.ts's own convention exactly (see that file's header): no shared "all
// research/bridge tests" config exists in this repo — every vitest.*.config.ts scopes `include` to one
// probe's own test file(s) — and vitest.tierc_gates.config.ts's own `include` is scoped to its single
// file, so a new dedicated config is required here rather than reusing it. The suite itself only builds
// TINY (H=20, resU=resT=16) meshes, so the 60s synthetic-suite timeout (not the heavy-probe shape) is
// the right ceiling.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/tierc_regionLayer.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
  },
});
