// vitest.tierc_chordfloor_char.config.ts — DEV-ONLY config for the CHORD_FLOOR adjudication probe
// (research/bridge/_tierc_chordfloor_char.test.ts). Pure-analytic (no mesh build) so a small heap +
// short timeout suffice; mirrors the repo's per-probe config convention (each probe scopes `include`
// to its own file). Env-gated by PF_TIERC_CHORDCHAR=1.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_chordfloor_char.test.ts'],
    testTimeout: 300_000,
    hookTimeout: 60_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
