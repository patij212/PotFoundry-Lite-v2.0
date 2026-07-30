// research/bridge/_judge.config.ts — DEV-ONLY vitest config for the hardened judge (2026-07-29).
//
//   cd potfoundry-web
//   npx vitest run -c research/bridge/_judge.config.ts research/bridge/_judgeNegativeControl.test.ts
//
// WHY IT EXISTS. The repo's default config is jsdom with a setup file that dereferences HTMLCanvasElement at
// module scope, so `--environment=node` on the command line fails before a test runs and there is no
// `--setupFiles` CLI flag to clear it. vitest.strata.config.ts solves that for `_strata*.test.ts` and its
// `include` does not cover `_judge*`. Same three settings, same reasons: environment 'node', pool 'forks'
// with singleFork (Vitest 4 ignores poolOptions.forks.execArgv, so a heap bump goes on the command line as
// NODE_OPTIONS=--max-old-space-size=...), and generous timeouts because layer 2 reads multi-hundred-MB
// meshes.
//
// `root` is resolved from this file so the config works from any cwd — the _blade.config.ts pattern.
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..'); // potfoundry-web/

export default defineConfig({
  root,
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_judge*.test.ts'],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
