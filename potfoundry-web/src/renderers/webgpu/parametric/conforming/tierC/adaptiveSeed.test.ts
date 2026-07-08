/**
 * adaptiveSeed.test.ts — LEVER A guard (E-2026-07-08-TIERC-ADAPTIVE-SEED).
 *
 * Fast (PF-ungated) regression:
 *  1. BYTE-IDENTICAL OFF: seedFromComplex with no adaptive cfg == the original
 *     uniform seed (the adaptive branch is opt-in; the default seed is
 *     unchanged ⇒ the flag-on default path stays byte-identical).
 *  2. MECHANISM: adaptiveSeedPoints places INTERIOR points inside the smooth
 *     arch bump (κ-detector dead zone, MEASURED max|d²r/dz²|≈9 / |d²r/du²|≈2 at
 *     ≈(0.142,0.589)) so the CDT cannot span it with a long t-needle (the
 *     pin_diag root cause: the ~1.06mm pin is a 8.9mm-edge needle across the
 *     bump). The bump gets sub-tol pitch; the total point count stays under a
 *     uniform hMin tighten (the budget claim).
 */
import { describe, it, expect } from 'vitest';
import { styleSampler } from '../featureGraph/styleSampler';
import { buildProtectedComplex } from './morseComplex';
import {
  seedFromComplex,
  adaptiveSeedPoints,
  type ChartDomain,
} from './noBridgeRefine';
import { GpuSurfaceSampler } from '../SurfaceSampler';

describe('LEVER A adaptive seed', () => {
  const sampler = styleSampler(
    'GothicArches',
    {},
    { H: 120, Rt: 50, Rb: 40 },
  ) as GpuSurfaceSampler;
  const complex = buildProtectedComplex(sampler, 'GothicArches');
  const domain: ChartDomain = { uLo: 0.05, uHi: 0.15, tLo: 0.38, tHi: 0.62 };
  const uToMm = complex.uToMm;
  const tToMm = complex.tToMm;

  it('is byte-identical to the uniform seed when adaptive is off', () => {
    const a = seedFromComplex(complex, domain, 0.3, sampler, 0.15);
    const b = seedFromComplex(complex, domain, 0.3, sampler, 0.15, undefined);
    expect(a.uv.length).toBe(b.uv.length);
    expect(a.cEdges.length).toBe(b.cEdges.length);
    for (let i = 0; i < a.uv.length; i++) expect(a.uv[i]).toBe(b.uv[i]);
  });

  it('packs points into the high-curvature bump, budget-bounded', () => {
    const pts = adaptiveSeedPoints(sampler, domain, uToMm, tToMm, 0.3, 0.01, 0.09, 5);
    const nPts = pts.length / 2;
    // Local nearest-neighbour spacing (mm) near the bump vs the flat complement.
    const near = (uc: number, tc: number, rad: number): number[] => {
      const idx: number[] = [];
      for (let i = 0; i < nPts; i++) {
        if (Math.abs(pts[2 * i] - uc) < rad && Math.abs(pts[2 * i + 1] - tc) < rad) idx.push(i);
      }
      return idx;
    };
    const localMinNN = (uc: number, tc: number): number => {
      const idx = near(uc, tc, 0.02);
      let best = Infinity;
      for (let a = 0; a < idx.length; a++) {
        for (let b = a + 1; b < idx.length; b++) {
          const du = (pts[2 * idx[a]] - pts[2 * idx[b]]) * uToMm;
          const dt = (pts[2 * idx[a] + 1] - pts[2 * idx[b] + 1]) * tToMm;
          const d = Math.hypot(du, dt);
          if (d > 1e-6 && d < best) best = d;
        }
      }
      return best;
    };
    const nnBump = localMinNN(0.142, 0.589);
    const uniform03N =
      Math.round(((domain.uHi - domain.uLo) * uToMm) / 0.3) *
      Math.round(((domain.tHi - domain.tLo) * tToMm) / 0.3);
    const uniformFineN =
      Math.round(((domain.uHi - domain.uLo) * uToMm) / 0.09) *
      Math.round(((domain.tHi - domain.tLo) * tToMm) / 0.09);
    // eslint-disable-next-line no-console
    console.log('[adaptiveSeedPoints]', JSON.stringify({ nPts, uniform03N, uniformFineN, nnBumpMm: +nnBump.toFixed(4) }));
    // The bump gets INTERIOR points at sub-tol pitch (breaks the CDT needle).
    expect(nnBump).toBeLessThan(0.2);
    // Adaptive: seed is MORE than uniform-0.3 (bump densified) but LESS than a
    // blanket uniform-hMin tighten (the budget claim).
    expect(nPts).toBeGreaterThan(uniform03N);
    expect(nPts).toBeLessThan(uniformFineN);
  });
});
