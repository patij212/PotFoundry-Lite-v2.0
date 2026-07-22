/**
 * deviationNanGuard.test.ts — TDD for the NaN-poisoning bug in accumulateDeviation
 * (analyticSurfaceGate.ts). A non-finite deviation (an rAnalytic that returns NaN
 * at a recovered (θ,z) while the mesh vertices themselves are finite — the measured
 * SFB reference mismatch) is pushed into the `devs` array unguarded, poisoning the
 * sort → p99DevMm and the sum → rmsDevMm become NaN. The honest contract is: skip
 * the non-finite sample and COUNT it in `nonFiniteCount` (the documented
 * "DO NOT gate on this result" signal), leaving max/p99/rms finite.
 *
 * Vertices are placed with a GOOD reference (all finite, so they pass the existing
 * vertex finite-check), but the metric is handed a reference that is NaN in a z
 * band — so the CHORD/VERTEX deviations there go NaN without any non-finite vertex.
 *
 * Pure CPU, read-only imports, no production change.
 */
import { describe, it, expect } from 'vitest';
import { perpendicular3DDeviation, type AnalyticRadiusFn } from './analyticSurfaceGate';

const TAU = 2 * Math.PI;
const H = 120;

/** A cylinder grid mesh (all vertices finite) with the parallel (u,t,sid=0) stash. */
function buildCylinderMesh(nu: number, nt: number, R: number): {
  mesh: { vertices: Float32Array; indices: Uint32Array };
  ut: Float32Array;
} {
  const nUv = nu + 1, nTv = nt + 1;
  const ut: number[] = [], v: number[] = [];
  for (let it = 0; it < nTv; it++) {
    const t = it / nt;
    for (let iu = 0; iu < nUv; iu++) {
      const u = iu / nu;
      const th = TAU * u, z = t * H;
      ut.push(u, t, 0);
      v.push(R * Math.cos(th), R * Math.sin(th), z);
    }
  }
  const idx: number[] = [];
  for (let it = 0; it < nt; it++) {
    for (let iu = 0; iu < nu; iu++) {
      const a = it * nUv + iu, b = a + 1, c = a + nUv, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  }
  return {
    mesh: { vertices: Float32Array.from(v), indices: Uint32Array.from(idx) },
    ut: Float32Array.from(ut),
  };
}

describe('accumulateDeviation — non-finite reference must not poison the aggregate', () => {
  const R = 50;
  // Reference that is NaN in a z band [55,65] but finite (== R) elsewhere. The mesh
  // vertices are placed with the finite R, so no vertex is non-finite; only the
  // deviations at recovered z in the band go NaN.
  const nanBandRef: AnalyticRadiusFn = (_theta, z) => (z > 55 && z < 65 ? NaN : R);

  it('rmsDevMm and p99DevMm stay finite when the reference is NaN in a band', () => {
    const { mesh, ut } = buildCylinderMesh(48, 48, R);
    const res = perpendicular3DDeviation(mesh, ut, nanBandRef, {
      H, tolMm: 0.01, seamExclU: 0, denseN: 6,
    });
    // The honest contract: the aggregate stays finite (the NaN samples are skipped),
    expect(Number.isFinite(res.rmsDevMm)).toBe(true);
    expect(Number.isFinite(res.p99DevMm)).toBe(true);
    expect(Number.isFinite(res.maxDevMm)).toBe(true);
    // and the non-finite samples are COUNTED so the caller knows not to gate.
    expect(res.nonFiniteCount).toBeGreaterThan(0);
  });

  it('a fully-finite reference is unaffected (guard is a no-op on the happy path)', () => {
    const { mesh, ut } = buildCylinderMesh(32, 32, R);
    const finiteRef: AnalyticRadiusFn = () => R;
    const res = perpendicular3DDeviation(mesh, ut, finiteRef, {
      H, tolMm: 0.01, seamExclU: 0, denseN: 6,
    });
    expect(res.nonFiniteCount).toBe(0);
    // A perfect cylinder mesh has its VERTICES exactly on the reference circle ⇒ the
    // vertex (placement) channel reads the f32 floor. (maxDevMm includes the chord
    // channel, which legitimately carries the polygon's ~0.24mm facet sagitta.)
    expect(Number.isFinite(res.rmsDevMm)).toBe(true);
    expect(res.vertexMaxMm).toBeLessThan(1e-3);
  });
});
