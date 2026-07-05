import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { globals: true, environment: 'node', include: ['research/bridge/_pf_msq_diag.test.ts'], testTimeout: 900_000, pool: 'forks', fileParallelism: false, maxWorkers: 1, minWorkers: 1 } });
