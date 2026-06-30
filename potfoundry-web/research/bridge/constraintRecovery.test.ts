// constraintRecovery.test.ts — DEV-ONLY (env PF_RECU=1). Unit tests for the Stage-B constrained-edge
// recovery: it must (a) insert a single-flip diagonal, (b) NOT corrupt the mesh (manifold-preserving) even
// when it gives up on a hard constraint, (c) handle the periodic u-seam without throwing.
//
// Coords are kept in [0,1]×[0,1] (the kernel's (u,t) domain) with u-span < 0.5 where a non-seam crossing is
// intended — wrapU assumes u-period = 1, so two points > 0.5 apart in u are treated as seam-wrapped (correct
// for the real mesh; an artifact only if a test mis-scales its coords).
//
// Run: PF_RECU=1 npx vitest run research/bridge/constraintRecovery.test.ts
import { describe, it, expect } from 'vitest';
import Delaunator from 'delaunator';
import { recoverAndLockEdges } from './constraintRecovery';

const hasEdge = (t: Uint32Array, a: number, b: number): boolean => {
  for (let i = 0; i < t.length; i += 3) {
    const x = [t[i], t[i + 1], t[i + 2]];
    if (x.includes(a) && x.includes(b)) return true;
  }
  return false;
};
const nonManifold = (t: Uint32Array): number => {
  const ec = new Map<string, number>();
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i], b = t[i + 1], c = t[i + 2];
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) { const k = p < q ? `${p}_${q}` : `${q}_${p}`; ec.set(k, (ec.get(k) ?? 0) + 1); }
  }
  let n = 0; for (const v of ec.values()) if (v > 2) n++; return n;
};
const dupTris = (t: Uint32Array): number => {
  const s = new Set<string>(); let d = 0;
  for (let i = 0; i < t.length; i += 3) { const k = [t[i], t[i + 1], t[i + 2]].sort((a, b) => a - b).join('_'); if (s.has(k)) d++; s.add(k); }
  return d;
};

describe('constraintRecovery', () => {
  it.skipIf(!process.env.PF_RECU)('flips the single diagonal of a convex quad', () => {
    const uv = [0.30, 0.50, 0.40, 0.52, 0.50, 0.50, 0.40, 0.48];
    const d = new Delaunator(new Float64Array(uv));
    const tris = Uint32Array.from(d.triangles); const he = Int32Array.from(d.halfedges);
    const rec = recoverAndLockEdges(tris, he, uv, [0, 2]);
    expect(hasEdge(tris, 0, 2)).toBe(true);
    expect(rec.recovered).toBe(1);
    expect(nonManifold(tris)).toBe(0);
    expect(dupTris(tris)).toBe(0);
  });

  it.skipIf(!process.env.PF_RECU)('already-present edge is locked, no flip', () => {
    const uv = [0.30, 0.50, 0.40, 0.52, 0.50, 0.50, 0.40, 0.48];
    const d = new Delaunator(new Float64Array(uv));
    const tris = Uint32Array.from(d.triangles); const he = Int32Array.from(d.halfedges);
    // 1-3 is the Delaunay diagonal → already present.
    const rec = recoverAndLockEdges(tris, he, uv, [1, 3]);
    expect(rec.alreadyPresent).toBe(1);
    expect(rec.flips).toBe(0);
    expect(nonManifold(tris)).toBe(0);
  });

  it.skipIf(!process.env.PF_RECU)('giving up on a hard constraint leaves the mesh manifold', () => {
    // staggered grid where the long diagonal crosses several edges — greedy single-direction recovery may
    // fail, but MUST NOT corrupt the mesh.
    const uv: number[] = [];
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) uv.push(0.30 + i * 0.03 + (j % 2 ? 0.004 : 0), 0.30 + j * 0.03);
    const d = new Delaunator(new Float64Array(uv));
    const tris = Uint32Array.from(d.triangles); const he = Int32Array.from(d.halfedges);
    recoverAndLockEdges(tris, he, uv, [0, 15, 3, 12]);
    expect(nonManifold(tris)).toBe(0);
    expect(dupTris(tris)).toBe(0);
  });

  it.skipIf(!process.env.PF_RECU)('seam-straddling constraint does not throw + stays manifold', () => {
    const uv = [0.95, 0.50, 0.05, 0.50, 0.00, 0.30, 0.00, 0.70];
    const d = new Delaunator(new Float64Array(uv));
    const tris = Uint32Array.from(d.triangles); const he = Int32Array.from(d.halfedges);
    expect(() => recoverAndLockEdges(tris, he, uv, [0, 1])).not.toThrow();
    expect(nonManifold(tris)).toBe(0);
  });
});
