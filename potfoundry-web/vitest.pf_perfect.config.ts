// vitest.pf_perfect.config.ts — DEV-ONLY config for the PERFECT-MESHER end-to-end validation probe
// (PF_PERFECT=1): FGJ Morse junction graph + SURFNATIVE interior-criterion arc-length-graded refine,
// assembled END-TO-END on a REAL single-arch Gothic patch. Node env, single fork, large heap for the
// 0.3–0.8M-tri patch + full-azimuth brute acceptance guard. Only via `--config`. ISOLATED include (my file only).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_pf_perfect_gothic.test.ts'],
    testTimeout: 5_400_000,
    hookTimeout: 600_000,
    pool: 'forks',
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
    execArgv: ['--max-old-space-size=12288'],
  },
});
