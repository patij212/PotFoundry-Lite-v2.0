// vitest.revs114mut.config.ts — REVIEW-ONLY config for the S114 refutation mutation arms.
// Each arm is the UNMODIFIED new fixture file with only its import redirected, so a difference in
// pass/fail is attributable to the implementation alone.
//   PF_ORIENT_FTV=1 npx vitest run --config vitest.revs114mut.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_revS114Mut*Validate.test.ts'],
    pool: 'forks',
    forks: { singleFork: true },
  },
});
