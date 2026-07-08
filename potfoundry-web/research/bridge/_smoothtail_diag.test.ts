// _smoothtail_diag.test.ts — DEV-ONLY (PF_SMOOTHDIAG=1). Diagnose the Ripple/Harmonic residual outliers: are the
// kernel's 4-pt SAME-(u,t) chordSag guard blind to what the 45-pt true-3D acceptance ruler catches?
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import {
  buildRadiusFn, buildInhouseMetricMesh, liftUtToRadial, projectPointToRadialSurface, type StyleDims,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_SMOOTHDIAG === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H, TAU = 2 * Math.PI;
const RECIPE = {
  tolMm: 0.004, hMin: 0.006, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14,
  maxPoints: 3_000_000, splitThresh: 1.5, optimizeSweeps: 2,
  guardManifoldAlways: true, chordTolMm: 0.004, chordSteiner: true,
} as const;

function denseBary(n: number): Array<[number, number, number]> {
  const B: Array<[number, number, number]> = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j + i <= n; j++) B.push([i / n, j / n, (n - i - j) / n]);
  return B;
}
const D45 = denseBary(8);
const B4: Array<[number, number, number]> = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];

function count45Outliers(ut: number[], idx: Uint32Array, xyz: Float32Array, rA: (th: number, z: number) => number): { n: number; max: number } {
  let n = 0, max = 0;
  for (let f = 0; f < idx.length / 3; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let t3d = 0;
    for (const [w0, w1, w2] of D45) {
      const px = w0 * ax + w1 * bx + w2 * cx, py = w0 * ay + w1 * by + w2 * cy, pz = w0 * az + w1 * bz + w2 * cz;
      // cheap same-(u,t) bound first
      const d = projectPointToRadialSurface(px, py, pz, rA, { coarseTrigger: 0.02, maxIter: 40 }).dist;
      if (d > t3d) t3d = d;
    }
    if (t3d > 0.01) { n++; if (t3d > max) max = t3d; }
  }
  return { n, max };
}

describe('SMOOTH-TAIL DIAG', () => {
  // discriminator: does optimizeSweeps / curvatureFineStep drive the residual?
  for (const style of ['RippleInterference', 'HarmonicRipple'] as StyleId[]) {
    it.skipIf(!RUN)(`sweep-discriminator ${style}`, () => {
      const rA = buildRadiusFn(style, {}, DIMS);
      for (const variant of [
        { name: 'base(sw2,cs8)', o: {} },
        { name: 'sweeps0', o: { optimizeSweeps: 0 } },
        { name: 'sweeps1', o: { optimizeSweeps: 1 } },
        { name: 'fineStep', o: { curvatureFineStep: 0.002, curvatureSubsamples: 5 } },
        { name: 'sizeRes512', o: { sizeRes: 512 } },
      ]) {
        const mesh = buildInhouseMetricMesh(rA, H, { ...RECIPE, chordSampleN: 8, chordTolMm: 0.008, ...variant.o });
        const xyz = liftUtToRadial(mesh.ut, rA, H).vertices;
        const r = count45Outliers(mesh.ut, mesh.indices, xyz, rA);
        // eslint-disable-next-line no-console
        console.log(`[${style} ${variant.name}] tris=${mesh.indices.length / 3} outliers45=${r.n} max=${r.max.toFixed(4)}`);
      }
      expect(true).toBe(true);
    }, 60 * 60 * 1000);
  }
  for (const style of ['RippleInterference', 'HarmonicRipple'] as StyleId[]) {
    it.skipIf(!RUN)(`diag ${style}`, () => {
      const rA = buildRadiusFn(style, {}, DIMS);
      const mesh = buildInhouseMetricMesh(rA, H, RECIPE);
      const ut = mesh.ut, idx = mesh.indices;
      const xyz = liftUtToRadial(ut, rA, H).vertices;
      const liftP = (u: number, t: number): [number, number, number] => { const th = TAU * u, z = t * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
      // 45-pt true-3D nearest per facet; kernel 4-pt SAME-(u,t) chord per facet; area + longest-edge.
      const nF = idx.length / 3;
      let printed = 0;
      for (let f = 0; f < nF && printed < 12; f++) {
        const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
        const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
        const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
        const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
        // 45-pt true-3D nearest
        let t3d = 0;
        for (const [w0, w1, w2] of D45) {
          const px = w0 * ax + w1 * bx + w2 * cx, py = w0 * ay + w1 * by + w2 * cy, pz = w0 * az + w1 * bz + w2 * cz;
          const d = projectPointToRadialSurface(px, py, pz, rA, { coarseTrigger: 0.02, maxIter: 40 }).dist;
          if (d > t3d) t3d = d;
        }
        if (t3d <= 0.01) continue;
        // kernel 4-pt SAME-(u,t) chord (facet-plane distance)
        let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
        if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
        const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
        let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        let chord4 = 0, chord45 = 0;
        for (const [w0, w1, w2] of B4) {
          const p = liftP(w0 * ua + w1 * ub + w2 * uc, w0 * ta + w1 * tb + w2 * tc);
          const d = Math.abs((p[0] - ax) * nx + (p[1] - ay) * ny + (p[2] - az) * nz);
          if (d > chord4) chord4 = d;
        }
        for (const [w0, w1, w2] of D45) {
          const p = liftP(w0 * ua + w1 * ub + w2 * uc, w0 * ta + w1 * tb + w2 * tc);
          const d = Math.abs((p[0] - ax) * nx + (p[1] - ay) * ny + (p[2] - az) * nz);
          if (d > chord45) chord45 = d;
        }
        const eMax = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - bx, cy - by, cz - bz), Math.hypot(ax - cx, ay - cy, az - cz));
        // eslint-disable-next-line no-console
        console.log(`[${style} f=${f}] true3d45=${t3d.toFixed(4)} chordSAME4=${chord4.toFixed(4)} chordSAME45=${chord45.toFixed(4)} edgeMax=${eMax.toFixed(3)}mm z=${az.toFixed(1)} u=${(ua % 1).toFixed(3)}`);
        printed++;
      }
      // eslint-disable-next-line no-console
      console.log(`[${style}] printed ${printed} outlier facets`);
      expect(true).toBe(true);
    }, 60 * 60 * 1000);
  }
});
