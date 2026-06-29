// creaseAlignedMetric.test.ts — verify the (II,I) anisotropic chord metric.
//
// (1) Cylinder analytic anchor: pins the metric MAGNITUDE to closed form (I diagonal there, so it does NOT
//     distinguish correct-vs-broken — it only anchors numbers).
// (2) Brute-force chord consistency (the DISCRIMINATING test): on a SHEARED ripple (F≠0, skewed principal
//     directions), a unit-metric edge must yield a true facet→surface chord ≈ tol in EVERY direction. This is
//     exactly what the broken II-only metricField.ts fails on a skewed surface, and what the correct (II,I)
//     construction must pass.
import { describe, it, expect } from 'vitest';
import { buildCreaseAlignedMetric } from './creaseAlignedMetric';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
type V3 = [number, number, number];

/** 3D point on the radial surface S(u,t). */
function surf(rA: AnalyticRadiusFn, H: number, u: number, t: number): V3 {
  const th = TAU * u, z = t * H, r = rA(th, z);
  return [r * Math.cos(th), r * Math.sin(th), z];
}

/** Max distance from interior samples of the parameter edge to its straight 3D chord. */
function measuredChord(rA: AnalyticRadiusFn, H: number, u0: number, t0: number, u1: number, t1: number): number {
  const a = surf(rA, H, u0, t0), b = surf(rA, H, u1, t1);
  const ab: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  let maxD = 0;
  const N = 32;
  for (let i = 1; i < N; i++) {
    const s = i / N;
    const p = surf(rA, H, u0 + (u1 - u0) * s, t0 + (t1 - t0) * s);
    // distance from p to the infinite line a→b (chord is straight; endpoints lie on the surface)
    const ap: V3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const proj = len2 > 0 ? (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / len2 : 0;
    const cx = ap[0] - proj * ab[0], cy = ap[1] - proj * ab[1], cz = ap[2] - proj * ab[2];
    maxD = Math.max(maxD, Math.hypot(cx, cy, cz));
  }
  return maxD;
}

describe('buildCreaseAlignedMetric — (II,I) anisotropic chord metric', () => {
  it('(1) cylinder anchor: M00 ≈ π²R/(2·tol), M01 ≈ 0, M11 ≈ H²/hMax² (axial clamped, k2=0)', () => {
    const R = 45, H = 120, tol = 0.05, hMin = 0.5, hMax = 50;
    const rA: AnalyticRadiusFn = () => R;
    const RES = 65;
    const f = buildCreaseAlignedMetric(rA, H, { resU: RES, resT: RES, tolMm: tol, hMin, hMax });
    const iu = 32, it = 32, b = (it * RES + iu) * 3; // interior node
    const M00 = f.m[b], M01 = f.m[b + 1], M11 = f.m[b + 2];

    const expM00 = (Math.PI * Math.PI * R) / (2 * tol); // = E·μ1 = 4π²R²·(1/R)/(8·tol)
    const expM11 = (H * H) / (hMax * hMax);             // axial k2=0 ⇒ μ2 clamped to 1/hMax²
    expect(Math.abs(M00 / expM00 - 1)).toBeLessThan(0.02); // central-diff κ ≈1% low
    expect(Math.abs(M01)).toBeLessThan(1e-3 * M00);        // diagonal I ⇒ M01 ≈ 0
    expect(Math.abs(M11 / expM11 - 1)).toBeLessThan(0.02);
  });

  it('(2) brute-force chord: unit-metric edge ⇒ chord ≈ tol in every direction (sheared ripple)', () => {
    // Sheared ripple: r depends on BOTH θ and z with a cross term ⇒ F≠0, skewed principal directions.
    // hMax=5 keeps the coarse (flat-direction) edge inside the local-curvature regime: the ripple z-wavelength
    // is 2π·H/(4·6.283) ≈ 30mm, so a flat-direction edge ≤ ~λ/6 stays in the chord-model-valid band (with the
    // default hMax=50 a flat-direction edge outruns the ripple and the curvature-Taylor model breaks down by
    // construction — that is NOT a metric defect: the cylinder anchor (test 1) proves the construction exact).
    // BAND: the measured chord ∈ [tol/8, 4·tol] for every direction. The UPPER bound (4·tol) is the strong
    // discriminator — the broken II-only metricField.ts overshoots it by ~100× here (median chord ≈ 558·tol,
    // measured). The lower tail (~0.18·tol) is the off-principal OVER-refinement intrinsic to any anisotropic
    // metric (pure-u is between the two principal directions, so its true normal curvature < k1 ⇒ chord < tol);
    // it is conservative (chord ≤ tol = fidelity guaranteed) and hMax-independent, so we hold it to the spec's
    // tol/8 sanity floor rather than tol/4.
    const H = 120, tol = 0.05, hMin = 0.5, hMax = 5;
    const rA: AnalyticRadiusFn = (theta, z) => 45 + 6 * Math.sin(3 * theta + 4 * (z / H) * 6.283);
    const RES = 129; // fine grid so the central-difference metric is accurate
    const f = buildCreaseAlignedMetric(rA, H, { resU: RES, resT: RES, tolMm: tol, hMin, hMax });

    // Bilinear sample of the packed metric at fractional (u,t).
    const sampleM = (u: number, t: number): [number, number, number] => {
      const fu = u * (RES - 1), ft = t * (RES - 1);
      const iu0 = Math.min(Math.max(Math.floor(fu), 0), RES - 2), it0 = Math.min(Math.max(Math.floor(ft), 0), RES - 2);
      const au = fu - iu0, at = ft - it0;
      const g = (iu: number, it: number, k: number): number => f.m[(it * RES + iu) * 3 + k];
      const lerp = (k: number): number =>
        (1 - au) * (1 - at) * g(iu0, it0, k) + au * (1 - at) * g(iu0 + 1, it0, k)
        + (1 - au) * at * g(iu0, it0 + 1, k) + au * at * g(iu0 + 1, it0 + 1, k);
      return [lerp(0), lerp(1), lerp(2)];
    };

    const nodes: Array<[number, number]> = [[0.31, 0.42], [0.5, 0.5], [0.67, 0.33], [0.23, 0.61]];
    const dirs: Array<[number, number]> = [];
    for (let k = 0; k < 12; k++) { const a = (Math.PI * k) / 12; dirs.push([Math.cos(a), Math.sin(a)]); }

    const ratios: number[] = [];
    for (const [u0, t0] of nodes) {
      const [M00, M01, M11] = sampleM(u0, t0);
      for (const [dx, dy] of dirs) {
        // metric length of the raw direction: √(dᵀ M d)
        const Lm = Math.sqrt(M00 * dx * dx + 2 * M01 * dx * dy + M11 * dy * dy);
        if (!(Lm > 0)) continue;
        let du = dx / Lm, dt = dy / Lm; // unit-metric edge vector
        // keep the edge inside [0,1]²: flip sign if an endpoint would exit
        if (u0 + du < 0 || u0 + du > 1) du = -du;
        if (t0 + dt < 0 || t0 + dt > 1) dt = -dt;
        if (u0 + du < 0 || u0 + du > 1 || t0 + dt < 0 || t0 + dt > 1) continue; // still out → skip
        const chord = measuredChord(rA, H, u0, t0, u0 + du, t0 + dt);
        ratios.push(chord / tol);
        expect(chord).toBeGreaterThanOrEqual(tol / 8); // conservative off-principal over-refinement floor
        expect(chord).toBeLessThanOrEqual(4 * tol);    // discriminator: broken II-only metric blows this by ~100×
      }
    }
    // sanity: we actually exercised many direction/node pairs, and the CENTRAL tendency is chord ≈ tol
    expect(ratios.length).toBeGreaterThan(30);
    const sorted = [...ratios].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    expect(median).toBeGreaterThan(0.5); // a correct metric centers on tol, NOT 100×tol (the broken metric)
    expect(median).toBeLessThan(2);
  });
});
