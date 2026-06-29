// flipHE.test.ts — the halfedge flip's relink is correctness-critical (follows Delaunator._legalize). Verify
// on real flips: halfedge involution stays valid, no triangle inverts/degenerates, and the 3D min-angle improves.
import { describe, it, expect } from 'vitest';
import Delaunator from 'delaunator';
import { flipHE } from './inhouseMetricMesh';

const TAU = 2 * Math.PI;

// jittered N×N grid in (u,t)
function gridUV(N: number): number[] {
  const uv: number[] = [];
  for (let it = 0; it < N; it++) for (let iu = 0; iu < N; iu++) {
    const j = ((iu * 7 + it * 13) % 5 - 2) * 0.01;
    const j2 = ((iu * 3 + it * 11) % 5 - 2) * 0.01;
    uv.push(iu / (N - 1) + (iu > 0 && iu < N - 1 ? j : 0), it / (N - 1) + (it > 0 && it < N - 1 ? j2 : 0));
  }
  return uv;
}

function liftCylinder(uv: number[], R: number, H: number): Float64Array {
  const n = uv.length / 2, p = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) { const th = TAU * uv[2 * i], z = uv[2 * i + 1] * H; p[3 * i] = R * Math.cos(th); p[3 * i + 1] = R * Math.sin(th); p[3 * i + 2] = z; }
  return p;
}
function angleStats(xyz: Float64Array, tris: Uint32Array): { worst: number; mean: number } {
  let mn = 180, sum = 0, n = 0;
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2];
    const A = [xyz[3 * a], xyz[3 * a + 1], xyz[3 * a + 2]], B = [xyz[3 * b], xyz[3 * b + 1], xyz[3 * b + 2]], C = [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]];
    const lab = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]), lbc = Math.hypot(B[0] - C[0], B[1] - C[1], B[2] - C[2]), lca = Math.hypot(C[0] - A[0], C[1] - A[1], C[2] - A[2]);
    if (lab < 1e-12 || lbc < 1e-12 || lca < 1e-12) continue;
    const ang = (j: number, k: number, o: number): number => Math.acos(Math.max(-1, Math.min(1, (j * j + k * k - o * o) / (2 * j * k)))) * 180 / Math.PI;
    const tm = Math.min(ang(lca, lab, lbc), ang(lab, lbc, lca), ang(lbc, lca, lab));
    mn = Math.min(mn, tm); sum += tm; n++;
  }
  return { worst: mn, mean: sum / n };
}

describe('flipHE — halfedge relink correctness', () => {
  it('preserves involution + non-degeneracy and improves 3D min-angle on an anisotropic surface', () => {
    const N = 14, R = 45, H = 120; // 2πR≈283 vs H=120 → anisotropic ⇒ plain-(u,t) Delaunay needs many 3D flips
    const uv = gridUV(N);
    const coords = Float64Array.from(uv); // plain (u,t) Euclidean Delaunay (deliberately NOT 3D-aware)
    const d = new Delaunator(coords);
    const tris = d.triangles, he = d.halfedges;
    const xyz = liftCylinder(uv, R, H);
    const before = angleStats(xyz, tris);

    flipHE(tris, he, xyz, uv, 30);

    // (1) halfedge involution holds for every interior halfedge
    for (let e = 0; e < he.length; e++) { if (he[e] !== -1) expect(he[he[e]]).toBe(e); }
    // (2) no degenerate/inverted triangle: all signed (u,t) areas strictly same sign as the majority
    let pos = 0, neg = 0;
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t], b = tris[t + 1], c = tris[t + 2];
      const ar = (uv[2 * b] - uv[2 * a]) * (uv[2 * c + 1] - uv[2 * a + 1]) - (uv[2 * b + 1] - uv[2 * a + 1]) * (uv[2 * c] - uv[2 * a]);
      expect(Math.abs(ar)).toBeGreaterThan(1e-12);
      if (ar > 0) pos++; else neg++;
    }
    expect(Math.min(pos, neg)).toBe(0); // consistent orientation (no inversions)
    // (3) 3D quality: worst non-decreasing (flips only accept local improvement) + mean strictly up
    const after = angleStats(xyz, tris);
    // eslint-disable-next-line no-console
    console.log(`flipHE: worst ${before.worst.toFixed(1)}→${after.worst.toFixed(1)}, mean ${before.mean.toFixed(1)}→${after.mean.toFixed(1)}`);
    expect(after.worst).toBeGreaterThanOrEqual(before.worst - 1e-6);
    expect(after.mean).toBeGreaterThan(before.mean);
  });
});
