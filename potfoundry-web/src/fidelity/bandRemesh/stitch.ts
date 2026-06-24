/**
 * stitch.ts — Watertight stitch of a paved band into a surrounding grid.
 *
 * THE SPIKE'S MAKE-OR-BREAK GATE. Combines:
 *   - the BAND (between two rails), meshed by {@link paveBand};
 *   - the COMPLEMENT (the rest of the wall — outside the band), meshed by a
 *     self-contained structured triangulation;
 * into ONE {@link Mesh3} that shares the rail vertices EXACTLY — so no boundary
 * edge runs along the rails ⇒ watertight by construction.
 *
 * ## How shared rail vertices are guaranteed (the crux)
 *
 *   1. **densify-and-share.** {@link densifyRail} inserts metric-arclength points
 *      so consecutive 3D spacing ≤ `targetEdgeMm/2`. Both rails are densified
 *      ONCE and the SAME densified rail arrays are fed to `buildStations`. (Real
 *      DP-simplified rails have long segments that would make `buildStations`
 *      throw; densification is the precondition that lets the band and the
 *      complement agree on the rail discretization.)
 *
 *   2. **band rail vertices ARE the anchors.** `paveBand` returns
 *      `railVertexIds.{foot,crest}` — vertex ids (into the band's `utVertices`)
 *      for the exact (u,t) rail anchors the band used (a subset of the densified
 *      rail, selected by `buildStations` along-s sizing). The complement is built
 *      DIRECTLY from these (u,t) sequences — NOT recomputed independently — so
 *      every rail (u,t) the complement references is byte-identical to the band's.
 *
 *   3. **exact-(u,t)-key weld.** When the band and the complement are merged into
 *      one combined mesh, vertices are deduplicated by exact (u,t) key. Identical
 *      (u,t) on both sides ⇒ the same combined index ⇒ each rail edge is used by
 *      exactly one band triangle + one complement triangle.
 *
 * ## Scope (PROOF, not production wiring)
 *
 * The complement here is a MINIMAL, self-contained structured triangulation of
 * the wall-minus-band region, enough to PROVE the stitch is watertight on a
 * representative case (vertical rails on a SyntheticCylinderSampler). It does NOT
 * touch production code (FeatureConformingTriangulator / WatertightAssembly) —
 * that is Phase-1 integration. The complement respects the rail polylines as its
 * inner boundary and shares their vertices; the rest of the wall is a uniform
 * u-strip grid sharing the rails' t-rows.
 *
 * @module fidelity/bandRemesh/stitch
 */

import type { SurfaceSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { Mesh3 } from './audit';
import { buildStations } from './stations';
import type { StationPoint } from './stations';
import { paveBand } from './paver';

// ── Public types ────────────────────────────────────────────────────────────────

/** Input to {@link stitchBandIntoGrid}. */
export interface StitchInput {
  /** Surface position evaluator (analytic or GPU-backed). */
  sampler: SurfaceSampler;
  /**
   * Foot rail polyline (≥2 (u,t) points), at the LOWER u edge of the band. May
   * be sparse — it is densified internally.
   */
  footRail: StationPoint[];
  /**
   * Crest rail polyline (≥2 (u,t) points), at the UPPER u edge of the band. May
   * be sparse — it is densified internally.
   */
  crestRail: StationPoint[];
  /** Target 3D edge length in mm (drives both band paving and complement cells). */
  targetEdgeMm: number;
}

/** Output of {@link stitchBandIntoGrid}. */
export interface StitchResult {
  /** The combined band + complement mesh (watertight by construction). */
  mesh: Mesh3;
  /**
   * The band sub-mesh alone (in combined-mesh indexing), for Task-4 triangle
   * quality checks over the band region.
   */
  bandMesh: Mesh3;
  /**
   * The mesh's TRUE open-boundary vertices (the t=0 ring + the t=1 ring of the
   * wall). Pass to `auditWatertight({ boundaryVertexIndices })` — every count-1
   * edge NOT on these rings is a real defect (T-junction).
   */
  openBoundaryVertices: Set<number>;
  /**
   * Canonical "i:j" edge keys (combined-mesh indices, i<j) for every edge that
   * runs ALONG a rail. Each must be referenced exactly twice in `mesh.indices`
   * (one band tri + one complement tri) — the direct watertightness proof.
   */
  railEdgeKeys: string[];
}

// ── densifyRail ──────────────────────────────────────────────────────────────────

/**
 * Densify a rail polyline by inserting metric-arclength-interpolated points so
 * that consecutive 3D spacing is ≤ `maxSpacingMm`.
 *
 * Each input segment [a→b] is subdivided into
 * `ceil(|a→b|_3D / maxSpacingMm)` equal-parameter sub-segments. Endpoints of the
 * ORIGINAL polyline are preserved exactly (anchor preservation), and original
 * interior vertices are preserved (they remain segment boundaries). Deterministic.
 *
 * @param rail         Input rail (≥2 (u,t) points).
 * @param sampler      Surface position evaluator (for 3D spacing).
 * @param maxSpacingMm Maximum allowed consecutive 3D spacing (mm).
 * @returns            Densified rail; consecutive 3D spacing ≤ maxSpacingMm.
 */
export function densifyRail(
  rail: readonly StationPoint[],
  sampler: SurfaceSampler,
  maxSpacingMm: number,
): StationPoint[] {
  if (rail.length < 2) return rail.map((p) => ({ u: p.u, t: p.t }));
  if (!(maxSpacingMm > 0)) {
    throw new Error(`bandRemesh.densifyRail: maxSpacingMm must be > 0 (got ${maxSpacingMm})`);
  }

  const out: StationPoint[] = [{ u: rail[0].u, t: rail[0].t }];

  for (let i = 1; i < rail.length; i++) {
    const a = rail[i - 1];
    const b = rail[i];
    const pa = sampler.position(a.u, a.t);
    const pb = sampler.position(b.u, b.t);
    const seg = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
    const nSub = Math.max(1, Math.ceil(seg / maxSpacingMm));
    // Insert nSub-1 interior points (equal parameter), then the segment endpoint b.
    for (let k = 1; k < nSub; k++) {
      const alpha = k / nSub;
      out.push({ u: a.u + (b.u - a.u) * alpha, t: a.t + (b.t - a.t) * alpha });
    }
    // Push the exact endpoint b (anchor preservation for original vertices).
    out.push({ u: b.u, t: b.t });
  }

  return out;
}

// ── helpers ──────────────────────────────────────────────────────────────────────

/** Canonical (u,t) dedup key — MUST match paver.ts's interning convention. */
function utKey(u: number, t: number): string {
  return `${u}|${t}`;
}

/** Canonical undirected edge key (i<j). */
function edgeKey(i: number, j: number): string {
  return i < j ? `${i}:${j}` : `${j}:${i}`;
}

/**
 * Law-of-cosines minimum interior angle (degrees) of triangle (A,B,C) in 3D.
 * Used to pick the better diagonal of each complement quad (matches paver.ts).
 */
function minAngle3D(
  sampler: SurfaceSampler,
  A: StationPoint,
  B: StationPoint,
  C: StationPoint,
): number {
  const pa = sampler.position(A.u, A.t);
  const pb = sampler.position(B.u, B.t);
  const pc = sampler.position(C.u, C.t);
  const c = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]); // |AB|
  const b = Math.hypot(pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]); // |CA|
  const a = Math.hypot(pb[0] - pc[0], pb[1] - pc[1], pb[2] - pc[2]); // |BC|
  const ang = (adj1: number, adj2: number, opp: number): number => {
    if (adj1 <= 0 || adj2 <= 0) return 0;
    const cos = Math.max(-1, Math.min(1, (adj1 * adj1 + adj2 * adj2 - opp * opp) / (2 * adj1 * adj2)));
    return (Math.acos(cos) * 180) / Math.PI;
  };
  return Math.min(ang(b, c, a), ang(a, c, b), ang(a, b, c));
}

// ── stitchBandIntoGrid ──────────────────────────────────────────────────────────

/**
 * Stitch a paved band into a surrounding complement triangulation, producing one
 * watertight combined mesh.
 *
 * Mechanism (vertical-rail analytic case used by the spike gate):
 *   - Densify both rails ONCE to ≤ `targetEdgeMm/2` and feed the SAME densified
 *     rails to `buildStations` → `paveBand`.
 *   - The band's `railVertexIds` give the exact (u,t) of every rail anchor row.
 *     The complement uses those SAME (u,t) for its inner boundary columns.
 *   - The complement spans the rest of the wall (crest rail → around the back →
 *     foot rail) as a uniform u-strip grid sharing the rails' t-rows; adjacent
 *     columns are zipped with the better-diagonal rule.
 *   - Both meshes are merged via exact-(u,t)-key dedup ⇒ rail vertices weld to a
 *     single combined index ⇒ each rail edge is used by exactly two triangles.
 *
 * @param input See {@link StitchInput}.
 * @returns     See {@link StitchResult}.
 */
export function stitchBandIntoGrid(input: StitchInput): StitchResult {
  const { sampler, footRail, crestRail, targetEdgeMm } = input;
  // buildStations rejects rail spacing STRICTLY > targetEdgeMm/2, and ceil-based
  // densification can land a sub-segment at exactly targetEdgeMm/2 (± f32 noise).
  // Densify with a small safety margin so every spacing is comfortably below the
  // precondition threshold.
  const maxSpacingMm = (targetEdgeMm / 2) * 0.95;

  // 1. Densify-and-share: ONE densified rail each, fed to BOTH band and complement.
  const footDense = densifyRail(footRail, sampler, maxSpacingMm);
  const crestDense = densifyRail(crestRail, sampler, maxSpacingMm);

  // 2. Pave the band (Task 4). buildStations selects a subset of densified rows
  //    by along-s sizing; paveBand returns the exact rail anchor (u,t) per row.
  const grid = buildStations(footDense, crestDense, sampler, targetEdgeMm);
  const band = paveBand(grid, sampler);

  // The band's rail rows (in row order) — the EXACT (u,t) the complement must reuse.
  const footRow: StationPoint[] = band.railVertexIds.foot.map((id) => ({
    u: band.utVertices[id][0],
    t: band.utVertices[id][1],
  }));
  const crestRow: StationPoint[] = band.railVertexIds.crest.map((id) => ({
    u: band.utVertices[id][0],
    t: band.utVertices[id][1],
  }));
  const nRows = footRow.length;

  // ── Combined-mesh vertex interning (exact (u,t) key) ──────────────────────────
  const combinedKeyToId = new Map<string, number>();
  const combinedUt: Array<[number, number]> = [];
  const internUt = (u: number, t: number): number => {
    const key = utKey(u, t);
    let id = combinedKeyToId.get(key);
    if (id === undefined) {
      id = combinedUt.length;
      combinedKeyToId.set(key, id);
      combinedUt.push([u, t]);
    }
    return id;
  };

  // 3a. Intern the band vertices, remapping band-local ids → combined ids.
  const bandToCombined = new Int32Array(band.utVertices.length);
  for (let i = 0; i < band.utVertices.length; i++) {
    bandToCombined[i] = internUt(band.utVertices[i][0], band.utVertices[i][1]);
  }

  const tris: number[] = [];
  const bandTris: number[] = [];
  for (let k = 0; k < band.indices.length; k += 3) {
    const a = bandToCombined[band.indices[k]];
    const b = bandToCombined[band.indices[k + 1]];
    const c = bandToCombined[band.indices[k + 2]];
    tris.push(a, b, c);
    bandTris.push(a, b, c);
  }

  // 3b. Build the complement columns.
  //
  // The complement spans the wall OUTSIDE the band: from the crest rail (u=uCrest)
  // around the back to the foot rail (u=uFoot, reached at u=uFoot+1 to keep u
  // monotonically increasing across the strip). Each column shares the SAME t-rows
  // as the band's rail rows.
  //
  //   column 0          = crest rail  (EXACT band (u,t) — welded)
  //   columns 1..M-1    = interior, uniform u in (uCrest, uFoot+1)
  //   column M          = foot rail   (EXACT band (u,t) — welded; reached via +1 wrap)
  //
  // Interior columns sit at the SAME t-values as the rail rows but at fresh u, so
  // they intern to NEW combined vertices (no accidental weld to the band).
  const uCrest = crestRow[0].u;
  const uFootWrapped = footRow[0].u + 1; // monotonic-increasing target

  // Number of complement columns from the 3D arc-width of the complement at the
  // mid-row, sized to ≈ targetEdgeMm (matches the band's cross-band sizing).
  // The complement spans Δu = (uFoot+1) − uCrest in u — the REST of the ring,
  // the long way around from crest back to foot.
  const midRow = Math.floor(nRows / 2);
  const tMid = crestRow[midRow]?.t ?? 0.5;
  const du = uFootWrapped - uCrest;
  // Integrate 3D arc length across the complement at the mid row to size columns.
  const ARC_SAMPLES = 64;
  let arc = 0;
  let prev = sampler.position(uCrest, tMid);
  for (let s = 1; s <= ARC_SAMPLES; s++) {
    const u = uCrest + (du * s) / ARC_SAMPLES;
    const p = sampler.position(u, tMid);
    arc += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]);
    prev = p;
  }

  // last column index (foot rail); ≥2 guarantees ≥1 genuine interior column so the
  // back of the wall is not collapsed into a single over-stretched strip.
  const M = Math.max(2, Math.round(arc / targetEdgeMm));

  /** Resolve the combined vertex id for complement (col, row). */
  const compVid = (col: number, row: number): number => {
    if (col === 0) {
      // Crest rail column — weld to the band's crest vertex EXACTLY.
      return band.railVertexIds.crest[row];
    }
    if (col === M) {
      // Foot rail column — weld to the band's foot vertex EXACTLY.
      return band.railVertexIds.foot[row];
    }
    // Interior complement column: fresh u at the rail's row t (periodic-wrapped u).
    const frac = col / M;
    const uRaw = uCrest + du * frac;
    const u = uRaw - Math.floor(uRaw); // wrap into [0,1) so it never equals a rail u
    const t = crestRow[row].t;
    return internUt(u, t);
  };
  // Map combined-id back to (u,t) for diagonal scoring.
  const idUt = (id: number): StationPoint => ({
    u: combinedUt[id][0],
    t: combinedUt[id][1],
  });

  // Note: combinedUt already holds band crest/foot vertices (interned in 3a), so
  // compVid for col 0 / col M returns ids whose (u,t) is recoverable via idUt.

  // Zip adjacent complement columns (regular quad grid — same t-rows on both sides).
  for (let col = 0; col < M; col++) {
    for (let row = 0; row + 1 < nRows; row++) {
      const v00 = compVid(col, row);
      const v01 = compVid(col, row + 1);
      const v10 = compVid(col + 1, row);
      const v11 = compVid(col + 1, row + 1);
      // Choose the diagonal that maximises the minimum 3D interior angle.
      const diagA = Math.min(
        minAngle3D(sampler, idUt(v00), idUt(v10), idUt(v11)),
        minAngle3D(sampler, idUt(v00), idUt(v11), idUt(v01)),
      );
      const diagB = Math.min(
        minAngle3D(sampler, idUt(v00), idUt(v10), idUt(v01)),
        minAngle3D(sampler, idUt(v10), idUt(v11), idUt(v01)),
      );
      if (diagA >= diagB) {
        tris.push(v00, v10, v11);
        tris.push(v00, v11, v01);
      } else {
        tris.push(v00, v10, v01);
        tris.push(v10, v11, v01);
      }
    }
  }

  // 4. Build the combined mesh positions from the interned (u,t) table.
  const positions = new Float32Array(combinedUt.length * 3);
  for (let i = 0; i < combinedUt.length; i++) {
    const p = sampler.position(combinedUt[i][0], combinedUt[i][1]);
    positions[i * 3] = p[0];
    positions[i * 3 + 1] = p[1];
    positions[i * 3 + 2] = p[2];
  }
  const mesh: Mesh3 = { positions, indices: new Uint32Array(tris) };
  const bandMesh: Mesh3 = { positions, indices: new Uint32Array(bandTris) };

  // 5. TRUE open boundary = the t=0 ring + the t=1 ring (first and last rows).
  //    Collect every combined vertex whose t is 0 or 1.
  const openBoundaryVertices = new Set<number>();
  for (let i = 0; i < combinedUt.length; i++) {
    const t = combinedUt[i][1];
    if (t === 0 || t === 1) openBoundaryVertices.add(i);
  }

  // 6. Rail edge keys (combined indices) — each must be used exactly twice.
  const railEdgeKeys: string[] = [];
  for (let row = 0; row + 1 < nRows; row++) {
    railEdgeKeys.push(edgeKey(band.railVertexIds.foot[row], band.railVertexIds.foot[row + 1]));
    railEdgeKeys.push(edgeKey(band.railVertexIds.crest[row], band.railVertexIds.crest[row + 1]));
  }

  return { mesh, bandMesh, openBoundaryVertices, railEdgeKeys };
}
