// DEV-ONLY config for the S121 unit gates: the tread emitter (_s121TreadUnit.test.ts) and the seed-repair
// flip operator (_s121SeedUnit.test.ts). Both are pure-function tests over hand-built fixtures — seconds,
// not hours — and both are gated behind PF_S121_UNIT=1 so a bare `vitest run` never picks them up.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'research/bridge/_s121TreadUnit.test.ts',
      'research/bridge/_s121SeedUnit.test.ts',
      'research/bridge/_s121Tdd.test.ts',
    ],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
