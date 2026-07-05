import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { globals: true, environment: 'node', include: ['research/bridge/_pf_direct_slivdiag.test.ts'], testTimeout: 600000, pool: 'forks', fileParallelism: false, maxWorkers: 1, minWorkers: 1 } });
