// _recoveryHardening.test.ts — DEV-ONLY (env PF_RECU2=1). DISCRIMINATOR for Task 1 of
// E-2026-06-30-FEAT-CONFORM-ALL20: the textbook crossing-chain CDT edge recovery must recover a
// constraint whose crossing chain is NOT entirely in the endpoint's immediate fan — the case the
// greedy single-direction walk (constraintRecovery.ts original) provably GIVES UP on.
//
// The discriminator is a structured grid whose desired constraint spans several columns: the first
// crossed edge is in p's fan, but subsequent crossings are deep in the strip (incident to interior
// vertices, NOT to p). The greedy walk finds no crossing edge in p's fan after the first flip and
// gives up (recoveryFailed=1). The crossing-chain walk collects ALL crossings and retriangulates,
// reaching the constraint (recovered=1, recoveryFailed=0). Both MUST keep the mesh manifold.
//
// Run: PF_RECU2=1 npx vitest run research/bridge/_recoveryHardening.test.ts
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
// signed-area orientation count (all triangles same sign ⇒ no inverted/folded tri after recovery).
const orientationFlips = (t: Uint32Array, uv: number[]): number => {
  let pos = 0, neg = 0;
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i], b = t[i + 1], c = t[i + 2];
    const ax = uv[2 * a], ay = uv[2 * a + 1], bx = uv[2 * b], by = uv[2 * b + 1], cx = uv[2 * c], cy = uv[2 * c + 1];
    const s = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (s > 0) pos++; else if (s < 0) neg++;
  }
  return Math.min(pos, neg);
};

describe('recovery hardening (crossing-chain)', () => {
  // A 5×3 regular grid. The desired constraint is the near-horizontal diagonal from the
  // bottom-left (0) to the top-right of column 4 (row 2 → index 14): it slices across MANY
  // vertical/diagonal edges of the interior columns, the multi-crossing case.
  function grid5x3(): { uv: number[]; tris: Uint32Array; he: Int32Array } {
    const uv: number[] = [];
    // 5 columns × 3 rows, slight shear so the long diagonal crosses interior edges (not vertices).
    for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) uv.push(0.20 + i * 0.04, 0.40 + j * 0.03 + i * 0.006);
    const d = new Delaunator(new Float64Array(uv));
    return { uv, tris: Uint32Array.from(d.triangles), he: Int32Array.from(d.halfedges) };
  }

  it.skipIf(!process.env.PF_RECU2)('recovers a multi-crossing constraint (chain not in endpoint fan)', () => {
    const { uv, tris, he } = grid5x3();
    // constraint: vertex 0 (col0,row0) to vertex 14 (col4,row2) — a long shallow diagonal.
    const p = 0, q = 14;
    const before = hasEdge(tris, p, q);
    const rec = recoverAndLockEdges(tris, he, uv, [p, q]);
    // eslint-disable-next-line no-console
    console.log(`grid5x3 [${p}→${q}] present-before=${before} recovered=${rec.recovered} present=${rec.alreadyPresent} failed=${rec.recoveryFailed} flips=${rec.flips}`);
    expect(rec.recoveryFailed).toBe(0);          // the textbook walk must NOT give up
    expect(hasEdge(tris, p, q)).toBe(true);       // the constraint edge now exists
    expect(nonManifold(tris)).toBe(0);
    expect(dupTris(tris)).toBe(0);
    expect(orientationFlips(tris, uv)).toBe(0);   // no folded/inverted triangles
  });

  it.skipIf(!process.env.PF_RECU2)('batch of NON-crossing multi-crossing constraints all recovered', () => {
    const { uv, tris, he } = grid5x3();
    // Two diagonals in DISJOINT halves of the strip — each spans several crossings but they share no region
    // (realistic for distinct ridge loci on different t-bands), so BOTH must recover (no lock conflict).
    // 0→9 lives in rows 0–1 (lower band); 5→14 lives in rows 1–2 (upper band) — they only touch row 1 ends.
    const rec = recoverAndLockEdges(tris, he, uv, [0, 9, 5, 14]);
    // eslint-disable-next-line no-console
    console.log(`grid5x3 batch recovered=${rec.recovered} present=${rec.alreadyPresent} failed=${rec.recoveryFailed} flips=${rec.flips}`);
    expect(rec.recovered + rec.alreadyPresent).toBe(2); // both inserted
    expect(rec.recoveryFailed).toBe(0);
    expect(hasEdge(tris, 0, 9)).toBe(true);
    expect(hasEdge(tris, 5, 14)).toBe(true);
    expect(nonManifold(tris)).toBe(0);
    expect(dupTris(tris)).toBe(0);
    expect(orientationFlips(tris, uv)).toBe(0);
  });

  it.skipIf(!process.env.PF_RECU2)('CROSSING constraints: 2nd blocked by 1st lock → clean give-up, mesh stays manifold', () => {
    const { uv, tris, he } = grid5x3();
    // 0→14 and 5→9 CROSS each other: the first locks, the second cannot be inserted without breaking the
    // lock → it is left un-recovered (a legitimate, NOT a bug) but the mesh MUST stay manifold + 1st recovered.
    const rec = recoverAndLockEdges(tris, he, uv, [0, 14, 5, 9]);
    // eslint-disable-next-line no-console
    console.log(`grid5x3 crossing recovered=${rec.recovered} failed=${rec.recoveryFailed}`);
    expect(hasEdge(tris, 0, 14)).toBe(true);      // first constraint inserted + locked
    expect(rec.recoveryFailed).toBeGreaterThanOrEqual(1); // second is geometrically unsatisfiable
    expect(nonManifold(tris)).toBe(0);            // safety invariant holds even when a constraint is dropped
    expect(dupTris(tris)).toBe(0);
    expect(orientationFlips(tris, uv)).toBe(0);
  });

  // Regression: the original 4 cases must still pass (single-flip, already-present, hard staggered, seam).
  it.skipIf(!process.env.PF_RECU2)('single convex-quad flip still works', () => {
    const uv = [0.30, 0.50, 0.40, 0.52, 0.50, 0.50, 0.40, 0.48];
    const d = new Delaunator(new Float64Array(uv));
    const tris = Uint32Array.from(d.triangles); const he = Int32Array.from(d.halfedges);
    const rec = recoverAndLockEdges(tris, he, uv, [0, 2]);
    expect(hasEdge(tris, 0, 2)).toBe(true);
    expect(rec.recovered).toBe(1);
    expect(nonManifold(tris)).toBe(0);
  });

  it.skipIf(!process.env.PF_RECU2)('seam-straddling constraint does not throw + stays manifold', () => {
    const uv = [0.95, 0.50, 0.05, 0.50, 0.00, 0.30, 0.00, 0.70];
    const d = new Delaunator(new Float64Array(uv));
    const tris = Uint32Array.from(d.triangles); const he = Int32Array.from(d.halfedges);
    expect(() => recoverAndLockEdges(tris, he, uv, [0, 1])).not.toThrow();
    expect(nonManifold(tris)).toBe(0);
  });
});
