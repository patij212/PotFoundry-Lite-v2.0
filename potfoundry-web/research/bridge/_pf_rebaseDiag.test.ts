// _pf_rebaseDiag.test.ts — DEV-ONLY (PF_REBASEDIAG=1). Does the honest foot = min(GN-with-fallback, brute) place
// the tangled-lattice vertices ON-surface (~0)? If yes, the whole-mesh ruler can trust those styles.
import { describe, it, expect } from 'vitest';
import { buildRadiusFn, type StyleDims } from './labkit';
import { loadBinMesh, vertexOnSurfaceCheck } from './_pf_rebaselineRuler';
import { join } from 'node:path';
import { appendFileSync } from 'node:fs';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const LOG = join('research', 'exchange', '_rebaseline20', 'diag.log');
const w = (m: string): void => { appendFileSync(LOG, m + '\n'); /* eslint-disable-next-line no-console */ console.log(m); };

describe('rebaseline diag — tangled vertex-on-surface under honest foot', () => {
  it.skipIf(process.env.PF_REBASEDIAG !== '1')('Gyroid/Voronoi/HexHive vertex honest-foot', () => {
    for (const s of ['GyroidManifold', 'Voronoi', 'HexagonalHive']) {
      const dir = join('research', 'exchange', '_best20', 'heatmap');
      const { xyz } = loadBinMesh(join(dir, `${s}.xyz.bin`), join(dir, `${s}.idx.bin`));
      const rA = buildRadiusFn(s as StyleId, {}, DIMS);
      const t0 = Date.now();
      const v = vertexOnSurfaceCheck(xyz, rA, DIMS.H, 300);
      w(`[${s}] honest-foot vtx-on-surface: max=${v.maxVertMm.toFixed(5)} p99=${v.p99VertMm.toFixed(5)}mm (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
    expect(true).toBe(true);
  }, 30 * 60 * 1000);
});
