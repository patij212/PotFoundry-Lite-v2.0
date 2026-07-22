/**
 * measureRadialFidelity.test.ts — TDD for the unified radial fidelity ruler: ONE
 * entry that measures a mesh against the exact analytic surface with the
 * GLOBALLY-CORRECT projector (no wrong-well overstatement), reports the full
 * MAX-first distance distribution + triangle quality, and certifies on MAX
 * (never p99). Watertightness is a separate ruler (topologyMetric) by design.
 *
 * Pure CPU, read-only imports, no production change.
 */
import { describe, it, expect } from 'vitest';
import { measureRadialFidelity } from './measureRadialFidelity';
import { type AnalyticRadiusFn } from './analyticSurfaceGate';
import { buildAnalyticRadiusFn } from '../geometry/analyticRadius';
import type { StyleId } from '../geometry/types';

const TAU = 2 * Math.PI;
const H = 120;

function buildGridMesh(nu: number, nt: number, rA: AnalyticRadiusFn): {
  mesh: { vertices: Float32Array; indices: Uint32Array }; ut: Float32Array;
} {
  const nUv = nu + 1, nTv = nt + 1;
  const ut: number[] = [], v: number[] = [];
  for (let it = 0; it < nTv; it++) {
    const t = it / nt;
    for (let iu = 0; iu < nUv; iu++) {
      const u = iu / nu, th = TAU * u, z = t * H, r = rA(th, z);
      ut.push(u, t, 0);
      v.push(r * Math.cos(th), r * Math.sin(th), z);
    }
  }
  const idx: number[] = [];
  for (let it = 0; it < nt; it++) for (let iu = 0; iu < nu; iu++) {
    const a = it * nUv + iu, b = a + 1, c = a + nUv, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  return { mesh: { vertices: Float32Array.from(v), indices: Uint32Array.from(idx) }, ut: Float32Array.from(ut) };
}

describe('measureRadialFidelity — unified MAX-first radial ruler', () => {
  it('reports MAX-first distance + quality and certifies on MAX vs tol', () => {
    const R = 50;
    const rA: AnalyticRadiusFn = () => R;
    const { mesh, ut } = buildGridMesh(64, 64, rA); // fine cylinder ⇒ small chord sagitta
    const rep = measureRadialFidelity(mesh, ut, rA, { H, tolMm: 0.05, denseN: 6 });

    // maxMm is the max of the two channels — the certification number.
    expect(rep.maxMm).toBeCloseTo(Math.max(rep.chordMaxMm, rep.vertexMaxMm), 10);
    // Vertices sit on the circle ⇒ vertex channel at the f32 floor.
    expect(rep.vertexMaxMm).toBeLessThan(1e-3);
    // Quality fields are populated (a regular grid ⇒ decent min angle).
    expect(rep.minAngleDeg).toBeGreaterThan(0);
    expect(Number.isFinite(rep.chordP99Mm)).toBe(true);
    expect(rep.nonFiniteCount).toBe(0);
    // A 64² cylinder's facet sagitta ≈ 50·(1−cos(π/64)) ≈ 0.06mm > 0.05 tol ⇒ NOT certified.
    expect(rep.certified).toBe(false);
    // Loosen the tolerance above the sagitta ⇒ certified.
    const rep2 = measureRadialFidelity(mesh, ut, rA, { H, tolMm: 0.1, denseN: 6 });
    expect(rep2.certified).toBe(true);
  });

  it('uses the globally-correct projector: chordMax is lower than single-seed on Gyroid', () => {
    const rA = buildAnalyticRadiusFn('GyroidManifold' as StyleId, {}, { H, Rb: 40, Rt: 50 });
    const { mesh, ut } = buildGridMesh(20, 20, rA); // coarse ⇒ facets chord across features (wrong-well bait)

    const globalRep = measureRadialFidelity(mesh, ut, rA, { H, tolMm: 0.01, denseN: 6, globalProjector: true });
    const singleRep = measureRadialFidelity(mesh, ut, rA, { H, tolMm: 0.01, denseN: 6, globalProjector: false });

    // The global projector removes the single-seed wrong-well overstatement, so the
    // reported chord MAX is strictly (and materially) lower — a more honest number.
    expect(globalRep.chordMaxMm).toBeLessThan(singleRep.chordMaxMm);
    expect(singleRep.chordMaxMm - globalRep.chordMaxMm).toBeGreaterThan(0.05);
  }, 120000);

  it('does NOT vacuously certify a mesh with no measured outer wall (samples===0)', () => {
    const rA: AnalyticRadiusFn = () => 50;
    // A single cap triangle: every vertex is surfaceId 2, so perpendicular3DDeviation
    // measures NO outer-wall (surfaceId 0) sample. A "certified" here would be vacuous —
    // an absent wall is not a faithful wall.
    const mesh = {
      vertices: Float32Array.from([50, 0, 100, 0, 50, 100, -50, 0, 100]),
      indices: Uint32Array.from([0, 1, 2]),
    };
    const ut = Float32Array.from([0, 1, 2, 0.33, 1, 2, 0.66, 1, 2]);
    const rep = measureRadialFidelity(mesh, ut, rA, { H, tolMm: 0.1, denseN: 3 });
    expect(rep.samples).toBe(0);
    expect(rep.wallTriangles).toBe(0);
    expect(rep.certified).toBe(false);
  });

  it('measures near-bar facets by the HONEST perpendicular (pre-filter scales below tol)', () => {
    // A steep cone r=40+3z: the facet interior chords radially inward, but the true
    // PERPENDICULAR distance is that sagitta / sqrt(1+3²) ≈ 1/3.16 of it. Density chosen
    // so the perpendicular chord is < 0.01mm (FAITHFUL) while the radial residual is
    // ABOVE 0.01mm. With the legacy 0.04mm pre-filter (above the bar), the facet is
    // recorded at its RADIAL over-estimate and FALSELY fails; scaling the pre-filter
    // below the bar runs the honest perpendicular scan and certifies it.
    const rA: AnalyticRadiusFn = (_t, z) => 40 + 3 * z;
    const { mesh, ut } = buildGridMesh(320, 16, rA);
    const opts = { H, tolMm: 0.01, denseN: 5 };

    const honest = measureRadialFidelity(mesh, ut, rA, opts);                    // default (tol-scaled) pre-filter
    const legacy = measureRadialFidelity(mesh, ut, rA, { ...opts, preFilterMm: 0.04 }); // legacy above-bar pre-filter
    // Measured: honest chordMax ≈ 0.0059mm (perpendicular) vs legacy ≈ 0.017mm (radial).

    // The honest ruler never reports MORE than the radial-over-estimating one.
    expect(honest.chordMaxMm).toBeLessThanOrEqual(legacy.chordMaxMm + 1e-9);
    // And it certifies this faithful steep cone (perpendicular < 0.01) that the
    // above-bar pre-filter falsely fails on the radial over-estimate.
    expect(honest.certified).toBe(true);
    expect(legacy.certified).toBe(false);
  }, 60000);
});
