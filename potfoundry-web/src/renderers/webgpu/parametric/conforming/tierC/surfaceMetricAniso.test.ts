/**
 * surfaceMetricAniso.test.ts — E-2026-07-19-DS-CONVERGE-B fast guard (PF-ungated).
 *
 * Guards the OPT-IN anisotropic (II,I) curvature metric + metric-in-circle flip added to the region kernel:
 *  1. BYTE-IDENTICAL OFF — `buildMetricMesh` with `aniso` omitted === `aniso:false` (bit-identical ut + indices).
 *     The aniso branch is opt-in ⇒ the default region path (and thus flag-off production) is unchanged.
 *  2. MECHANISM — `anisoCurvatureMetric` on a CYLINDER (curved around θ, FLAT along z) is positive-definite,
 *     axis-aligned (M01≈0), and DIRECTIONAL: the effective edge target along the flat z-axis is much COARSER than
 *     around the curved θ-axis (h_z ≫ h_θ), i.e. it sizes each principal direction by ITS OWN curvature — the whole
 *     point vs the isotropic g/h² (which would size z by the θ-curvature too).
 *  3. SOUND — `buildMetricMesh` with `aniso:true` on a small directional-relief surface builds a non-empty mesh
 *     with no zero-area faces and finite coordinates (the metric-in-circle flip does not produce degenerates).
 */
import { describe, it, expect } from 'vitest';
import { buildMetricMesh, type MetricMeshOpts } from './regionMetric';
import { buildSurfaceMetricField, anisoCurvatureMetric } from './surfaceMetricField';
import type { AnalyticRadiusFn } from '../../../../../fidelity/analyticSurfaceGate';
import { buildAnalyticRadiusFn } from '../../../../../geometry/analyticRadius';
import type { StyleId } from '../../../../../geometry/types';

const H = 120;
// Cylinder: r constant ⇒ curved around θ (κ=1/R), flat along z (κ=0).
const cyl: AnalyticRadiusFn = () => 45;
// Small directional relief: an axial ripple (curvature in z), gentle azimuth term — exercises off-axis principals.
const relief: AnalyticRadiusFn = (th, z) => 45 + 1.5 * Math.sin((6 * Math.PI * z) / H) + 0.4 * Math.cos(4 * th);

const BASE: MetricMeshOpts = {
  tolMm: 0.02, hMin: 0.05, hMax: 8, sizeRes: 24, gradeBeta: 0.2, maxPoints: 4000, guardManifoldAlways: true,
};

function zeroAreaOrNonFinite(ut: number[], idx: Uint32Array): number {
  let bad = 0;
  for (let i = 0; i < ut.length; i++) if (!Number.isFinite(ut[i])) return 1e9;
  for (let f = 0; f < idx.length / 3; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const area2 = Math.abs((ut[2 * b] - ut[2 * a]) * (ut[2 * c + 1] - ut[2 * a + 1]) - (ut[2 * c] - ut[2 * a]) * (ut[2 * b + 1] - ut[2 * a + 1]));
    if (area2 < 1e-14) bad++;
  }
  return bad;
}

describe('Tier-C anisotropic (II,I) region metric', () => {
  it('is byte-identical when aniso is off (omitted === false)', () => {
    const off = buildMetricMesh(relief, H, BASE);
    const offExplicit = buildMetricMesh(relief, H, { ...BASE, aniso: false });
    expect(offExplicit.ut.length).toBe(off.ut.length);
    expect(offExplicit.indices.length).toBe(off.indices.length);
    for (let i = 0; i < off.ut.length; i++) expect(offExplicit.ut[i]).toBe(off.ut[i]);
    for (let i = 0; i < off.indices.length; i++) expect(offExplicit.indices[i]).toBe(off.indices[i]);
  });

  it('anisoCurvatureMetric is PD, axis-aligned, and coarser along the flat z-axis than around curved θ', () => {
    // Interior point, away from the [0,1] borders.
    const M = anisoCurvatureMetric(cyl, H, 0.31, 0.47, 0.02, 0.05, 8, 0.0022);
    const [m00, m01, m11] = M;
    // Positive-definite.
    expect(m00).toBeGreaterThan(0);
    expect(m11).toBeGreaterThan(0);
    expect(m00 * m11 - m01 * m01).toBeGreaterThan(0);
    // Cylinder principals align with the (u,t) axes ⇒ near-diagonal metric.
    expect(Math.abs(m01)).toBeLessThan(1e-6 * Math.sqrt(m00 * m11) + 1e-9);
    // Effective per-axis 3D edge target: E = |Su|² = (2πR)², G = |St|² = H². h_axis = sqrt(g_axis / M_axis).
    const E = (2 * Math.PI * 45) ** 2, G = H * H;
    const hTheta = Math.sqrt(E / m00);
    const hZ = Math.sqrt(G / m11);
    // z is the FLAT direction (κ≈0) ⇒ clamped to hMax (8mm); θ is curved (κ=1/45) ⇒ finite fine size ≪ hMax.
    expect(hZ).toBeGreaterThan(hTheta * 2); // strongly anisotropic: coarse along flat axis
    expect(hTheta).toBeLessThan(4); // θ resolves the R=45 curvature at tol 0.02 (~sqrt(8*0.02*45)=2.68mm)
  });

  it('the aniso grid field reduces to g/h² on the SAME diagonal metric only when curvature is isotropic', () => {
    // Compare the aniso grid vs the isotropic g/h² grid on the cylinder at an interior node: along the flat z-axis
    // the aniso metric MUST be strictly coarser (smaller M11) than the isotropic one (which sizes z by κmax_θ too).
    const aniso = buildSurfaceMetricField(cyl, H, { resU: 24, resT: 24, tolMm: 0.02, hMin: 0.05, hMax: 8, aniso: true, curvatureFineStep: 0.0022 });
    const iso = buildSurfaceMetricField(cyl, H, { resU: 24, resT: 24, tolMm: 0.02, hMin: 0.05, hMax: 8, curvatureFineStep: 0.0022 });
    const node = (11 * 24 + 7) * 3; // interior node
    // M00 (θ) comparable (both size θ by the same κ); M11 (z) far smaller for aniso (flat ⇒ coarse).
    expect(aniso.m[node + 2]).toBeLessThan(iso.m[node + 2] * 0.5);
  });

  it('aniso:true builds a sound mesh (no zero-area faces, finite coords, non-empty)', () => {
    const on = buildMetricMesh(relief, H, { ...BASE, aniso: true, curvatureFineStep: 0.0022, chordTolMm: 0.02, chordSampleN: 8 });
    expect(on.indices.length).toBeGreaterThan(0);
    expect(zeroAreaOrNonFinite(on.ut, on.indices)).toBe(0);
  });
});

// ── eigSym2 near-diagonal regression (2026-08-01, the S23-M STAGE 0 measured defect) ──────────────────
// The legacy eigSym2 picked the l1-eigenvector as (b, l1-a), guarded only by |b| > 1e-300. On a
// near-diagonal first fundamental form BOTH components sit at the f64 rounding floor (l1-a carries
// ~1e-16*|a| of cancellation error against a true value of order b²/(a-c)), so the principal directions
// exchange/rotate at noise scale — the (theta,z)-chart face of this is s23mPreflight's measured
// kappa2 = -38.06 where the true value is -9.4e-12. Measured through THIS kernel on the SAME surface
// (GothicArches H120/Rb40/Rt50 defaults, near-cylindrical wall at z=14.935, certified fineStep 0.0022):
// the flat-axis edge target h_z reads 3.72mm where the correct answer is the hMax clamp 8.0mm (implied
// |kappa2| 5.8e-3 vs the 1.25e-3 clamp floor — mu2 off its clamp), and the tensor moves 4.1e-3 relative
// under a 1-part-in-1e12 hFD perturbation. The fix is the s23mPreflight "DECLARED ADAPTATION 3" stable
// assembly: M = SUM_i mu_i (I v_i)(I v_i)^T / (v_i^T I v_i) from the (II, I) generalized eigenproblem,
// no matrix square root, no nested eigen-decomposition.
describe('anisoCurvatureMetric near-diagonal numerical soundness (S23-M eigSym2 defect)', () => {
  const gothic = buildAnalyticRadiusFn('GothicArches' as StyleId, {}, { H, Rb: 40, Rt: 50, expn: 1 });
  const TOL = 0.01, HMIN = 0.02, HMAX = 8, HFD = 0.0022; // the E-2026-07-19-DS-CONVERGE-B certified config
  const T0 = 14.935075 / H;
  type S2 = [number, number, number];

  // FD twin of the kernel's own fundamental-form block (same stencils, same single step, same clamping).
  function formsAt(u: number, t: number, hFD: number): { I: S2; II: S2 } {
    const TAU = 2 * Math.PI;
    const S = (uu: number, tt: number): [number, number, number] => {
      const th = TAU * uu, z = tt * H, r = gothic(th, z);
      return [r * Math.cos(th), r * Math.sin(th), z];
    };
    type V3 = [number, number, number];
    const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const uu = Math.min(Math.max(u, hFD), 1 - hFD), tt = Math.min(Math.max(t, hFD), 1 - hFD);
    const c = S(uu, tt);
    const Su = (sub(S(uu + hFD, tt), S(uu - hFD, tt)).map((v) => v / (2 * hFD)) as V3);
    const St = (sub(S(uu, tt + hFD), S(uu, tt - hFD)).map((v) => v / (2 * hFD)) as V3);
    const Suu = (sub(sub(S(uu + hFD, tt), c), sub(c, S(uu - hFD, tt))).map((v) => v / (hFD * hFD)) as V3);
    const Stt = (sub(sub(S(uu, tt + hFD), c), sub(c, S(uu, tt - hFD))).map((v) => v / (hFD * hFD)) as V3);
    const pp = S(uu + hFD, tt + hFD), pm = S(uu + hFD, tt - hFD), mp = S(uu - hFD, tt + hFD), mm_ = S(uu - hFD, tt - hFD);
    const Sut = ([0, 1, 2].map((k) => (pp[k] - pm[k] - mp[k] + mm_[k]) / (4 * hFD * hFD)) as V3);
    let n: V3 = [Su[1] * St[2] - Su[2] * St[1], Su[2] * St[0] - Su[0] * St[2], Su[0] * St[1] - Su[1] * St[0]];
    const nl = Math.hypot(n[0], n[1], n[2]);
    n = [n[0] / nl, n[1] / nl, n[2] / nl];
    return { I: [dot(Su, Su), dot(Su, St), dot(St, St)], II: [dot(Suu, n), dot(Sut, n), dot(Stt, n)] };
  }

  // Stable generalized eigenvalues of det(A - k B) = 0, B SPD — the reading ruler for both (II,I) truth
  // and the implied principal sizes of a returned metric (M v = mu I v).
  function genEig(A: S2, B: S2): [number, number] {
    const qa = B[0] * B[2] - B[1] * B[1];
    const qb = -(B[0] * A[2] + B[2] * A[0] - 2 * B[1] * A[1]);
    const qc = A[0] * A[2] - A[1] * A[1];
    const disc = Math.sqrt(Math.max(0, qb * qb - 4 * qa * qc));
    const qq = -0.5 * (qb + (qb >= 0 ? disc : -disc));
    const k1 = qq !== 0 ? qq / qa : -qb / (2 * qa);
    const k2 = qq !== 0 ? qc / qq : -qb / (2 * qa);
    return [k1, k2];
  }

  it('keeps the flat principal on the hMax clamp across the near-diagonal Gothic wall (kappa2 ~ 0, directions not exchanged)', () => {
    const floorK = (8 * TOL) / (HMAX * HMAX); // the muMin clamp in implied-|kappa| units (1.25e-3)
    let scored = 0;
    for (let i = 0; i <= 32; i++) {
      const u = 0.0095 + i * 6.25e-5;
      const { I, II } = formsAt(u, T0, HFD);
      const [kT1, kT2] = genEig(II, I);
      if (Math.min(Math.abs(kT1), Math.abs(kT2)) > 1e-6) continue; // score only genuinely flat-second-principal points
      scored++;
      const M = anisoCurvatureMetric(gothic, H, u, T0, TOL, HMIN, HMAX, HFD);
      // The flat direction must land ON the hMax clamp: h_z = sqrt(G/M11) — defective reads down to 3.7mm.
      const hZ = Math.sqrt(I[2] / M[2]);
      expect(hZ).toBeGreaterThanOrEqual(0.99 * HMAX);
      // And the implied second principal must sit at the clamp floor, not 4.6x above it.
      const [mA, mB] = genEig(M, I);
      const impliedSmall = 8 * TOL * Math.min(Math.abs(mA), Math.abs(mB));
      expect(impliedSmall).toBeLessThanOrEqual(2 * floorK);
    }
    expect(scored).toBeGreaterThan(24); // the window is a flat wall stretch — the gate must not de-fang the test
  });

  it('is a stable function of its own hFD input (1e-12 relative perturbation moves the tensor < 1e-8)', () => {
    const u0 = 5.706267 / (2 * Math.PI), t0 = 14.935075 / H; // the S23-M measured point
    const base = anisoCurvatureMetric(gothic, H, u0, t0, TOL, HMIN, HMAX, HFD);
    for (const k of [1, 2, 5, 10, 20, 50, 100]) {
      const pert = anisoCurvatureMetric(gothic, H, u0, t0, TOL, HMIN, HMAX, HFD * (1 + k * 1e-13));
      const scale = Math.max(Math.abs(base[0]), Math.abs(base[1]), Math.abs(base[2]), Math.abs(pert[0]), Math.abs(pert[1]), Math.abs(pert[2]));
      const rel = Math.max(Math.abs(pert[0] - base[0]), Math.abs(pert[1] - base[1]), Math.abs(pert[2] - base[2])) / scale;
      expect(rel).toBeLessThan(1e-8);
    }
  });
});
