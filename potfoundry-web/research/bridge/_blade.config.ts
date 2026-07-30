// research/bridge/_blade.config.ts — DEV-ONLY config for the 2026-07-29 blade diagnosis.
// Mirrors vitest.strata.config.ts (pool 'forks' + singleFork, environment 'node') but includes ONLY the
// instrumented clone, so the concurrent H1 audit's pool files are never picked up by this run.
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
    include: ['research/bridge/_blade*.test.ts'],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
