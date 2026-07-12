/**
 * verdictRefine.ts — Two-pass build VERDICT SCORER (Gyroid-knee-ship plan, T2).
 *
 * The two-pass build is: build -> SCORE outlier facets (this module) -> escalate
 * their 1-rings -> rebuild. This module answers "which facets are under-tessellated,
 * and by how much" using an HONEST geometric chord/max-sag measurement against the
 * LIFT sampler (the surface the emitted triangles actually carry) — never the
 * `MetricSizingField` curvature. Reading the sizing field is exactly the mistake
 * that made every prior build-time predictor fail (it under-reads true curvature
 * 1.2-20x); a post-build geometric measurement cannot lie about the surface it
 * lifts against.
 *
 * STYLE-AGNOSTIC BY CONSTRUCTION: this scorer takes only a mesh (u,t) triangulation
 * and a lift sampler. It never reads a manifest analytic radius (`rA`) or any
 * per-style constant, which is what lets it generalize to arbitrary user styles/dims
 * rather than the lab champion shapes alone.
 *
 * IMPORT HYGIENE (hard constraint): this module does NOT import from `tierC/**`.
 * `tierC/index.ts` (lines 55-62) statically pulls in `node:worker_threads`, which
 * crashes the browser bundle at boot. The dense-barycentric lattice + sag geometry
 * below is a local reimplementation mirroring the proven instrument in
 * `research/bridge/_tierc_p2_5c.test.ts` (`denseBary(8)` + per-facet max-deviation-
 * from-plane) — same geometry, no shared import.
 *
 * @module conforming/verdictRefine
 */

/** One under-tessellated cell on the quadtree grid: `iu` at `featureLevel + uBias`
 * resolution, `it` at `featureLevel` resolution (matches production's cell keying). */
export interface OutlierCell {
  iu: number;
  it: number;
  worstMm: number;
}

/** The fidelity ("lift") sampler — the surface the emitted triangles actually carry.
 * Callers pass `opts.efgSampler ?? sampler` (the warp-composed sampler), never the
 * `MetricSizingField`. */
export interface VerdictLiftSampler {
  position(u: number, t: number): [number, number, number] | Float32Array;
}

/** The candidate mesh to score. Vertices are packed (u, t, surfaceId) per vertex —
 * see `ConformingWall.ts` (`buildConformingWall` stamps `surfaceId` into slot 2 of
 * every vertex triple at ConformingWall.ts:913-918); indices are per-triangle. */
export interface VerdictScorableMesh {
  vertices: Float32Array;
  indices: Uint32Array | number[];
}

/** `buildConformingWall`'s output packs 3 floats/vertex: (u, t, surfaceId). Verified
 * against `ConformingWall.ts` — do not assume; re-check there if that packing changes. */
const VERTEX_STRIDE = 3;

/** Dense barycentric lattice over a triangle: (n+1)(n+2)/2 points (wa,wb,wc) with
 * wa+wb+wc=1, spaced 1/n apart. Mirrors `denseBary` in
 * `research/bridge/_gyroid_truthLib.ts` / `_tierc_p2_5c.test.ts` byte-for-byte in
 * geometry (not imported — see import-hygiene note above). */
function denseBary(n: number): Array<[number, number, number]> {
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j + i <= n; j++) {
      pts.push([i / n, j / n, (n - i - j) / n]);
    }
  }
  return pts;
}

const DENSE8 = denseBary(8);

function toXYZ(p: [number, number, number] | Float32Array): [number, number, number] {
  return [p[0], p[1], p[2]];
}

/** `d - round(d)`: wraps a u-difference into (-0.5, 0.5], the shortest signed step
 * across the periodic u=0/u=1 seam. Mirrors P2.5c's `wrapDu`. */
function wrapDu(d: number): number {
  return d - Math.round(d);
}

/**
 * Max perpendicular distance of `p` from the plane through (a,b,c). Uses the
 * triangle's own normal (cross product of two edges) — no nearest-point search,
 * no curved-surface projection, just the chord/max-sag definition from the brief.
 * A degenerate (zero-area) triangle has no plane to compare against; it contributes
 * 0 (callers score real facets from a real triangulation, so this is defensive only).
 */
function perpDistToPlane(
  p: [number, number, number],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
): number {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const nLen = Math.hypot(nx, ny, nz);
  if (nLen < 1e-15) return 0;
  const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2];
  const dot = apx * nx + apy * ny + apz * nz;
  return Math.abs(dot) / nLen;
}

/**
 * Score a sparse candidate facet set for under-tessellation against the LIFT
 * sampler, keyed onto the quadtree (iu,it) grid — `iu` at `featureLevel + uBias`,
 * `it` at `featureLevel` (identical to the production quadtree's cell keying).
 *
 * For each candidate facet: lift its 3 (u,t) vertices via `liftSampler.position`
 * to form the planar 3D triangle, dense-barycentric sample the (u,t) triangle
 * (`denseBary(8)`), lift each interior sample, and take the max perpendicular
 * deviation of the lifted point from the triangle's own plane — that is the
 * facet's chord/max-sag. Facets are aggregated onto their (iu,it) cell (max wins);
 * cells whose worst exceeds `tolMm` are returned.
 */
export function scoreCandidateFacets(
  mesh: VerdictScorableMesh,
  liftSampler: VerdictLiftSampler,
  candidateFacetIndices: number[],
  tolMm: number,
  featureLevel: number,
  uBias: number,
): OutlierCell[] {
  const { vertices, indices } = mesh;
  const uAt = (vi: number): number => vertices[vi * VERTEX_STRIDE];
  const tAt = (vi: number): number => vertices[vi * VERTEX_STRIDE + 1];

  // The production quadtree indexes u at the FINER resolution `featureLevel + uBias`
  // and t at `featureLevel` (see P2.5c cellKeyOf / cellFlagAt). The escalation
  // builder (next task) keys cells the same way, so the 1-ring escalation targets
  // the identical footprint — the u/t resolutions MUST match production here.
  const uCellRes = 1 << (featureLevel + uBias);
  const tCellRes = 1 << featureLevel;
  const cells = new Map<number, OutlierCell>();

  for (const f of candidateFacetIndices) {
    const ia = indices[3 * f], ib = indices[3 * f + 1], ic = indices[3 * f + 2];
    const ua = uAt(ia), ta = tAt(ia);
    const ub = uAt(ib), tb = tAt(ib);
    const uc = uAt(ic), tc = tAt(ic);

    const A = toXYZ(liftSampler.position(ua, ta));
    const B = toXYZ(liftSampler.position(ub, tb));
    const C = toXYZ(liftSampler.position(uc, tc));

    let worst = 0;
    for (const [wa, wb, wc] of DENSE8) {
      const u = wa * ua + wb * ub + wc * uc;
      const t = wa * ta + wb * tb + wc * tc;
      const P = toXYZ(liftSampler.position(u, t));
      const d = perpDistToPlane(P, A, B, C);
      if (d > worst) worst = d;
    }

    // Key the facet to its cell on the (iu,it) grid via its centroid, wrapping u
    // across the periodic seam (mirrors P2.5c's buildCentroidGrid / cellKeyOf). The
    // u-axis is indexed at `featureLevel + uBias`, the t-axis at `featureLevel`.
    const uCentroidRaw = ua + (wrapDu(ub - ua) + wrapDu(uc - ua)) / 3;
    const uCentroid = ((uCentroidRaw % 1) + 1) % 1;
    const tCentroid = (ta + tb + tc) / 3;
    const iu = Math.min(uCellRes - 1, Math.max(0, Math.floor(uCentroid * uCellRes)));
    const it = Math.min(tCellRes - 1, Math.max(0, Math.floor(Math.min(1 - 1e-12, Math.max(0, tCentroid)) * tCellRes)));
    const key = it * uCellRes + iu;

    const existing = cells.get(key);
    if (!existing || worst > existing.worstMm) {
      cells.set(key, { iu, it, worstMm: worst });
    }
  }

  const out: OutlierCell[] = [];
  for (const cell of cells.values()) {
    if (cell.worstMm > tolMm) out.push(cell);
  }
  return out;
}
