// research/bridge/_shape.config.ts — DEV-ONLY config for the 2026-07-29 SHAPE TERM (blade fix).
// Mirrors vitest.strata.config.ts (pool 'forks' + singleFork, environment 'node') but includes ONLY the
// _shape* files, so a unit run cannot pick up a concurrent audit's pool files.
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
    include: ['research/bridge/_shape*.test.ts'],
    testTimeout: 6_000_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
