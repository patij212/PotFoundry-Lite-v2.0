// _phase2Vitest.config.ts — DEV-ONLY vitest config for the Phase-2 harnesses. RESEARCH ONLY.
//
//   cd potfoundry-web
//   npx vitest run -c research/bridge/_phase2Vitest.config.ts research/bridge/_phase2Audit.test.ts
//
// WHY IT EXISTS. The repo's default config is `environment: 'jsdom'` with `setupFiles: ['./src/test/setup.ts']`,
// and that setup file dereferences `HTMLCanvasElement` at module scope — so `--environment=node` on the
// command line fails before a test runs, and there is no `--setupFiles` CLI flag to clear it. vitest.strata
// .config.ts solves the same problem for `_strata*.test.ts` and its `include` does not cover `_phase2*`.
//
// The three settings that matter are the ones vitest.strata.config.ts uses, for the reasons it gives:
// environment 'node' (no DOM, no jsdom memory ceiling on a multi-hundred-MB mesh), pool 'forks' with
// singleFork (Vitest 4 ignores poolOptions.forks.execArgv, so a heap bump must go on the command line as
// NODE_OPTIONS=--max-old-space-size=...), and generous timeouts because a full-coverage H2 sweep is minutes.
//
// `root` is left at the default, i.e. the cwd the command was launched from — run it from potfoundry-web/.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_phase2*.test.ts'],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
