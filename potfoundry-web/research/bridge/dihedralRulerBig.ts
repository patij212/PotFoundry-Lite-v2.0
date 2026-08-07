// dihedralRulerBig.ts — `facetDihedrals` WITHOUT THE 2^23 EDGE CEILING.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS (S117 P0)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// `facetDihedrals` (dihedralRuler.ts) pairs half-edges through `Map<number, number[]>` keyed by a packed
// edge id. That was the right call at the scale it was written for — the comment there prices it against
// string keys at 1.14 M facets. But V8 caps a Map at 2^23 = 8,388,608 entries. MEASURED, this session:
//
//     node -e "let m=new Map(),i=0; try{for(;;){m.set(i,0);i++}}catch(e){console.log(m.size,e.message)}"
//     -> 8388608 Map maximum size exceeded
//
// A closed triangle mesh has 1.5 unique edges per facet, so the ruler is hard-capped at ~5.59 M facets.
// The S117 shipping-path meshes straddle that line exactly:
//     GothicArches outer wall   1,415,280 facets ->  2.12 M edges  — FITS (and did run)
//     CelticTriquetra outer wall 6,767,774 facets -> 10.15 M edges — DOES NOT, and the S117 scorecard
//                                                                    crashed there mid-run
// so the CT half of P0's decisive comparison was missing for an instrument reason, not a mesh reason.
//
// ── WHAT CHANGED, AND WHAT DELIBERATELY DID NOT ───────────────────────────────────────────────────────
// ONLY the container. The geometry is line-for-line the same:
//   * facet normal = the un-normalised cross product of the two f64 edge vectors, then divided by its
//     `Math.hypot`; area = half that length — identical expressions, identical rounding;
//   * dihedral = `Math.acos` of the clamped f64 dot of two unit normals;
//   * a facet's value is the MAX over its edges; a facet with no neighbour stays 0;
//   * welding is still EXACT coordinate equality (a tolerance would merge this project's real 0.1 um
//     needle pairs and manufacture adjacency), and canonical ids are still assigned in first-encounter
//     order, so the `id[]` array is bit-identical to the old `weld()`'s — the hash only decides probe
//     order, never identity.
// Two containers were replaced:
//   1. weld's `Map<number, number[]>` of hash buckets -> open-addressed Int32Array table (also removes a
//      second, softer 2^23 ceiling on DISTINCT VERTICES that the CT wall's 3.39 M was under but a
//      0.001 mm mesh would not be);
//   2. the edge `Map`s -> a counting-sort CSR over the welded `lo` endpoint, with each small bucket
//      stably insertion-sorted by `hi`. Bucket sizes are the vertex degrees (~6), so this is linear.
// The new ceiling is the Int32 index range (2^31 half-edges = 715 M facets), asserted below.
//
// ── THE ONE OBSERVABLE DIFFERENCE, STATED RATHER THAN HIDDEN ──────────────────────────────────────────
// `edgeF1`/`edgeF2`/`edgeAngRad` come out in (lo, hi) vertex order here and in first-touch order there.
// The parallel arrays hold the SAME SET of triples — dihedralRulerBig.test.ts asserts that by sorting
// both — but a consumer that indexed them positionally against a previous run would see a permutation.
// No consumer in this repo does: `s116zFinalScore` reads only the four counters and `perFacetMaxRad`,
// and `areaFractionOver` reads only `perFacetMaxRad`/`areaMm2`, all of which are order-free.
//
// Validated in research/bridge/dihedralRulerBig.test.ts: the closed-form folds, EXACT field-for-field
// equivalence with `facetDihedrals` on a closed torus / an open patch / a mis-wound facet / a
// non-manifold edge / an identity-indexed soup, and a >2^23-edge grid where the old ruler throws.
import type { DihedralResult } from './dihedralRuler';

/**
 * Weld coincident vertices by EXACT coordinate equality; canonical id per input vertex.
 *
 * Open addressing over a power-of-two Int32Array with linear probing at load factor <= 0.5. The hash is
 * taken from the f32 bit patterns (cheap, and coincident STL corners are bit-identical) but the ACCEPT
 * test is on the f64 values, so the hash can only ever cost a probe — never a wrong merge or a split.
 */
function weldBig(xyz: ArrayLike<number>): { id: Int32Array; count: number } {
  const nV = Math.floor(xyz.length / 3);
  const id = new Int32Array(nV);
  let cap = 16;
  while (cap < nV * 2) cap *= 2;
  const mask = cap - 1;
  const slot = new Int32Array(cap).fill(-1);
  const canonX = new Float64Array(nV); const canonY = new Float64Array(nV); const canonZ = new Float64Array(nV);
  const f32 = new Float32Array(3);
  const u32 = new Uint32Array(f32.buffer);
  let next = 0;
  for (let v = 0; v < nV; v += 1) {
    const x = xyz[v * 3]; const y = xyz[v * 3 + 1]; const z = xyz[v * 3 + 2];
    f32[0] = x; f32[1] = y; f32[2] = z;
    let h = (Math.imul(u32[0], 0x9e3779b1) ^ Math.imul(u32[1], 0x85ebca6b) ^ Math.imul(u32[2], 0xc2b2ae35)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    let i = h & mask;
    for (;;) {
      const c = slot[i];
      if (c < 0) {
        slot[i] = next; canonX[next] = x; canonY[next] = y; canonZ[next] = z; id[v] = next; next += 1;
        break;
      }
      if (canonX[c] === x && canonY[c] === y && canonZ[c] === z) { id[v] = c; break; }
      i = (i + 1) & mask;
    }
  }
  return { id, count: next };
}

/**
 * Angle between ADJACENT facet normals, per facet (max over its edges), plus per-facet area.
 * Drop-in for `facetDihedrals` with no Map anywhere; see the file header for what is and is not identical.
 */
export function facetDihedralsBig(xyz: ArrayLike<number>, indices: ArrayLike<number>): DihedralResult {
  const nF = Math.floor(indices.length / 3);
  const nHE = nF * 3;
  if (nHE > 2147483000) {
    throw new Error(`facetDihedralsBig: ${nF} facets exceeds the Int32 half-edge index range`);
  }
  const perFacetMaxRad = new Float64Array(nF);
  const areaMm2 = new Float64Array(nF);
  const nx = new Float64Array(nF); const ny = new Float64Array(nF); const nz = new Float64Array(nF);

  const { id, count: nVw } = weldBig(xyz);

  for (let f = 0; f < nF; f += 1) {
    const ia = indices[f * 3] * 3; const ib = indices[f * 3 + 1] * 3; const ic = indices[f * 3 + 2] * 3;
    const ux = xyz[ib] - xyz[ia]; const uy = xyz[ib + 1] - xyz[ia + 1]; const uz = xyz[ib + 2] - xyz[ia + 2];
    const wx = xyz[ic] - xyz[ia]; const wy = xyz[ic + 1] - xyz[ia + 1]; const wz = xyz[ic + 2] - xyz[ia + 2];
    const cx = uy * wz - uz * wy; const cy = uz * wx - ux * wz; const cz = ux * wy - uy * wx;
    const len = Math.hypot(cx, cy, cz);
    areaMm2[f] = 0.5 * len;
    if (len > 0) { nx[f] = cx / len; ny[f] = cy / len; nz[f] = cz / len; }
  }

  // ── CSR: bucket every half-edge by its LOWER welded endpoint ────────────────────────────────────────
  const off = new Int32Array(nVw + 1);
  for (let f = 0; f < nF; f += 1) {
    const a = id[indices[f * 3]]; const b = id[indices[f * 3 + 1]]; const c = id[indices[f * 3 + 2]];
    off[(a < b ? a : b) + 1] += 1;
    off[(b < c ? b : c) + 1] += 1;
    off[(c < a ? c : a) + 1] += 1;
  }
  for (let v = 0; v < nVw; v += 1) off[v + 1] += off[v];
  const cursor = off.slice(0, nVw);
  const bHi = new Int32Array(nHE);
  const bF = new Int32Array(nHE);
  const bDir = new Int8Array(nHE);
  // f ASCENDING so that, after a STABLE sort by hi, an edge's two facets stay in ascending facet order —
  // which is what the Map version produced (it pushed in f order). Keeps edgeF1 < edgeF2 identical.
  for (let f = 0; f < nF; f += 1) {
    const a = id[indices[f * 3]]; const b = id[indices[f * 3 + 1]]; const c = id[indices[f * 3 + 2]];
    const u0 = a; const v0 = b; const u1 = b; const v1 = c; const u2 = c; const v2 = a;
    let lo = u0 < v0 ? u0 : v0; let p = cursor[lo]; cursor[lo] = p + 1;
    bHi[p] = u0 < v0 ? v0 : u0; bF[p] = f; bDir[p] = u0 < v0 ? 1 : -1;
    lo = u1 < v1 ? u1 : v1; p = cursor[lo]; cursor[lo] = p + 1;
    bHi[p] = u1 < v1 ? v1 : u1; bF[p] = f; bDir[p] = u1 < v1 ? 1 : -1;
    lo = u2 < v2 ? u2 : v2; p = cursor[lo]; cursor[lo] = p + 1;
    bHi[p] = u2 < v2 ? v2 : u2; bF[p] = f; bDir[p] = u2 < v2 ? 1 : -1;
  }

  // stable insertion sort inside each bucket (bucket size = vertex degree, ~6)
  for (let v = 0; v < nVw; v += 1) {
    const s = off[v]; const e = off[v + 1];
    for (let i = s + 1; i < e; i += 1) {
      const kh = bHi[i]; const kf = bF[i]; const kd = bDir[i];
      let j = i - 1;
      while (j >= s && bHi[j] > kh) { bHi[j + 1] = bHi[j]; bF[j + 1] = bF[j]; bDir[j + 1] = bDir[j]; j -= 1; }
      bHi[j + 1] = kh; bF[j + 1] = kf; bDir[j + 1] = kd;
    }
  }

  // pass 1: count interior edges so the output arrays are exactly sized (no over-allocate + slice)
  let nInterior = 0;
  for (let v = 0; v < nVw; v += 1) {
    const e = off[v + 1];
    let i = off[v];
    while (i < e) {
      let j = i + 1;
      while (j < e && bHi[j] === bHi[i]) j += 1;
      if (j - i === 2) nInterior += 1;
      i = j;
    }
  }
  const edgeF1 = new Int32Array(nInterior);
  const edgeF2 = new Int32Array(nInterior);
  const edgeAngRad = new Float64Array(nInterior);

  // pass 2: classify and score
  let interiorEdges = 0; let boundaryEdges = 0; let nonManifoldEdges = 0; let inconsistentEdges = 0;
  for (let v = 0; v < nVw; v += 1) {
    const e = off[v + 1];
    let i = off[v];
    while (i < e) {
      let j = i + 1;
      while (j < e && bHi[j] === bHi[i]) j += 1;
      const n = j - i;
      if (n === 1) { boundaryEdges += 1; i = j; continue; }
      if (n > 2) { nonManifoldEdges += 1; i = j; continue; }
      const slotIdx = interiorEdges;
      interiorEdges += 1;
      // consistently-wound neighbours traverse a shared edge in OPPOSITE directions
      if (bDir[i] === bDir[i + 1]) inconsistentEdges += 1;
      const f1 = bF[i]; const f2 = bF[i + 1];
      let d = nx[f1] * nx[f2] + ny[f1] * ny[f2] + nz[f1] * nz[f2];
      if (d > 1) d = 1; else if (d < -1) d = -1;
      const ang = Math.acos(d);
      edgeF1[slotIdx] = f1; edgeF2[slotIdx] = f2; edgeAngRad[slotIdx] = ang;
      if (ang > perFacetMaxRad[f1]) perFacetMaxRad[f1] = ang;
      if (ang > perFacetMaxRad[f2]) perFacetMaxRad[f2] = ang;
      i = j;
    }
  }

  return {
    perFacetMaxRad, areaMm2, interiorEdges, boundaryEdges, nonManifoldEdges, inconsistentEdges,
    edgeF1, edgeF2, edgeAngRad,
  };
}
