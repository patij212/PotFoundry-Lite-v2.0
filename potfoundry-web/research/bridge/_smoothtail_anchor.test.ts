// _smoothtail_anchor.test.ts — DEV-ONLY (PF_SMOOTHANCHOR=1). INSTRUMENT-MATCH GATE for E-2026-07-08-SMOOTH-TAILS.
// Re-score the persisted _best20 reaching bins with scoreWholeMeshBVH (dense 45-pt + radial prefilter, twin 3072^2)
// to reproduce the §V10b FINAL baseline (Wave 2 / Fourier 20 / Ripple 82 / Harmonic 93) BEFORE trusting close numbers.
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { scoreWholeMeshBVH, loadBinMesh } from './_pf_bvhRuler';

const RUN = process.env.PF_SMOOTHANCHOR === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const BEST20 = join('research', 'exchange', '_best20', 'heatmap');
const TWIN = { nTheta: 3072, nZ: 3072 };

const STYLES: StyleId[] = ['WaveInterference', 'FourierBloom', 'RippleInterference', 'HarmonicRipple'] as unknown as StyleId[];

describe('SMOOTH-TAIL ANCHOR — reproduce the V10b dense-basis baseline on the persisted _best20 bins', () => {
  for (const style of STYLES) {
    it.skipIf(!RUN)(`anchor ${style}`, () => {
      const { xyz, idx } = loadBinMesh(join(BEST20, `${style}.xyz.bin`), join(BEST20, `${style}.idx.bin`));
      const rA = buildRadiusFn(style, {}, DIMS);
      const t0 = Date.now();
      const r = scoreWholeMeshBVH(xyz, idx, rA, H, TWIN, { tol: 0.01, radialPrefilter: true, twinValidate: 'sub' });
      // eslint-disable-next-line no-console
      console.log(`[ANCHOR ${style}] tris=${idx.length / 3} outliers=${r.interiorOutliers} max=${r.wholeMeshMaxMm} p99=${r.p99} twinOnSurf=${r.twinOnSurfMaxMm} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      expect(true).toBe(true);
    }, 60 * 60 * 1000);
  }
});
