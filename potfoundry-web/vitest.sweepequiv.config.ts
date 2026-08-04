// vitest.sweepequiv.config.ts — DEV-ONLY config for the sweep-driver predicate-parallelisation gates.
// Mirrors vitest.strata.config.ts (pool 'forks' + singleFork, environment 'node'), and exists only because
// `vitest.strata.config.ts`'s include glob is `research/bridge/_strata*.test.ts`, which does not match the
// `_sweep*` files. Heap MUST come from the command line (NODE_OPTIONS=--max-old-space-size=12288);
// Vitest 4 ignores poolOptions.forks.execArgv.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // NOT `_sweep*.test.ts` — that glob also catches the unrelated 2026-07-01 `_sweepMetricMap.test.ts`,
    // and a config that silently drags in someone else's probe is how a "gate" starts measuring the wrong thing.
    include: ['research/bridge/_sweepPredicate*.test.ts'],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
