// dihedralRuler.ts — THE ANGLE A PREVIEW ACTUALLY SHADES.
//
// WHY THIS EXISTS, stated so it is not mistaken for a duplicate of `orientRuler`.
// Every angular number in this campaign is `orientOfFacet`/`normDeg`: the angle between a facet's normal
// and the ANALYTIC surface normal. That is a FIDELITY quantity — how far the mesh is from the truth.
// It is NOT the quantity a slicer preview draws. A renderer shades from the facet normals it is given,
// so what the eye reads as banding is the angle BETWEEN ADJACENT FACET NORMALS. The two dissociate in
// both directions:
//   * two facets each 3 deg off the true surface, tilted the SAME way, are mutually flat — INVISIBLE;
//   * two facets each 0.5 deg off, tilted OPPOSITE ways, show a 1 deg crease — VISIBLE.
// So a mesh can be poor by `normDeg` and look clean, or good by `normDeg` and look banded. Calibrating
// the campaign's inherited 1 deg bar against what a human can actually see requires THIS ruler.
//
// It is analytic-free by construction: it touches only the mesh. That is deliberate — it cannot inherit
// the rA/parameterisation confounds (wrong style params, tread vertices off rA) that have voided whole
// runs of the analytic-referenced instruments, and it works on any STL whatever built it.
//
// WINDING. The angle is taken from the facet normals AS WOUND, because that is what a consumer of the
// STL renders. An inverted facet therefore reads as a large dihedral — which is correct: it WOULD look
// wrong. `inconsistentEdges` counts interior edges whose two facets traverse them in the SAME direction
// (a winding defect) so that population can be separated rather than silently averaged in.

/** Per-facet adjacent-dihedral summary of a triangle soup or indexed mesh. */
export interface DihedralResult {
  /** per-facet MAX dihedral (radians) against any adjacent facet; 0 where a facet has no neighbour. */
  perFacetMaxRad: Float64Array;
  /** per-facet area, in the mesh's own units (mm for this project). */
  areaMm2: Float64Array;
  /** interior edges = shared by exactly 2 facets. */
  interiorEdges: number;
  /** boundary edges = shared by exactly 1 facet (an open mesh, a patch, or a crack). */
  boundaryEdges: number;
  /** edges shared by 3+ facets. Not scored — reported so they cannot hide. */
  nonManifoldEdges: number;
  /** interior edges whose two facets traverse them the SAME way ⇒ inconsistent winding. */
  inconsistentEdges: number;
  /** per interior edge: the two facets and their dihedral (radians). Parallel arrays, length interiorEdges. */
  edgeF1: Int32Array;
  edgeF2: Int32Array;
  edgeAngRad: Float64Array;
}

/**
 * Weld coincident vertices by EXACT coordinate equality and return a canonical id per input vertex.
 * Exact is the right test for an STL: a shared vertex is written from the same f64 through the same f32
 * rounding, so the two copies are bit-identical. A tolerance would merge genuinely distinct near-vertices
 * (this project HAS 0.1 um needle pairs) and manufacture false adjacency.
 */
function weld(xyz: ArrayLike<number>): { id: Int32Array; count: number } {
  const nV = Math.floor(xyz.length / 3);
  const id = new Int32Array(nV);
  // hash → candidate vertex ids. Numeric keys + explicit coordinate comparison: a string key on 3.4 M
  // vertices costs more than the whole rest of this pass.
  const buckets = new Map<number, number[]>();
  const f32 = new Float32Array(3);
  const u32 = new Uint32Array(f32.buffer);
  let next = 0;
  const canonX: number[] = []; const canonY: number[] = []; const canonZ: number[] = [];
  for (let v = 0; v < nV; v += 1) {
    const x = xyz[v * 3]; const y = xyz[v * 3 + 1]; const z = xyz[v * 3 + 2];
    f32[0] = x; f32[1] = y; f32[2] = z;
    let h = (u32[0] * 0x9e3779b1) ^ (u32[1] * 0x85ebca6b) ^ (u32[2] * 0xc2b2ae35);
    h |= 0;
    const bucket = buckets.get(h);
    let found = -1;
    if (bucket !== undefined) {
      for (const c of bucket) if (canonX[c] === x && canonY[c] === y && canonZ[c] === z) { found = c; break; }
    }
    if (found < 0) {
      found = next; next += 1;
      canonX.push(x); canonY.push(y); canonZ.push(z);
      if (bucket === undefined) buckets.set(h, [found]); else bucket.push(found);
    }
    id[v] = found;
  }
  return { id, count: next };
}

/** Angle between ADJACENT facet normals, per facet (max over its edges), plus per-facet area. */
export function facetDihedrals(xyz: ArrayLike<number>, indices: ArrayLike<number>): DihedralResult {
  const nF = Math.floor(indices.length / 3);
  if (Math.floor(xyz.length / 3) >= 67_108_864) {
    // The packed edge key below would alias. Refuse loudly rather than return quiet nonsense.
    throw new Error(`facetDihedrals: ${Math.floor(xyz.length / 3)} vertices exceeds the 2^26 edge-key packing limit`);
  }
  const perFacetMaxRad = new Float64Array(nF);
  const areaMm2 = new Float64Array(nF);
  const nx = new Float64Array(nF); const ny = new Float64Array(nF); const nz = new Float64Array(nF);

  const { id } = weld(xyz);

  for (let f = 0; f < nF; f += 1) {
    const ia = indices[f * 3] * 3; const ib = indices[f * 3 + 1] * 3; const ic = indices[f * 3 + 2] * 3;
    const ux = xyz[ib] - xyz[ia]; const uy = xyz[ib + 1] - xyz[ia + 1]; const uz = xyz[ib + 2] - xyz[ia + 2];
    const wx = xyz[ic] - xyz[ia]; const wy = xyz[ic + 1] - xyz[ia + 1]; const wz = xyz[ic + 2] - xyz[ia + 2];
    const cx = uy * wz - uz * wy; const cy = uz * wx - ux * wz; const cz = ux * wy - uy * wx;
    const len = Math.hypot(cx, cy, cz);
    areaMm2[f] = 0.5 * len;
    if (len > 0) { nx[f] = cx / len; ny[f] = cy / len; nz[f] = cz / len; }
  }

  // Edge key → the facets on it, and the direction each traversed it in. The key is PACKED NUMERICALLY
  // (lo * 2^26 + hi), not a template string: at 1.14 M facets there are ~1.7 M interior edges, and string
  // keys cost hundreds of MB. 2^26 = 67.1 M welded vertices of headroom, and lo*2^26+hi stays exactly
  // representable in a float64 (< 2^53), so the key is collision-free rather than a hash.
  const SHIFT = 67_108_864; // 2^26
  const edgeFacets = new Map<number, number[]>();
  const edgeDirs = new Map<number, number[]>();
  const push = (u: number, v: number, f: number): void => {
    const lo = u < v ? u : v; const hi = u < v ? v : u;
    const k = lo * SHIFT + hi;
    const fs = edgeFacets.get(k);
    if (fs === undefined) { edgeFacets.set(k, [f]); edgeDirs.set(k, [u < v ? 1 : -1]); }
    else { fs.push(f); (edgeDirs.get(k) as number[]).push(u < v ? 1 : -1); }
  };
  for (let f = 0; f < nF; f += 1) {
    const a = id[indices[f * 3]]; const b = id[indices[f * 3 + 1]]; const c = id[indices[f * 3 + 2]];
    push(a, b, f); push(b, c, f); push(c, a, f);
  }

  let nInterior = 0;
  for (const fs of edgeFacets.values()) if (fs.length === 2) nInterior += 1;
  const edgeF1 = new Int32Array(nInterior);
  const edgeF2 = new Int32Array(nInterior);
  const edgeAngRad = new Float64Array(nInterior);

  let interiorEdges = 0; let boundaryEdges = 0; let nonManifoldEdges = 0; let inconsistentEdges = 0;
  for (const [k, fs] of edgeFacets) {
    if (fs.length === 1) { boundaryEdges += 1; continue; }
    if (fs.length > 2) { nonManifoldEdges += 1; continue; }
    const slot = interiorEdges;
    interiorEdges += 1;
    const dirs = edgeDirs.get(k) as number[];
    // consistently-wound neighbours traverse a shared edge in OPPOSITE directions
    if (dirs[0] === dirs[1]) inconsistentEdges += 1;
    const f1 = fs[0]; const f2 = fs[1];
    let d = nx[f1] * nx[f2] + ny[f1] * ny[f2] + nz[f1] * nz[f2];
    if (d > 1) d = 1; else if (d < -1) d = -1;
    const ang = Math.acos(d);
    edgeF1[slot] = f1; edgeF2[slot] = f2; edgeAngRad[slot] = ang;
    if (ang > perFacetMaxRad[f1]) perFacetMaxRad[f1] = ang;
    if (ang > perFacetMaxRad[f2]) perFacetMaxRad[f2] = ang;
  }

  return {
    perFacetMaxRad, areaMm2, interiorEdges, boundaryEdges, nonManifoldEdges, inconsistentEdges,
    edgeF1, edgeF2, edgeAngRad,
  };
}

/**
 * AREA-weighted fraction of the mesh whose facet dihedral exceeds `thrRad`.
 * Area-weighted and not count-weighted on purpose: this project has measured count over-stating defect
 * AREA by 13-184x, with the two disagreeing in DIRECTION.
 */
export function areaFractionOver(
  d: { perFacetMaxRad: Float64Array; areaMm2: Float64Array },
  thrRad: number,
): number {
  let over = 0; let total = 0;
  for (let f = 0; f < d.areaMm2.length; f += 1) {
    total += d.areaMm2[f];
    if (d.perFacetMaxRad[f] > thrRad) over += d.areaMm2[f];
  }
  return total > 0 ? over / total : 0;
}
