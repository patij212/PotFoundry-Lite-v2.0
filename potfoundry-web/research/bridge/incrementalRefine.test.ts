// incrementalRefine.test.ts — the live half-edge split + local flip relink is correctness-critical. Verify the
// mesh stays a VALID triangulation through a long sequence of interior edge-splits + local Lawson flips:
// half-edge involution, twin-endpoint consistency, consistent orientation, non-degeneracy, and the right counts.
import { describe, it, expect } from 'vitest';
import { buildLiveMesh, splitEdge, flipLocal, nextHE, type LiveMesh } from './incrementalRefine';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const R = 45, H = 120;
const rA: AnalyticRadiusFn = () => R; // cylinder → E/G anisotropic → true-3D flips actually fire

function seedGrid(N: number): { u: number[]; t: number[] } {
  const u: number[] = [], t: number[] = [];
  for (let it = 0; it < N; it++) for (let iu = 0; iu < N; iu++) {
    const interior = iu > 0 && iu < N - 1 && it > 0 && it < N - 1;
    const ju = interior ? (((iu * 7 + it * 13) % 5 - 2) * 0.015) : 0;
    const jt = interior ? (((iu * 3 + it * 11) % 5 - 2) * 0.015) : 0;
    u.push(iu / (N - 1) + ju); t.push(it / (N - 1) + jt);
  }
  return { u, t };
}

function checkIntegrity(mesh: LiveMesh): void {
  const { tri, he, nt } = mesh;
  let pos = 0, neg = 0;
  for (let e = 0; e < nt * 3; e++) {
    const tw = he[e];
    if (tw !== -1) {
      expect(he[tw]).toBe(e);                       // involution
      expect(tri[tw]).toBe(tri[nextHE(e)]);         // twin endpoints reversed
      expect(tri[nextHE(tw)]).toBe(tri[e]);
    }
  }
  for (let t = 0; t < nt; t++) {
    const a = tri[3 * t], b = tri[3 * t + 1], c = tri[3 * t + 2];
    expect(a !== b && b !== c && c !== a).toBe(true);             // distinct verts
    const ar = (mesh.pu[b] - mesh.pu[a]) * (mesh.pt[c] - mesh.pt[a]) - (mesh.pt[b] - mesh.pt[a]) * (mesh.pu[c] - mesh.pu[a]);
    expect(Math.abs(ar)).toBeGreaterThan(1e-15);                  // non-degenerate
    if (ar > 0) pos++; else neg++;
  }
  expect(Math.min(pos, neg)).toBe(0);                            // consistent orientation (no inversions)
}

describe('incrementalRefine — live split + local flip integrity', () => {
  it('stays a valid triangulation through 400 interior splits + local flips', () => {
    const N = 12;
    const { u, t } = seedGrid(N);
    const mesh = buildLiveMesh(u, t, 2.36, rA, H, N * N + 600);
    checkIntegrity(mesh);
    const nv0 = mesh.nv, nt0 = mesh.nt;

    let splits = 0;
    // deterministic pseudo-random interior-edge picks
    let seed = 12345;
    const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let iter = 0; iter < 600 && splits < 400; iter++) {
      const e = Math.floor(rnd() * mesh.nt * 3);
      if (mesh.he[e] === -1) continue;               // skip hull edges
      const outer = splitEdge(mesh, e, rA, H);
      if (outer === null) continue;
      flipLocal(mesh, [...outer], 200);
      splits++;
      if (splits % 100 === 0) checkIntegrity(mesh);   // periodic full check
    }
    checkIntegrity(mesh);
    expect(splits).toBeGreaterThan(300);
    expect(mesh.nv).toBe(nv0 + splits);               // one vertex per split
    expect(mesh.nt).toBe(nt0 + 2 * splits);           // two triangles per split
    // every interior edge shared by exactly two triangles ⇒ no holes (Euler sanity via involution already covers)
  });

  it('in-circle flips MAINTAIN the Delaunay property (empty circumcircle, scaled coords)', () => {
    const N = 9, s = 2.36;
    const { u, t } = seedGrid(N);
    const mesh = buildLiveMesh(u, t, s, rA, H, N * N + 400);
    // refine via edge-split + IN-CIRCLE local flips (the path the kernel uses)
    let seed = 999;
    const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    let splits = 0;
    for (let iter = 0; iter < 500 && splits < 220; iter++) {
      const e = Math.floor(rnd() * mesh.nt * 3);
      if (mesh.he[e] === -1) continue;
      const outer = splitEdge(mesh, e, rA, H);
      if (outer === null) continue;
      flipLocal(mesh, [...outer], 200, s);            // scaleU>0 → in-circle (Delaunay) flips
      splits++;
    }
    checkIntegrity(mesh);
    // direct Delaunay check: NO vertex strictly inside any triangle's circumcircle (scaled coords)
    const inC = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, px: number, py: number): number => {
      const dx = ax - px, dy = ay - py, ex = bx - px, ey = by - py, fx = cx - px, fy = cy - py;
      const ap = dx * dx + dy * dy, bp = ex * ex + ey * ey, cp = fx * fx + fy * fy;
      return dx * (ey * cp - bp * fy) - dy * (ex * cp - bp * fx) + ap * (ex * fy - ey * fx);
    };
    const sx = (i: number): number => mesh.pu[i] * s, sy = (i: number): number => mesh.pt[i];
    let violations = 0;
    for (let tr = 0; tr < mesh.nt; tr++) {
      const a = mesh.tri[3 * tr], b = mesh.tri[3 * tr + 1], c = mesh.tri[3 * tr + 2];
      for (let v = 0; v < mesh.nv; v++) {
        if (v === a || v === b || v === c) continue;
        if (inC(sx(a), sy(a), sx(b), sy(b), sx(c), sy(c), sx(v), sy(v)) < -1e-9) { violations++; if (violations > 5) break; }
      }
      if (violations > 5) break;
    }
    // eslint-disable-next-line no-console
    console.log(`Delaunay check: ${violations} circumcircle violations over ${mesh.nt} tris / ${mesh.nv} verts`);
    expect(violations).toBe(0);
  });
});
