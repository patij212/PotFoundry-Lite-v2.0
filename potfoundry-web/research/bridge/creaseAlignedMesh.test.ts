// creaseAlignedMesh.test.ts — does meshing under the crease-aligned anisotropic metric resolve the crease at
// FEWER triangles with good IN-METRIC quality (vs the isotropic surface metric)? (PF_CREASEMESH=1.)
// Key: the crease mesh's triangles are intentionally anisotropic — judge them by the METRIC min-angle, not the
// isotropic 3D min-angle (which mislabels aligned triangles as slivers). Chord fidelity is the shared yardstick.
import { describe, it, expect } from 'vitest';
import { buildInhouseMetricMesh } from './inhouseMetricMesh';
import { buildCreaseAlignedMesh, metricMinAngleDeg } from './creaseAlignedMesh';
import { buildCreaseAlignedMetric } from './creaseAlignedMetric';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { liftUtToRadial } from './measure';
import { triangleQualityDistribution } from '../../src/fidelity/metrics';
import { perpendicular3DDeviation } from '../../src/fidelity/analyticSurfaceGate';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const SIZE_RES = 192, TOL = 0.006, HMIN = 0.02, HMAX = 8;
// smooth/extended-feature (HarmonicRipple: anisotropy wins big) vs sharp near-C0 creases (GyroidManifold:
// metric needs in-regime hMax + finer grid). See 2026-06-29-crease-kernel-findings.md.
const STYLES: StyleId[] = ['HarmonicRipple', 'GyroidManifold'] as StyleId[];

describe('crease-aligned kernel vs isotropic surface metric', () => {
  it.skipIf(!process.env.PF_CREASEMESH)('crease resolution + in-metric quality', () => {
    for (const STYLE of STYLES) {
    // eslint-disable-next-line no-console
    console.log(`\n## ${String(STYLE)}`);
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    // crease metric field + interp, for the in-metric quality measure
    const cmf = buildCreaseAlignedMetric(rA, DIMS.H, { resU: SIZE_RES, resT: SIZE_RES, tolMm: TOL, hMin: HMIN, hMax: HMAX });
    const metricAt = (u: number, t: number): [number, number, number] => {
      const fu = Math.min(Math.max(u, 0), 1) * (cmf.resU - 1), ft = Math.min(Math.max(t, 0), 1) * (cmf.resT - 1);
      const iu = Math.min(Math.floor(fu), cmf.resU - 2), it = Math.min(Math.floor(ft), cmf.resT - 2);
      const au = fu - iu, bt = ft - it, M = cmf.m;
      const c00 = (it * cmf.resU + iu) * 3, c10 = c00 + 3, c01 = ((it + 1) * cmf.resU + iu) * 3, c11 = c01 + 3;
      const w00 = (1 - au) * (1 - bt), w10 = au * (1 - bt), w01 = (1 - au) * bt, w11 = au * bt;
      return [M[c00] * w00 + M[c10] * w10 + M[c01] * w01 + M[c11] * w11, M[c00 + 1] * w00 + M[c10 + 1] * w10 + M[c01 + 1] * w01 + M[c11 + 1] * w11, M[c00 + 2] * w00 + M[c10 + 2] * w10 + M[c01 + 2] * w01 + M[c11 + 2] * w11];
    };
    const report = (label: string, ut: number[], idx: Uint32Array): void => {
      const lifted = liftUtToRadial(ut, rA, DIMS.H);
      const q = triangleQualityDistribution({ vertices: lifted.vertices, indices: idx });
      const dev = perpendicular3DDeviation({ vertices: lifted.vertices, indices: idx }, lifted.utFlat, rA, { H: DIMS.H, tolMm: TOL, seamExclU: 0, denseN: 3 });
      // in-metric min-angle distribution (the honest measure for anisotropic meshes)
      let mWorst = 180, mSum = 0, mBelow = 0, n = 0;
      for (let t = 0; t < idx.length; t += 3) { const ma = metricMinAngleDeg(ut, idx[t], idx[t + 1], idx[t + 2], metricAt); if (ma <= 0) continue; mWorst = Math.min(mWorst, ma); mSum += ma; if (ma < 20) mBelow++; n++; }
      // eslint-disable-next-line no-console
      console.log(`${label.padEnd(8)} tris=${(idx.length / 3).toString().padStart(7)} | chord rms=${dev.rmsDevMm.toFixed(4)} p99=${dev.p99DevMm.toFixed(4)} | ISO-3D mean=${q.meanMinAngleDeg.toFixed(1)} %<20=${q.pctBelow20.toFixed(1)} | IN-METRIC mean=${(mSum / n).toFixed(1)} worst=${mWorst.toFixed(1)} %<20=${(100 * mBelow / n).toFixed(1)}`);
    };

    const iso = buildInhouseMetricMesh(rA, DIMS.H, { tolMm: TOL, hMin: HMIN, hMax: HMAX, sizeRes: SIZE_RES, gradeBeta: 0.2, seedN: 12, maxPoints: 1_500_000, splitThresh: 1.5, optimizeSweeps: 3 });
    report('iso', iso.ut, iso.indices);
    const cr = buildCreaseAlignedMesh(rA, DIMS.H, { tolMm: TOL, hMin: HMIN, hMax: HMAX, sizeRes: SIZE_RES, seedN: 12, maxPoints: 1_500_000, splitThresh: 1.5 });
    report('crease', cr.ut, cr.indices);
    expect(cr.indices.length).toBeGreaterThan(0);
    }
  }, 25 * 60 * 1000);
});
