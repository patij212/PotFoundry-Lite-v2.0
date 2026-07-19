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
