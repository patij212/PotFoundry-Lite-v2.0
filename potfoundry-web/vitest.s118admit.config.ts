// DEV-ONLY config for S118's emit-admission transcription proof (research/bridge/_s118EmitAdmit.test.ts).
// Pure arithmetic, no mesh, no I/O — it runs in under a second and is the gate on the transcription.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_s118EmitAdmit.test.ts'],
    testTimeout: 120_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
