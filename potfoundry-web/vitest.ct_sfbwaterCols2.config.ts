import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { globals: true, environment: 'node', include: ['research/bridge/_ct_sfbwaterCols2.test.ts'], testTimeout: 3600000, pool: 'forks', forks: { singleFork: true, execArgv: ['--max-old-space-size=16384'] } } });
