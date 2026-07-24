// vitest.prodmesher.config.ts — DEV-ONLY config for the production-mesher dispatch wiring
// (productionMesherConfig.test.ts table pin + master-ON smoke) AND the flagOff byte-identical
// hard gate. Node env (both are pure-logic / node-compatible mesh builds — no DOM). Root is pinned
// to the REPO ROOT (parent of potfoundry-web) so tinypool resolves the vitest 1.6.1 worker from the
// repo-root node_modules, NOT potfoundry-web's 4.0.17 (the version-mismatch worker crash). Launch
// from the repo root. dev-only; src/ never imports research/.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    globals: true,
    environment: 'node',
    include: [
      'potfoundry-web/src/renderers/webgpu/parametric/conforming/tierC/productionMesherConfig.test.ts',
      'potfoundry-web/src/renderers/webgpu/parametric/conforming/tierC/flagOff.byteIdentical.test.ts',
    ],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        execArgv: ['--max-old-space-size=4096'],
      },
    },
  },
});
