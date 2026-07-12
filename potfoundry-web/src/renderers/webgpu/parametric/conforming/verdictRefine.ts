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

/** One marked escalation target cell on the (iu,it) grid, with its bounding
 * box in (u,t) parametric space — mirrors P2.5c's `CellFlag` (see
 * `research/bridge/_tierc_p2_5c.test.ts:231`, `cellFlagAt`), minus the fields
 * this builder doesn't need (`level`, `cu0`/`cu1`/`ct0`/`ct1` are still
 * required for the range-overlap query below). */
interface OneRingFlag {
  target: number;
  cu0: number;
  cu1: number;
  ct0: number;
  ct1: number;
  tc: number;
}

/**
 * Turns the T2 scorer's `OutlierCell[]` into a `featureLevelAt`-shaped
 * command function covering each outlier cell AND its 8-neighbour 1-ring —
 * proven necessary by research P2.5c: escalating only the single outlier
 * cell leaves a 2:1-balance transition-apron sliver on a NEIGHBOUR (worst
 * 0.0108, minAngle 2.31 deg); the 1-ring lands that apron in the smooth zone.
 *
 * Keys cells on the IDENTICAL (iu,it) grid the T2 scorer
 * (`scoreCandidateFacets`) and the production quadtree use: u at
 * `1 << (featureLevel + uBias)` resolution (PERIODIC — wraps 0≡1), t at
 * `1 << featureLevel` resolution (NOT periodic — clamped to the valid
 * range). Matching this convention exactly is what makes the 1-ring target
 * the correct footprint; re-deriving it differently would silently escalate
 * the wrong cells.
 *
 * `baseLevel` for the commanded escalation starts from the caller's
 * `featureLevel` (the two-pass loop escalates +1 per pass and re-invokes this
 * builder each pass with its own `featureLevel`), so a single call commands
 * `min(featureLevel + 1, maxLevel)` uniformly across every marked cell —
 * `maxLevel` caps it so an outlier already at `maxLevel` commands no deeper.
 *
 * Overlapping 1-rings from adjacent outliers MERGE (max, not sum/double-
 * count) — see the `marks` de-dup below.
 *
 * The returned closure mirrors P2.5c's `makeSparseLevelAt` sparse-lookup
 * structure (`research/bridge/_tierc_p2_5c.test.ts:242-268`): flags sorted by
 * t-center with a binary-search lower-bound prune, then a periodic-wrapped
 * u-overlap test — reimplemented locally (not imported; this module does not
 * import from `research/**`, see the import-hygiene note at the top of this
 * file). O(log N_targets + k) per query, k = overlapping flags near the
 * query's t-band — sparse, since the production quadtree consults `levelAt`
 * on many cells per build (T1).
 */
export function buildOneRingLevelAt(
  outliers: OutlierCell[],
  featureLevel: number,
  uBias: number,
  maxLevel: number,
): (u0: number, t0: number, size: number) => number {
  const uCellRes = 1 << (featureLevel + uBias);
  const tCellRes = 1 << featureLevel;
  const commandedLevel = Math.min(featureLevel + 1, maxLevel);

  // Mark each outlier cell + its 1-ring: iu±1 periodic-wrapped at uCellRes,
  // it±1 clamped (dropped when out of [0,tCellRes)). De-duped by (iu,it) key
  // taking the max target — this IS the merge: two outliers whose rings
  // overlap the same cell never double-apply or sum, they just agree (both
  // commanding the same `commandedLevel` here, but `max` keeps this correct
  // even if a future caller passes per-outlier levels).
  const marks = new Map<number, number>();
  for (const o of outliers) {
    for (let dt = -1; dt <= 1; dt++) {
      const it = o.it + dt;
      if (it < 0 || it >= tCellRes) continue; // t is NOT periodic — clamp by dropping
      for (let du = -1; du <= 1; du++) {
        const iu = ((o.iu + du) % uCellRes + uCellRes) % uCellRes; // periodic wrap
        const key = it * uCellRes + iu;
        const existing = marks.get(key);
        if (existing === undefined || commandedLevel > existing) {
          marks.set(key, commandedLevel);
        }
      }
    }
  }

  const flags: OneRingFlag[] = [];
  for (const [key, target] of marks) {
    const iu = key % uCellRes;
    const it = (key - iu) / uCellRes;
    const cu0 = iu / uCellRes, cu1 = (iu + 1) / uCellRes;
    const ct0 = it / tCellRes, ct1 = (it + 1) / tCellRes;
    flags.push({ target, cu0, cu1, ct0, ct1, tc: (ct0 + ct1) / 2 });
  }

  // Sparse lookup structure — mirrors P2.5c's makeSparseLevelAt shape
  // (sorted-by-tc + binary-search lower_bound t-prune, then a periodic-
  // wrapped u-overlap test over the pruned band). One deliberate deviation
  // from P2.5c's boundary convention: P2.5c's overlap test is INCLUSIVE of
  // mere edge-touching (`< cu1 + EPS` / `> cu0 - EPS`), which is correct for
  // its coarse-ancestor "does this box's edge graze a feature" query but
  // would wrongly light up an off-target cell that only shares a boundary
  // with a marked cell (zero-area intersection) when queried at THIS
  // builder's own resolution — breaking the "0 everywhere else" contract
  // from the brief. This overlap test is STRICT (excludes zero-area
  // touching) instead, via a small negative EPS margin on each side; a
  // genuine partial-area overlap (the coarse-ancestor case this structure
  // still supports) is unaffected since real overlaps exceed 2*EPS.
  const sorted = flags.slice().sort((a, b) => a.tc - b.tc);
  const tcs = Float64Array.from(sorted.map((f) => f.tc));
  const maxFlagT = 1 / tCellRes;
  const EPS = 1e-9;
  const lowerBound = (arr: Float64Array, x: number): number => {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < x) lo = mid + 1; else hi = mid;
    }
    return lo;
  };
  const uOverlap = (qu0: number, qu1: number, cu0: number, cu1: number): boolean => {
    for (const s of [-1, 0, 1]) if (qu0 + s < cu1 - EPS && qu1 + s > cu0 + EPS) return true;
    return false;
  };

  return (u0: number, t0: number, size: number): number => {
    // Query box in (u,t) space. u-width scales by 1<<uBias since u is
    // indexed at the finer featureLevel+uBias resolution while `size` is
    // expressed in t-units (matches belowFeatureFloorTest's call convention
    // in PeriodicBalancedQuadtree.ts and P2.5c's makeSparseLevelAt).
    const qU0 = u0, qU1 = u0 + size / (1 << uBias);
    const qT0 = t0, qT1 = t0 + size;
    let best = 0;
    for (let i = lowerBound(tcs, qT0 - maxFlagT - EPS); i < sorted.length && tcs[i] <= qT1 + EPS; i++) {
      const fl = sorted[i];
      if (fl.ct0 < qT1 - EPS && fl.ct1 > qT0 + EPS && uOverlap(qU0, qU1, fl.cu0, fl.cu1)) {
        if (fl.target > best) best = fl.target;
      }
    }
    return best;
  };
}

/**
 * `buildOneRingLevelAt` GENERALIZED from a single uniform `featureLevel + 1`
 * command to a PER-CORE-CELL commanded level (T4 accumulating two-pass loop).
 *
 * `targets` maps a CORE outlier cell's key — the IDENTICAL key the T2 scorer and
 * T3 builder use, `it * uCellRes + iu` with `uCellRes = 1 << (featureLevel +
 * uBias)` — to the level it should be driven to. For each core cell this marks
 * the cell AND its 8-neighbour 1-ring (periodic-wrapped in `iu`, clamped/dropped
 * in `it` — the SAME ring geometry `buildOneRingLevelAt` uses, and for the same
 * P2.5c reason: escalating only the single core leaves a 2:1-balance apron sliver
 * on a neighbour) at that core's commanded level. Overlapping rings from adjacent
 * cores take the MAX (the deeper command wins); everything off-target returns 0.
 *
 * This is what lets the two-pass loop ACCUMULATE across passes: each pass folds
 * surviving outliers one level deeper into a persistent `targets` map and rebuilds
 * the closure from the FULL map, so a cell closed in an earlier pass keeps its
 * escalation (never re-opened) while survivors keep climbing toward `maxLevel`.
 *
 * `commandedLevel` per core is `min(target, maxLevel)`; a target already at/above
 * `maxLevel` simply commands `maxLevel`. The sparse-lookup structure and the
 * strict (zero-area-excluding) overlap predicate are identical to
 * `buildOneRingLevelAt` — see that function's doc for the boundary-convention
 * rationale; the two are kept in sync by hand (this module does not import from
 * `research/**`).
 */
export function buildLevelAtFromTargets(
  targets: Map<number, number>,
  featureLevel: number,
  uBias: number,
  maxLevel: number,
): (u0: number, t0: number, size: number) => number {
  const uCellRes = 1 << (featureLevel + uBias);
  const tCellRes = 1 << featureLevel;

  // Mark each core cell + its 1-ring at the core's OWN commanded level (capped at
  // maxLevel). Overlapping rings de-dup by (iu,it) taking the max target.
  const marks = new Map<number, number>();
  for (const [coreKey, level] of targets) {
    const coreIu = coreKey % uCellRes;
    const coreIt = (coreKey - coreIu) / uCellRes;
    const commanded = Math.min(level, maxLevel);
    for (let dt = -1; dt <= 1; dt++) {
      const it = coreIt + dt;
      if (it < 0 || it >= tCellRes) continue; // t is NOT periodic — clamp by dropping
      for (let du = -1; du <= 1; du++) {
        const iu = ((coreIu + du) % uCellRes + uCellRes) % uCellRes; // periodic wrap
        const key = it * uCellRes + iu;
        const existing = marks.get(key);
        if (existing === undefined || commanded > existing) {
          marks.set(key, commanded);
        }
      }
    }
  }

  const flags: OneRingFlag[] = [];
  for (const [key, target] of marks) {
    const iu = key % uCellRes;
    const it = (key - iu) / uCellRes;
    const cu0 = iu / uCellRes, cu1 = (iu + 1) / uCellRes;
    const ct0 = it / tCellRes, ct1 = (it + 1) / tCellRes;
    flags.push({ target, cu0, cu1, ct0, ct1, tc: (ct0 + ct1) / 2 });
  }

  // Sparse lookup — IDENTICAL structure to buildOneRingLevelAt (sorted-by-tc +
  // binary-search lower_bound t-prune, then a periodic-wrapped STRICT u-overlap).
  const sorted = flags.slice().sort((a, b) => a.tc - b.tc);
  const tcs = Float64Array.from(sorted.map((f) => f.tc));
  const maxFlagT = 1 / tCellRes;
  const EPS = 1e-9;
  const lowerBound = (arr: Float64Array, x: number): number => {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < x) lo = mid + 1; else hi = mid;
    }
    return lo;
  };
  const uOverlap = (qu0: number, qu1: number, cu0: number, cu1: number): boolean => {
    for (const s of [-1, 0, 1]) if (qu0 + s < cu1 - EPS && qu1 + s > cu0 + EPS) return true;
    return false;
  };

  return (u0: number, t0: number, size: number): number => {
    const qU0 = u0, qU1 = u0 + size / (1 << uBias);
    const qT0 = t0, qT1 = t0 + size;
    let best = 0;
    for (let i = lowerBound(tcs, qT0 - maxFlagT - EPS); i < sorted.length && tcs[i] <= qT1 + EPS; i++) {
      const fl = sorted[i];
      if (fl.ct0 < qT1 - EPS && fl.ct1 > qT0 + EPS && uOverlap(qU0, qU1, fl.cu0, fl.cu1)) {
        if (fl.target > best) best = fl.target;
      }
    }
    return best;
  };
}

/**
 * The feature-driven refinement spec the quadtree consumes — mirrors
 * `ConformingWall.ts`'s (non-exported) `type FeatureRefineSpec` byte-for-byte
 * (verified against that file directly; the real type is not exported, so
 * this is an intentionally-duplicated local declaration — keep both in sync
 * by hand if that shape ever changes). Production always supplies
 * `intersects` (built by `buildFeatureIntersector` from `featureLines`)
 * whenever `featureLines` is non-empty (`ConformingWall.ts:848-856`), so this
 * selector consumes the SAME cheap box-vs-segment predicate the quadtree
 * itself consults for cell refinement — there is no separate `featureLines`
 * field on the real type to read directly.
 */
export interface CandidateFeatureRefineSpec {
  level: number;
  intersects: (u0: number, t0: number, size: number) => boolean;
  levelAt?: (u0: number, t0: number, size: number) => number;
}

/**
 * Minimal reader surface this selector needs from `MetricSizingField` — just
 * its public `edgeLength(u,t)` target-mm query (verified against
 * `MetricSizingField.ts`: the class exposes no direct kappa/threshold
 * accessor, only the graded target edge length by bilinear interpolation).
 */
export interface CandidateSizingFieldReader {
  edgeLength(u: number, t: number): number;
}

/** Margin below which a nearby sizing-field reading counts as a local
 * "under-read" drop relative to the facet's own centroid reading (T5). */
const SIZING_UNDERREAD_MARGIN = 0.12;
/** Sub-cell probe radius (fraction of the feature-grid cell size) used to
 * detect a sizing-field reading that changes sharply just off-centroid. */
const SIZING_PROBE_FRACTION = 0.25;

/**
 * Does the facet's own (iu,it) feature-grid cell, or its 1-ring neighbourhood,
 * get crossed by `featureRefine.intersects`? Tested as a single enlarged box
 * (3 cells wide, centered on the facet's own cell) against the SAME cheap
 * box-vs-segment predicate the quadtree itself consults for on-contour
 * refinement — just widened by one cell on each side, which is what makes an
 * OFF-contour but near-band facet (like the Gyroid knee) reachable.
 */
function isNearBandCandidate(
  featureRefine: CandidateFeatureRefineSpec,
  uc: number,
  tc: number,
  cellRes: number,
  cellSize: number,
): boolean {
  const iu = Math.min(cellRes - 1, Math.max(0, Math.floor(uc * cellRes)));
  const it = Math.min(cellRes - 1, Math.max(0, Math.floor(Math.min(1 - 1e-12, Math.max(0, tc)) * cellRes)));
  const u0 = (iu - 1) * cellSize;
  const t0 = (it - 1) * cellSize;
  return featureRefine.intersects(u0, t0, 3 * cellSize);
}

/**
 * Local-gradient proxy for the P2.4 sizing-field "under-read" band: the
 * production `MetricSizingField` bilinearly interpolates a target edge
 * length off a coarse `resU x resT` grid, so a true curvature ridge that
 * falls BETWEEN two grid nodes can read smooth/coarse exactly at a facet's
 * own centroid while the reading drops sharply a fraction of a cell away —
 * the mechanism behind the documented 1.2-20x broad under-read near features.
 * `selectCandidateFacets` has no physical sampler / metric-tensor access (the
 * T5 interface takes only `mesh`/`featureRefine`/`sizingField`), so it cannot
 * reproduce `shouldRefine`'s literal physical-cell-size-vs-`edgeLength` ratio
 * test; this probes a small (u,t) neighbourhood of the centroid instead and
 * flags a sharp local drop as a candidate worth the T2 scorer's real chord
 * measurement.
 */
function isSizingUnderReadCandidate(
  sizingField: CandidateSizingFieldReader,
  uc: number,
  tc: number,
  cellSize: number,
): boolean {
  const probe = cellSize * SIZING_PROBE_FRACTION;
  const center = sizingField.edgeLength(uc, tc);
  let minNearby = center;
  const offsets: Array<[number, number]> = [[probe, 0], [-probe, 0], [0, probe], [0, -probe]];
  for (const [du, dt] of offsets) {
    const v = sizingField.edgeLength(uc + du, Math.min(1, Math.max(0, tc + dt)));
    if (v < minNearby) minNearby = v;
  }
  return minNearby < center * (1 - SIZING_UNDERREAD_MARGIN);
}

/**
 * Cheap SUPERSET selector for the two-pass verdict loop (T5) — returns the
 * facet indices the T2 scorer (`scoreCandidateFacets`) should actually
 * dense-sample, so a pass never dense-scans the whole mesh (P2.5c's full scan
 * of the 2.24M-tri mesh took minutes). A facet is a candidate iff EITHER:
 *
 *  - its (iu,it) feature-grid cell, or any of its 1-ring neighbours, is
 *    crossed by `featureRefine.intersects` (`isNearBandCandidate`). The
 *    Gyroid knee sits just OFF the contour itself (`contourCrossed=false` at
 *    `radial≈0.287`) but inside this near-band reach — exactly why T1 had to
 *    decouple `levelAt` from the `intersects` short-circuit in
 *    `PeriodicBalancedQuadtree.ts`: an off-contour cell can still be a
 *    genuine outlier, and this selector is what makes it reachable by the
 *    scorer in the first place.
 *  - (when `sizingField` is supplied) the sizing field's own reading is
 *    locally STEEP near the facet's centroid — the P2.4 "under-read" proxy;
 *    see `isSizingUnderReadCandidate`'s doc comment for the mechanism and its
 *    documented limitation (no physical-size ground truth available here).
 *
 * Both checks key onto the SAME `featureRefine.level`-resolution (iu,it) grid
 * `scoreCandidateFacets` / `buildOneRingLevelAt` use — isotropic (this
 * selector's `featureRefine` shape carries no `uBias`, matching the real,
 * non-exported `FeatureRefineSpec` in `ConformingWall.ts`).
 */
export function selectCandidateFacets(
  mesh: VerdictScorableMesh,
  featureRefine: CandidateFeatureRefineSpec,
  sizingField?: CandidateSizingFieldReader,
): number[] {
  const { vertices, indices } = mesh;
  const uAt = (vi: number): number => vertices[vi * VERTEX_STRIDE];
  const tAt = (vi: number): number => vertices[vi * VERTEX_STRIDE + 1];
  const cellRes = 1 << featureRefine.level;
  const cellSize = 1 / cellRes;
  const facetCount = Math.floor(indices.length / 3);
  const out: number[] = [];

  for (let f = 0; f < facetCount; f++) {
    const ia = indices[3 * f], ib = indices[3 * f + 1], ic = indices[3 * f + 2];
    const ua = uAt(ia), ta = tAt(ia);
    const ub = uAt(ib), tb = tAt(ib);
    const ucv = uAt(ic), tcv = tAt(ic);

    // Centroid, wrapping u across the periodic seam (mirrors scoreCandidateFacets).
    const uCentroidRaw = ua + (wrapDu(ub - ua) + wrapDu(ucv - ua)) / 3;
    const uCentroid = ((uCentroidRaw % 1) + 1) % 1;
    const tCentroid = (ta + tb + tcv) / 3;

    if (isNearBandCandidate(featureRefine, uCentroid, tCentroid, cellRes, cellSize)) {
      out.push(f);
      continue;
    }
    if (sizingField && isSizingUnderReadCandidate(sizingField, uCentroid, tCentroid, cellSize)) {
      out.push(f);
    }
  }
  return out;
}
