import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { globals: true, environment: 'node', include: ['research/bridge/_tierc_b1_quality_quick.test.ts'], testTimeout: 120000, pool: 'forks' },
});
