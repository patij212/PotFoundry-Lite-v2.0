// vitest.gsloci.config.ts — DEV-ONLY config for the GeoStar measured-loci conforming probe
// (research/bridge/_gsLociConform.test.ts). Node env, single fork, generous timeout.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_gsLociConform.test.ts'],
    testTimeout: 7_200_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
