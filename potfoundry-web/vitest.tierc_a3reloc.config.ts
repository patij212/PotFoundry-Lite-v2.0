// vitest.tierc_a3reloc.config.ts — DEV-ONLY config for the PROD-TIERC Arm A3-relocate probe
// (research/bridge/_tierc_a3_reloc.test.ts). Mirrors vitest.tierc_armD.config.ts's heavy-probe
// shape exactly (singleFork, heap via CLI NODE_OPTIONS not config poolOptions — this repo's vitest 4
// install ignores config-level poolOptions heap, per that file's own precedent comment).
//
// testTimeout is a generous BACKSTOP only; liveness is watched externally via
// research/exchange/tierc/armA3_reloc_crumbs.ndjson, not by this in-process ceiling.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['research/bridge/_tierc_a3_reloc.test.ts'],
    testTimeout: 2_400_000,
    hookTimeout: 600_000,
    pool: 'forks',
    forks: {
      singleFork: true,
    },
  },
});
