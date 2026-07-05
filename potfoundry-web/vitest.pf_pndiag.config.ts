import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { globals: true, environment: 'node', include: ['research/bridge/_pf_pndiag.test.ts'], testTimeout: 600000, pool: 'forks', fileParallelism: false, maxWorkers: 1, minWorkers: 1, execArgv: ['--max-old-space-size=8192'] } });
