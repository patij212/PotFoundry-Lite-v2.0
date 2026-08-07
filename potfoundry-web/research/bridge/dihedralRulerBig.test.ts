// dihedralRulerBig.test.ts — S117 P0.
//
// WHY THIS EXISTS. `facetDihedrals` (dihedralRuler.ts) pairs half-edges through a `Map` keyed by a packed
// numeric edge id. V8 caps a Map at 2^23 = 8,388,608 entries (MEASURED in this session: a bare
// `for(;;) m.set(i++,0)` dies at exactly 8388608 with "Map maximum size exceeded"). A closed triangle mesh
// has ~1.5 edges per facet, so the ruler is HARD-CAPPED at ~5.59 M facets. S117's shipping-path
// CelticTriquetra outer wall is 6,767,774 facets => ~10.15 M unique edges, and the S117 scorecard run
// CRASHED there (RangeError at dihedralRuler.ts:113). The Gothic wall, 1,415,280 facets => 2.12 M edges,
// fit — which is precisely why the cap had never been hit before and why the CT half of the decisive
// comparison was missing.
//
// `facetDihedralsBig` removes the Map entirely (counting-sort CSR over welded vertex ids, typed arrays
// throughout) so the ceiling becomes the Int32 index range, not 2^23.
//
// WHAT IS ASSERTED, AND WHY IT IS TWO-SIDED:
//   1. the closed-form folds pinned in dihedralRuler.test.ts still read the same;
//   2. EQUIVALENCE — on meshes the old ruler CAN do (closed torus, open patch, a mis-wound facet, a
//      non-manifold edge) every field agrees EXACTLY with `facetDihedrals`, including the per-edge arrays
//      compared as SETS (the CSR emits edges in (lo,hi) order, the Map in first-touch order; no consumer
//      in this repo reads that order, and the test states the difference rather than hiding it);
//   3. CAPACITY — on a mesh with > 2^23 unique edges the OLD ruler throws and the NEW one does not, with
//      the Euler count of the grid asserted in closed form so "does not throw" is not the whole claim.
//      (opt-in: PF_DIHBIG_HUGE=1 — it allocates ~1 GB and takes ~1 min.)
//
// npx vitest run --config vitest.dihbig.config.ts
import { describe, it, expect } from 'vitest';
import { facetDihedrals } from './dihedralRuler';
import { facetDihedralsBig } from './dihedralRulerBig';

/** unit square in z=0 split across the (1,0)-(0,1) diagonal. Consistently wound. */
const FLAT = {
  xyz: [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0],
  idx: [0, 1, 2, 1, 3, 2],
};

/** deterministic 32-bit LCG so the "random" meshes are the same on every machine and every run. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * A closed torus tessellation, vertices jittered so no two facets are coplanar and the dihedral
 * histogram is non-degenerate. nu x nv quads, each split into 2 triangles, wrapped in both directions
 * ⇒ every edge has exactly 2 facets.
 */
function torus(nu: number, nv: number, jitter: number): { xyz: Float64Array; idx: Int32Array } {
  const rnd = lcg(0xC0FFEE);
  const xyz = new Float64Array(nu * nv * 3);
  for (let i = 0; i < nu; i += 1) {
    for (let j = 0; j < nv; j += 1) {
      const u = (2 * Math.PI * i) / nu; const v = (2 * Math.PI * j) / nv;
      const R = 3 + jitter * (rnd() - 0.5); const r = 1 + jitter * (rnd() - 0.5);
      const p = (i * nv + j) * 3;
      xyz[p] = (R + r * Math.cos(v)) * Math.cos(u);
      xyz[p + 1] = (R + r * Math.cos(v)) * Math.sin(u);
      xyz[p + 2] = r * Math.sin(v);
    }
  }
  const idx = new Int32Array(nu * nv * 6);
  let o = 0;
  for (let i = 0; i < nu; i += 1) {
    for (let j = 0; j < nv; j += 1) {
      const i1 = (i + 1) % nu; const j1 = (j + 1) % nv;
      const a = i * nv + j; const b = i1 * nv + j; const c = i1 * nv + j1; const d = i * nv + j1;
      idx[o] = a; idx[o + 1] = b; idx[o + 2] = c; o += 3;
      idx[o] = a; idx[o + 1] = c; idx[o + 2] = d; o += 3;
    }
  }
  return { xyz, idx };
}

/** Compare every field. Per-edge arrays are compared as SETS keyed by (f1,f2) — see the header. */
function expectSameResult(
  a: ReturnType<typeof facetDihedrals>,
  b: ReturnType<typeof facetDihedralsBig>,
): void {
  expect(b.interiorEdges).toBe(a.interiorEdges);
  expect(b.boundaryEdges).toBe(a.boundaryEdges);
  expect(b.nonManifoldEdges).toBe(a.nonManifoldEdges);
  expect(b.inconsistentEdges).toBe(a.inconsistentEdges);
  expect(b.perFacetMaxRad.length).toBe(a.perFacetMaxRad.length);
  for (let f = 0; f < a.perFacetMaxRad.length; f += 1) {
    // EXACT: both take acos of the same f64 dot of the same f64 normals, so any difference is a bug,
    // not rounding. A tolerance here would hide exactly the defect this test exists to catch.
    expect(b.perFacetMaxRad[f]).toBe(a.perFacetMaxRad[f]);
    expect(b.areaMm2[f]).toBe(a.areaMm2[f]);
  }
  const key = (r: { edgeF1: Int32Array; edgeF2: Int32Array; edgeAngRad: Float64Array }): string[] => {
    const out: string[] = [];
    for (let e = 0; e < r.edgeF1.length; e += 1) out.push(`${r.edgeF1[e]}|${r.edgeF2[e]}|${r.edgeAngRad[e]}`);
    out.sort();
    return out;
  };
  expect(key(b)).toEqual(key(a));
}

describe('facetDihedralsBig — the Map-free edge pairing', () => {
  it('reproduces the closed-form folds pinned for facetDihedrals', () => {
    const flat = facetDihedralsBig(FLAT.xyz, FLAT.idx);
    expect(flat.interiorEdges).toBe(1);
    expect(flat.perFacetMaxRad[0]).toBeCloseTo(0, 12);
    expect(flat.areaMm2[0]).toBeCloseTo(0.5, 12);

    const folded = facetDihedralsBig([0, 0, 0, 1, 0, 0, 0, 1, 0, 0.5, 0.5, Math.SQRT1_2], FLAT.idx);
    expect(folded.interiorEdges).toBe(1);
    expect((folded.perFacetMaxRad[0] * 180) / Math.PI).toBeCloseTo(90, 6);
    expect((folded.perFacetMaxRad[1] * 180) / Math.PI).toBeCloseTo(90, 6);

    const lone = facetDihedralsBig([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
    expect(lone.boundaryEdges).toBe(3);
    expect(lone.interiorEdges).toBe(0);
    expect(lone.perFacetMaxRad[0]).toBe(0);
  });

  it('EQUIVALENCE on a closed jittered torus (every edge interior)', () => {
    const { xyz, idx } = torus(40, 24, 0.6);
    const a = facetDihedrals(xyz, idx);
    const b = facetDihedralsBig(xyz, idx);
    // the fixture must actually exercise the interior path, else the equivalence is vacuous
    expect(a.interiorEdges).toBe(3 * 40 * 24);
    expect(a.boundaryEdges).toBe(0);
    expectSameResult(a, b);
  });

  it('EQUIVALENCE on an OPEN patch — boundary edges must agree, not be silently dropped', () => {
    // a 12x9 quad grid, not wrapped: boundary = the rectangle's perimeter edges
    const nu = 13; const nv = 10;
    const rnd = lcg(7);
    const xyz = new Float64Array(nu * nv * 3);
    for (let i = 0; i < nu; i += 1) {
      for (let j = 0; j < nv; j += 1) {
        const p = (i * nv + j) * 3;
        xyz[p] = i; xyz[p + 1] = j; xyz[p + 2] = rnd() * 0.7;
      }
    }
    const tri: number[] = [];
    for (let i = 0; i < nu - 1; i += 1) {
      for (let j = 0; j < nv - 1; j += 1) {
        const a = i * nv + j; const b = (i + 1) * nv + j; const c = (i + 1) * nv + j + 1; const d = i * nv + j + 1;
        tri.push(a, b, c, a, c, d);
      }
    }
    const idx = Int32Array.from(tri);
    const a = facetDihedrals(xyz, idx);
    const b = facetDihedralsBig(xyz, idx);
    expect(a.boundaryEdges).toBe(2 * (nu - 1) + 2 * (nv - 1));
    expectSameResult(a, b);
  });

  it('EQUIVALENCE with a MIS-WOUND facet and a NON-MANIFOLD edge present', () => {
    const { xyz: t, idx: ti } = torus(14, 10, 0.5);
    const idx = Int32Array.from(ti);
    // flip facet 3's winding => the two edges it shares are traversed the same way as their neighbours
    const s = idx[9]; idx[9] = idx[10]; idx[10] = s;
    // bolt a third facet onto one existing edge => a non-manifold edge
    const withExtra = new Int32Array(idx.length + 3);
    withExtra.set(idx);
    withExtra[idx.length] = idx[0]; withExtra[idx.length + 1] = idx[1]; withExtra[idx.length + 2] = idx[5];
    const a = facetDihedrals(t, withExtra);
    const b = facetDihedralsBig(t, withExtra);
    expect(a.inconsistentEdges).toBeGreaterThan(0);
    expect(a.nonManifoldEdges).toBeGreaterThan(0);
    expectSameResult(a, b);
  });

  it('EQUIVALENCE on a DUPLICATED-COORDINATE soup (welding actually does work)', () => {
    // identity indices over a triangle soup — exactly how s116zFinalScore feeds an STL in.
    const { xyz, idx } = torus(18, 12, 0.5);
    const nF = idx.length / 3;
    const soup = new Float64Array(nF * 9);
    for (let f = 0; f < nF; f += 1) {
      for (let k = 0; k < 3; k += 1) {
        const v = idx[f * 3 + k];
        soup[f * 9 + k * 3] = xyz[v * 3];
        soup[f * 9 + k * 3 + 1] = xyz[v * 3 + 1];
        soup[f * 9 + k * 3 + 2] = xyz[v * 3 + 2];
      }
    }
    const ident = new Int32Array(nF * 3);
    for (let i = 0; i < nF * 3; i += 1) ident[i] = i;
    const a = facetDihedrals(soup, ident);
    const b = facetDihedralsBig(soup, ident);
    expect(a.interiorEdges).toBe(3 * 18 * 12); // welding recovered the full adjacency from a soup
    expectSameResult(a, b);
  });

  it('CAPACITY: > 2^23 unique edges — the Map ruler THROWS, the CSR ruler does not', () => {
    if (process.env.PF_DIHBIG_HUGE !== '1') return; // opt-in: ~1 GB, ~1 min
    // W x H quad cells, split: facets 2WH, unique edges 3WH + W + H. 2^23 = 8,388,608.
    const W = 1700; const H = 1700;
    const edges = 3 * W * H + W + H;
    expect(edges).toBeGreaterThan(8388608);
    const nu = W + 1; const nv = H + 1;
    const xyz = new Float64Array(nu * nv * 3);
    for (let i = 0; i < nu; i += 1) {
      for (let j = 0; j < nv; j += 1) {
        const p = (i * nv + j) * 3;
        xyz[p] = i; xyz[p + 1] = j; xyz[p + 2] = ((i * 37 + j * 11) % 13) * 0.05;
      }
    }
    const idx = new Int32Array(W * H * 6);
    let o = 0;
    for (let i = 0; i < W; i += 1) {
      for (let j = 0; j < H; j += 1) {
        const a = i * nv + j; const b = (i + 1) * nv + j; const c = (i + 1) * nv + j + 1; const d = i * nv + j + 1;
        idx[o] = a; idx[o + 1] = b; idx[o + 2] = c; o += 3;
        idx[o] = a; idx[o + 1] = c; idx[o + 2] = d; o += 3;
      }
    }
    expect(() => facetDihedrals(xyz, idx)).toThrow(/Map maximum size exceeded/);
    const b = facetDihedralsBig(xyz, idx);
    // closed form, so "did not throw" is not the whole claim:
    expect(b.interiorEdges + b.boundaryEdges + b.nonManifoldEdges).toBe(edges);
    expect(b.boundaryEdges).toBe(2 * W + 2 * H);
    expect(b.nonManifoldEdges).toBe(0);
    expect(b.inconsistentEdges).toBe(0);
  }, 600000);
});
