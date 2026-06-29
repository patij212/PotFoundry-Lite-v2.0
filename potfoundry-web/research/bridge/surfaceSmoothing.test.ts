// surfaceSmoothing.test.ts — the on-surface smoothing pass must (1) pin the patch boundary, (2) keep every
// vertex inside [0,1]², and (3) actually improve 3D triangle quality on a jittered mesh.
import { describe, it, expect } from 'vitest';
import { smoothSurfaceOnRadial } from './surfaceSmoothing';
import { liftUtToRadial } from './measure';
import { triangleQualityDistribution } from '../../src/fidelity/metrics';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

// Build a structured triangulated grid over (u,t) ∈ [0,1]², N×N vertices, two triangles per cell.
function gridMesh(N: number): { ut: number[]; indices: number[] } {
  const ut: number[] = [];
  for (let it = 0; it < N; it++) for (let iu = 0; iu < N; iu++) { ut.push(iu / (N - 1), it / (N - 1)); }
  const indices: number[] = [];
  const idx = (iu: number, it: number): number => it * N + iu;
  for (let it = 0; it < N - 1; it++) for (let iu = 0; iu < N - 1; iu++) {
    indices.push(idx(iu, it), idx(iu + 1, it), idx(iu + 1, it + 1));
    indices.push(idx(iu, it), idx(iu + 1, it + 1), idx(iu, it + 1));
  }
  return { ut, indices };
}

describe('smoothSurfaceOnRadial', () => {
  const R = 45, H = 120;
  const rA: AnalyticRadiusFn = () => R;

  it('pins the patch boundary and keeps all vertices in [0,1]²', () => {
    const N = 7;
    const { ut, indices } = gridMesh(N);
    // jitter interior vertices
    const j = ut.slice();
    for (let it = 1; it < N - 1; it++) for (let iu = 1; iu < N - 1; iu++) {
      const v = it * N + iu; j[2 * v] += (((iu * 7 + it) % 5) - 2) * 0.02; j[2 * v + 1] += (((iu + it * 3) % 5) - 2) * 0.02;
    }
    const out = smoothSurfaceOnRadial(j, indices, rA, H, { iterations: 8 });
    for (let i = 0; i < ut.length / 2; i++) {
      const u0 = ut[2 * i], t0 = ut[2 * i + 1];
      const isBoundary = u0 <= 1e-6 || u0 >= 1 - 1e-6 || t0 <= 1e-6 || t0 >= 1 - 1e-6;
      if (isBoundary) {
        expect(out[2 * i]).toBeCloseTo(j[2 * i], 9);     // boundary unchanged
        expect(out[2 * i + 1]).toBeCloseTo(j[2 * i + 1], 9);
      }
      expect(out[2 * i]).toBeGreaterThanOrEqual(0);
      expect(out[2 * i]).toBeLessThanOrEqual(1);
      expect(out[2 * i + 1]).toBeGreaterThanOrEqual(0);
      expect(out[2 * i + 1]).toBeLessThanOrEqual(1);
    }
  });

  it('improves 3D triangle quality (mean min-angle up) on a jittered mesh', () => {
    // Near-ISOTROPIC cylinder (2πR≈H ⇒ √E≈√G) so the uniform-grid connectivity CAN support good triangles —
    // smoothing optimizes vertex distribution, not connectivity, so it only helps when connectivity allows it
    // (on the 2.36:1 R=45 cylinder, uniform-grid triangles are ~23° no matter where the vertices sit).
    const rIso: AnalyticRadiusFn = () => H / (2 * Math.PI); // ≈19.1 ⇒ 2πR=H
    const N = 9;
    const { ut, indices } = gridMesh(N);
    const j = ut.slice();
    for (let it = 1; it < N - 1; it++) for (let iu = 1; iu < N - 1; iu++) {
      const v = it * N + iu; j[2 * v] += (((iu * 13 + it * 5) % 7) - 3) * 0.018; j[2 * v + 1] += (((iu * 3 + it * 11) % 7) - 3) * 0.018;
    }
    const idxU = Uint32Array.from(indices);
    const before = triangleQualityDistribution({ vertices: liftUtToRadial(j, rIso, H).vertices, indices: idxU });
    const out = smoothSurfaceOnRadial(j, indices, rIso, H, { iterations: 12 });
    const after = triangleQualityDistribution({ vertices: liftUtToRadial(out, rIso, H).vertices, indices: idxU });
    expect(after.meanMinAngleDeg).toBeGreaterThan(before.meanMinAngleDeg);
    expect(after.minAngleDeg).toBeGreaterThanOrEqual(before.minAngleDeg);
  });
});
