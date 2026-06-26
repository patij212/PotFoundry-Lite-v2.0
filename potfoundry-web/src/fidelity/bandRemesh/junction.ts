/**
 * junction.ts — Watertight triple-junction paving (spike gate B).
 *
 * At a Voronoi triple junction, three relief-web ribbons meet at a common point.
 * This module paves the three bands AND the central junction polygon they
 * enclose, combining everything into ONE {@link Mesh3} that shares the bands'
 * junction-END-row vertices EXACTLY — so no boundary edge runs along the
 * inter-band seams ⇒ watertight by construction.
 *
 * ## The construction (an extension of the Task-5 stitch discipline)
 *
 * Each arm `i` is a finite ribbon between two rails (foot, crest). Its
 * JUNCTION-END rails terminate at two ADJACENT junction corners `Pi`, `P(i+1)`.
 * Adjacent arms SHARE a corner exactly (arm-i's crest end corner ≡ arm-(i+1)'s
 * foot end corner). The bands are paved exactly as in Task 5 (densify rails →
 * {@link buildStations} → {@link paveBand}).
 *
 * The CENTRAL junction polygon is bounded by the three junction-END rows. Its
 * boundary vertices ARE those end-row vertices (foot corner → interior cross-band
 * points → crest corner), shared by exact (u,t) key. The polygon is paved as a
 * CENTROID FAN: one fresh center vertex at the junction center, fanned to every
 * consecutive boundary-edge pair. Each end-row cross-band edge is therefore used
 * by exactly one band triangle (its last zip) + one junction fan triangle ⇒ each
 * seam edge incidence = 2 ⇒ watertight.
 *
 * ## Why this is watertight (the crux)
 *
 *   1. **densify-and-share** — both rails of every arm are densified ONCE to
 *      ≤ targetEdgeMm/2 and fed to `buildStations` (Task-5 mechanism).
 *   2. **the band's END row IS the junction boundary** — the junction fan reuses
 *      the band's exact end-row vertex ids (foot/crest corners via
 *      `railVertexIds`; interior cross-band points via the shared (u,t) weld).
 *      It does NOT re-mint junction-boundary vertices independently.
 *   3. **exact-(u,t)-key weld** — all bands and the junction are interned into one
 *      combined vertex table keyed by exact (u,t). Identical (u,t) ⇒ same combined
 *      index. Corner sharing between adjacent arms is automatic (same corner (u,t)).
 *
 * ## Scope (PROOF, not production wiring)
 *
 * A synthetic, self-contained Y-junction on a `SyntheticCylinderSampler`, enough
 * to PROVE the 3-way join is watertight. It does NOT touch production code. The
 * bands are simple two-rail ribbons; the junction is a small centroid fan.
 *
 * @module fidelity/bandRemesh/junction
 */

import type { SurfaceSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { Mesh3 } from './audit';
import { buildStations } from './stations';
import type { StationPoint, StationRow } from './stations';
import { paveBand } from './paver';
import { densifyRail } from './stitch';
import { quantizeRailUT } from './railKey';

// ── Public types ────────────────────────────────────────────────────────────────

/** One arm (ribbon) feeding the triple junction. */
export interface JunctionArm {
  /**
   * Foot rail polyline (≥2 (u,t) points), OUTER end → junction end. May be
   * sparse — it is densified internally. Its LAST point must equal
   * `junctionFoot` (the junction-end foot corner).
   */
  footRail: StationPoint[];
  /**
   * Crest rail polyline (≥2 (u,t) points), OUTER end → junction end. May be
   * sparse — it is densified internally. Its LAST point must equal
   * `junctionCrest` (the junction-end crest corner).
   */
  crestRail: StationPoint[];
  /** The EXACT junction-end foot corner (shared with the previous arm). */
  junctionFoot: StationPoint;
  /** The EXACT junction-end crest corner (shared with the next arm). */
  junctionCrest: StationPoint;
}

/** Output of {@link paveJunction}. */
export interface JunctionResult {
  /** The combined three-band + junction mesh (watertight by construction). */
  mesh: Mesh3;
  /**
   * (u,t) per combined-mesh vertex (aligned to `mesh.positions`), each on the QSCALE
   * dyadic grid. The assembler welds the junction's outer perimeter to the cdt2d
   * interior by these (u,t) — exactly as `paveRidge` (featureStrip.ts) exposes its
   * `vertexUT`. Bit-compatible with the production complement's `railVertexKey`.
   */
  vertexUT: Array<[number, number]>;
  /**
   * The junction sub-mesh alone (in combined-mesh indexing), for triangle
   * quality checks over the central polygon.
   */
  junctionMesh: Mesh3;
  /**
   * The mesh's TRUE open-boundary vertices: the OUTER end row of each band (the
   * three free ends of the Y). Pass to
   * `auditWatertight({ boundaryVertexIndices })` — every count-1 edge NOT on
   * these outer rings is a real defect (T-junction).
   */
  openBoundaryVertices: Set<number>;
  /**
   * Canonical "i:j" edge keys (combined-mesh indices, i<j) for every edge that
   * runs along the junction↔band seam (the bands' end-row cross-band edges).
   * Each must be referenced exactly twice in `mesh.indices` (one band tri + one
   * junction fan tri) — the direct watertightness proof.
   */
  sharedEdgeKeys: string[];
}

// ── helpers ──────────────────────────────────────────────────────────────────────

/** Canonical (u,t) dedup key — MUST match paver.ts / stitch.ts interning convention. */
function utKey(u: number, t: number): string {
  return `${u}|${t}`;
}

/** Canonical undirected edge key (i<j). */
function edgeKey(i: number, j: number): string {
  return i < j ? `${i}:${j}` : `${j}:${i}`;
}

/** Minimum interior angle (degrees) of triangle (A,B,C) from 3D side lengths. */
function minAngle3DXyz(A: Vec3, B: Vec3, C: Vec3): number {
  const c = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); // |AB|
  const b = Math.hypot(C[0] - A[0], C[1] - A[1], C[2] - A[2]); // |CA|
  const a = Math.hypot(B[0] - C[0], B[1] - C[1], B[2] - C[2]); // |BC|
  const ang = (adj1: number, adj2: number, opp: number): number => {
    if (adj1 <= 0 || adj2 <= 0) return 0;
    const cos = Math.max(-1, Math.min(1, (adj1 * adj1 + adj2 * adj2 - opp * opp) / (2 * adj1 * adj2)));
    return (Math.acos(cos) * 180) / Math.PI;
  };
  return Math.min(ang(b, c, a), ang(a, c, b), ang(a, b, c));
}

/** 3D position triple. */
type Vec3 = readonly [number, number, number];

/**
 * Triangulate a simple polygon (given as a loop of 3D points) into triangles
 * referencing ONLY the loop vertices — no Steiner points — so EVERY polygon
 * boundary edge is preserved exactly (the watertight seam requirement). Returns
 * triangles as index triples into `loop`.
 *
 * Two-stage:
 *   1. **Best-ear clipping.** Repeatedly clip the ear whose triangle has the
 *      largest 3D minimum interior angle (a max-min-angle greedy), tie-broken by
 *      not clipping reflex/degenerate ears. This already avoids the corner
 *      slivers a single centroid fan produces.
 *   2. **Delaunay-style edge flips.** Flip any interior diagonal shared by two
 *      triangles if flipping raises the pair's 3D minimum interior angle, to
 *      convergence. On the near-flat local patch this drives toward the
 *      max-min-angle (Delaunay) triangulation.
 *
 * Convexity/winding: the loop is projected to a local tangent plane (PCA-free:
 * the polygon is tiny and near-planar on the cylinder) only to determine ear
 * convexity sign; all quality scoring uses true 3D side lengths.
 */
function triangulatePolygon3D(loop: Vec3[]): Array<[number, number, number]> {
  const n = loop.length;
  if (n < 3) return [];
  if (n === 3) return [[0, 1, 2]];

  // Local tangent basis from the loop's mean normal (Newell) for convexity sign.
  const c: [number, number, number] = [0, 0, 0];
  for (const p of loop) {
    c[0] += p[0];
    c[1] += p[1];
    c[2] += p[2];
  }
  c[0] /= n;
  c[1] /= n;
  c[2] /= n;
  const nrm: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % n];
    nrm[0] += (a[1] - c[1]) * (b[2] - c[2]) - (a[2] - c[2]) * (b[1] - c[1]);
    nrm[1] += (a[2] - c[2]) * (b[0] - c[0]) - (a[0] - c[0]) * (b[2] - c[2]);
    nrm[2] += (a[0] - c[0]) * (b[1] - c[1]) - (a[1] - c[1]) * (b[0] - c[0]);
  }
  const nlen = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
  nrm[0] /= nlen;
  nrm[1] /= nlen;
  nrm[2] /= nlen;
  // Signed area (×2) of triangle (A,B,C) projected along the polygon normal.
  const signedArea2 = (A: Vec3, B: Vec3, Cc: Vec3): number => {
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const vx = Cc[0] - A[0], vy = Cc[1] - A[1], vz = Cc[2] - A[2];
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    return cx * nrm[0] + cy * nrm[1] + cz * nrm[2];
  };

  // ── Stage 1: best-ear clipping ────────────────────────────────────────────────
  const remaining: number[] = [];
  for (let i = 0; i < n; i++) remaining.push(i);
  const tris: Array<[number, number, number]> = [];

  const pointInTri = (P: Vec3, A: Vec3, B: Vec3, Cc: Vec3): boolean => {
    const d1 = signedArea2(P, A, B);
    const d2 = signedArea2(P, B, Cc);
    const d3 = signedArea2(P, Cc, A);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNeg && hasPos);
  };

  let guard = 0;
  while (remaining.length > 3 && guard++ < 10000) {
    let bestEar = -1;
    let bestScore = -Infinity;
    const m = remaining.length;
    for (let k = 0; k < m; k++) {
      const ia = remaining[(k + m - 1) % m];
      const ib = remaining[k];
      const ic = remaining[(k + 1) % m];
      const A = loop[ia], B = loop[ib], Cc = loop[ic];
      // Convex (CCW w.r.t. polygon normal) ears only.
      if (signedArea2(A, B, Cc) <= 0) continue;
      // No other remaining vertex inside the candidate ear.
      let contains = false;
      for (let q = 0; q < m; q++) {
        const iq = remaining[q];
        if (iq === ia || iq === ib || iq === ic) continue;
        if (pointInTri(loop[iq], A, B, Cc)) {
          contains = true;
          break;
        }
      }
      if (contains) continue;
      const score = minAngle3DXyz(A, B, Cc);
      if (score > bestScore) {
        bestScore = score;
        bestEar = k;
      }
    }
    if (bestEar < 0) break; // no valid ear (numerical) — fall through with remainder
    const ia = remaining[(bestEar + m - 1) % m];
    const ib = remaining[bestEar];
    const ic = remaining[(bestEar + 1) % m];
    tris.push([ia, ib, ic]);
    remaining.splice(bestEar, 1);
  }
  if (remaining.length === 3) {
    tris.push([remaining[0], remaining[1], remaining[2]]);
  }

  // ── Stage 2: Delaunay-style edge flips (max-min-angle) ────────────────────────
  flipToMaxMinAngle(tris, loop, nrm);
  return tris;
}

/** Signed distance of point X from the line through A→B, measured along (n × (B−A)). */
function sideOfLine(A: Vec3, B: Vec3, X: Vec3, n: readonly [number, number, number]): number {
  // The in-plane perpendicular to A→B is  n × (B−A); the dot of (X−A) with it is a
  // signed sidedness scalar (sign only is used).
  const ex = B[0] - A[0], ey = B[1] - A[1], ez = B[2] - A[2];
  const px = n[1] * ez - n[2] * ey;
  const py = n[2] * ex - n[0] * ez;
  const pz = n[0] * ey - n[1] * ex;
  return (X[0] - A[0]) * px + (X[1] - A[1]) * py + (X[2] - A[2]) * pz;
}

/**
 * In-place Lawson flips: for each interior diagonal shared by two triangles,
 * flip it if the alternate diagonal raises the pair's 3D minimum interior angle
 * AND the two triangles form a convex quad (so the flip stays inside the polygon).
 * Boundary edges are never flipped (they appear in only one triangle), so the
 * polygon boundary is preserved — the watertight seam stays intact.
 *
 * @param nrm The polygon's mean normal, used for in-plane sidedness tests.
 */
function flipToMaxMinAngle(
  tris: Array<[number, number, number]>,
  loop: Vec3[],
  nrm: readonly [number, number, number],
): void {
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 5000) {
    changed = false;
    // Map each undirected edge → list of (triIndex, oppositeVertex).
    const edgeMap = new Map<string, Array<{ ti: number; opp: number }>>();
    for (let ti = 0; ti < tris.length; ti++) {
      const [a, b, cc] = tris[ti];
      const add = (i: number, j: number, opp: number): void => {
        const key = i < j ? `${i}:${j}` : `${j}:${i}`;
        const list = edgeMap.get(key) ?? [];
        list.push({ ti, opp });
        edgeMap.set(key, list);
      };
      add(a, b, cc);
      add(b, cc, a);
      add(cc, a, b);
    }
    for (const [key, list] of edgeMap) {
      if (list.length !== 2) continue; // boundary edge or already touched
      const [p, q] = key.split(':').map(Number);
      const r0 = list[0].opp;
      const r1 = list[1].opp;
      if (r0 === r1) continue;
      const P = loop[p], Q = loop[q], R0 = loop[r0], R1 = loop[r1];
      // The flip P-Q → R0-R1 is valid only if the quad (P,R0,Q,R1) is convex,
      // i.e. the two diagonals cross: R0,R1 straddle line P-Q AND P,Q straddle
      // line R0-R1 (in the polygon plane).
      const crosses =
        sideOfLine(P, Q, R0, nrm) * sideOfLine(P, Q, R1, nrm) < 0 &&
        sideOfLine(R0, R1, P, nrm) * sideOfLine(R0, R1, Q, nrm) < 0;
      if (!crosses) continue;
      const cur = Math.min(minAngle3DXyz(P, Q, R0), minAngle3DXyz(P, Q, R1));
      const alt = Math.min(minAngle3DXyz(R0, R1, P), minAngle3DXyz(R0, R1, Q));
      if (alt > cur + 1e-9) {
        tris[list[0].ti] = [r0, r1, p];
        tris[list[1].ti] = [r1, r0, q];
        changed = true;
        break; // rebuild edge map after a flip (simple + safe)
      }
    }
  }
}

/** A paved band plus the cross-band point sequence of its junction-END row. */
interface PavedArm {
  /** Band vertex (u,t) table (band-local indexing). */
  utVertices: Array<[number, number]>;
  /** Band triangle indices (band-local). */
  indices: Uint32Array;
  /**
   * Cross-band points of the junction-END row, foot→crest inclusive (the row
   * whose foot/crest endpoints are the junction corners). These bound the
   * junction polygon.
   */
  endRow: StationPoint[];
  /**
   * The arm's PERIMETER vertices that are part of the test patch's TRUE open
   * boundary: the OUTER end row + the foot rail + the crest rail. In production
   * these would weld to the cell-interior triangulation (exactly the Task-5
   * complement role); in this isolated junction patch they are legitimately open.
   *
   * The junction-END row is EXCLUDED — it must weld to the junction polygon
   * (count-2), so it is interior, not open boundary.
   */
  perimeter: StationPoint[];
}

/**
 * Pave one arm and capture its junction-END row + open-perimeter vertices.
 *
 * The arm is paved exactly like the Task-5 stitch band: densify both rails to a
 * safe margin below `buildStations`' precondition, build stations, pave. The
 * junction-END row is the row whose foot/crest endpoints are the junction
 * corners. `buildStations` places the FIRST row at the rails' start and the LAST
 * row at the rails' end; the rails are passed OUTER→junction, so the LAST row is
 * the junction end and the FIRST row is the outer (open) end.
 *
 * Perimeter (open boundary of the isolated patch) = OUTER row ∪ foot rail ∪
 * crest rail (all rows' w[0] / w[last]). The junction-END row's interior points
 * are deliberately omitted — they must weld to the junction polygon.
 */
function paveArm(
  arm: JunctionArm,
  sampler: SurfaceSampler,
  targetEdgeMm: number,
): PavedArm {
  const maxSpacingMm = (targetEdgeMm / 2) * 0.95;
  const footDense = densifyRail(arm.footRail, sampler, maxSpacingMm);
  const crestDense = densifyRail(arm.crestRail, sampler, maxSpacingMm);

  const grid = buildStations(footDense, crestDense, sampler, targetEdgeMm);
  const band = paveBand(grid, sampler);

  // The LAST row is the junction end (rails passed OUTER→junction).
  const rows: StationRow[] = grid.rows;
  const lastRow = rows[rows.length - 1];

  // Perimeter = OUTER row (all its cross-band points) + both side rails (each
  // row's foot=w[0] and crest=w[last]). This set excludes the junction-END row's
  // interior points (which must weld to the junction polygon, count-2).
  const perimeter: StationPoint[] = [];
  for (const p of rows[0].w) perimeter.push(p); // OUTER end row (open)
  for (const row of rows) {
    perimeter.push(row.w[0]); // foot rail (open)
    perimeter.push(row.w[row.w.length - 1]); // crest rail (open)
  }

  return {
    utVertices: band.utVertices,
    indices: band.indices,
    endRow: lastRow.w,
    perimeter,
  };
}

// ── paveJunction ──────────────────────────────────────────────────────────────────

/**
 * Pave a triple junction: three bands + the central polygon, combined into one
 * watertight {@link Mesh3}.
 *
 * @param arms          Exactly three arms (ribbons) feeding the junction. Arm
 *                      `i`'s crest junction corner must equal arm `(i+1)%3`'s
 *                      foot junction corner (exact (u,t)) so adjacent bands share
 *                      that corner.
 * @param sampler       Surface position evaluator.
 * @param targetEdgeMm  Target 3D edge length in mm (drives band + junction sizing).
 * @returns             See {@link JunctionResult}.
 */
export function paveJunction(
  arms: JunctionArm[],
  sampler: SurfaceSampler,
  targetEdgeMm: number,
): JunctionResult {
  if (arms.length !== 3) {
    throw new Error(`bandRemesh.paveJunction: expected exactly 3 arms (got ${arms.length})`);
  }

  // ── Combined-mesh vertex interning (exact (u,t) key) ──────────────────────────
  const combinedKeyToId = new Map<string, number>();
  const combinedUt: Array<[number, number]> = [];
  const internUt = (uRaw: number, tRaw: number): number => {
    // Snap onto the QSCALE dyadic grid BEFORE keying — parity with paveRidge
    // (featureStrip.ts) so the junction's rail/perimeter vertices weld bit-compatibly
    // with the production complement's railVertexKey (the assembler's keystone weld).
    // Sub-micron snap: watertightness + quality unchanged; coincident points (shared
    // corners, end-row weld) still collapse to one id.
    const [u, t] = quantizeRailUT(uRaw, tRaw);
    const key = utKey(u, t);
    let id = combinedKeyToId.get(key);
    if (id === undefined) {
      id = combinedUt.length;
      combinedKeyToId.set(key, id);
      combinedUt.push([u, t]);
    }
    return id;
  };
  const idUt = (id: number): StationPoint => ({ u: combinedUt[id][0], t: combinedUt[id][1] });

  const tris: number[] = [];
  const junctionTris: number[] = [];

  // TRUE open boundary of the isolated patch = every arm's perimeter (outer row +
  // both side rails). The junction-END rows are EXCLUDED (they weld to the
  // junction polygon → interior). Collected as combined ids while paving.
  const openBoundaryVertices = new Set<number>();

  // ── 1. Pave the three bands; intern into the combined table. ──────────────────
  // Each band's END row, expressed in COMBINED ids, bounds the junction polygon.
  const endRowsCombined: number[][] = [];

  for (const arm of arms) {
    const paved = paveArm(arm, sampler, targetEdgeMm);

    // Intern band vertices, remap band-local → combined ids.
    const bandToCombined = new Int32Array(paved.utVertices.length);
    for (let i = 0; i < paved.utVertices.length; i++) {
      bandToCombined[i] = internUt(paved.utVertices[i][0], paved.utVertices[i][1]);
    }
    for (let k = 0; k < paved.indices.length; k += 3) {
      const a = bandToCombined[paved.indices[k]];
      const b = bandToCombined[paved.indices[k + 1]];
      const c = bandToCombined[paved.indices[k + 2]];
      // Drop zero-area (repeated-vertex) triangles. `paveBand`'s advancing-front
      // zip can emit a degenerate `(a, b, b)` where a tapering/slanted cross-band
      // row collapses a segment to a single welded vertex (a Task-4-level artifact
      // the Task-5 parallel-vertical-rail case never exercised; junction arms have
      // non-parallel rails). A zero-area triangle carries no surface, so removing
      // it cannot open a real hole — and it WOULD spuriously inflate the audit
      // (its lone real edge double-counts → false non-manifold). Skipping it keeps
      // the audit honest.
      if (a === b || b === c || c === a) continue;
      tris.push(a, b, c);
    }

    // The END-row cross-band points → combined ids. These are already interned as
    // part of the band (the end row's points are band vertices), so internUt here
    // returns the SAME combined id (exact (u,t) weld).
    endRowsCombined.push(paved.endRow.map((p) => internUt(p.u, p.t)));

    // Perimeter vertices → combined ids (already interned by the band) → open set.
    for (const p of paved.perimeter) {
      openBoundaryVertices.add(internUt(p.u, p.t));
    }
  }

  // ── 2. Build the junction boundary loop. ──────────────────────────────────────
  // Walk: end-row(0) foot→crest, then end-row(1), then end-row(2). Each end row
  // runs Pi → P(i+1); the LAST point of row i equals the FIRST point of row i+1
  // (the shared corner). Drop the duplicated corner at each junction so the loop
  // is a simple closed polygon with no repeated vertices.
  const boundaryLoop: number[] = [];
  for (let i = 0; i < 3; i++) {
    const row = endRowsCombined[i];
    // For arm i, append foot..crest but skip the FIRST point (it duplicates the
    // previous arm's last appended corner). For the very first arm, include it.
    const start = i === 0 ? 0 : 1;
    for (let j = start; j < row.length; j++) {
      boundaryLoop.push(row[j]);
    }
  }
  // The final point (arm-2's crest corner) equals arm-0's foot corner (the loop
  // closes). Drop it so the loop has no repeated vertex.
  if (
    boundaryLoop.length > 1 &&
    boundaryLoop[boundaryLoop.length - 1] === boundaryLoop[0]
  ) {
    boundaryLoop.pop();
  }

  // ── 3. Pave the junction polygon (Steiner-free quality triangulation). ─────────
  // Triangulate the boundary loop into triangles using ONLY loop vertices (no
  // center/Steiner point) via best-ear clipping + Delaunay-style 3D edge flips.
  // Because no interior vertex is added, EVERY polygon boundary edge (= a band
  // end-row edge, used once by a band) is preserved and used by exactly one
  // junction triangle ⇒ count-2 seam ⇒ watertight. Interior diagonals are
  // junction-internal (count-2 between two junction triangles).
  const n = boundaryLoop.length;
  const loopXyz: Vec3[] = boundaryLoop.map((id) => {
    const p = idUt(id);
    return sampler.position(p.u, p.t);
  });
  const polyTris = triangulatePolygon3D(loopXyz);
  for (const [la, lb, lc] of polyTris) {
    const a = boundaryLoop[la];
    const b = boundaryLoop[lb];
    const c = boundaryLoop[lc];
    if (a === b || b === c || c === a) continue; // defensive: skip degenerate
    tris.push(a, b, c);
    junctionTris.push(a, b, c);
  }

  // The watertight SEAM edges are the polygon boundary edges (loop[j]→loop[j+1]).
  // Each is used once by a band (its end-row edge) and once by a junction triangle.
  const sharedEdgeKeys: string[] = [];
  for (let j = 0; j < n; j++) {
    const a = boundaryLoop[j];
    const b = boundaryLoop[(j + 1) % n];
    if (a !== b) sharedEdgeKeys.push(edgeKey(a, b));
  }

  // ── 4. Build positions from the interned (u,t) table. ─────────────────────────
  const positions = new Float32Array(combinedUt.length * 3);
  for (let i = 0; i < combinedUt.length; i++) {
    const p = sampler.position(combinedUt[i][0], combinedUt[i][1]);
    positions[i * 3] = p[0];
    positions[i * 3 + 1] = p[1];
    positions[i * 3 + 2] = p[2];
  }
  const mesh: Mesh3 = { positions, indices: new Uint32Array(tris) };
  const junctionMesh: Mesh3 = { positions, indices: new Uint32Array(junctionTris) };
  const vertexUT: Array<[number, number]> = combinedUt.map((v) => [v[0], v[1]] as [number, number]);

  return { mesh, junctionMesh, vertexUT, openBoundaryVertices, sharedEdgeKeys };
}
