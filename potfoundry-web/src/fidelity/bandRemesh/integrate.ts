/**
 * integrate.ts — Single-band production-complement integration orchestrator
 * (general-mesher integration spike, Task 4 — THE GATE).
 *
 * Wires the proven band paver ({@link paveBand}) into the REAL production dyadic
 * complement ({@link assembleWatertight}'s outer wall) on a real surface, and
 * welds the two by SHARED rail vertices so the result is watertight by
 * construction — or surfaces the exact crack.
 *
 * ## The #1 contract — rail-densification PARITY (the make-or-break)
 *
 * Force-register only welds vertices that EXIST ON BOTH SIDES. So the rail is
 * densified ONCE, every vertex snapped via {@link quantizeRailUT}, and the
 * IDENTICAL snapped rail vertex list is fed to BOTH:
 *   (a) the BAND side  — `buildStations` → `paveBand` (the rail anchors); and
 *   (b) the COMPLEMENT  — as `railLines` (force-register) AND `outerFeatureLines`
 *       (the CDT constraint), plus a `bandRegions` predicate that excises the
 *       band footprint so the complement emits a hole the band fills.
 * One snapped densified array, shared verbatim. If the two sides ever produced
 * different rail vertices the weld would T-junction.
 *
 * ## The merge (all welds in (u,t)-id space, 3D evaluated once)
 *
 * The band and the complement-outer-wall are merged by the SAME QSCALE quantized
 * (u,t) key the complement dedups on ({@link railVertexKey}). Because the rails
 * are `quantizeRailUT`-snapped, the band's exact (u,t) is a `k/QSCALE` ratio, so
 * `round(u·QSCALE)` recovers the same integer on both sides → a shared rail
 * vertex collapses to ONE merged id → each rail edge is used by exactly two
 * triangles (one band, one complement straddle cell). 3D is evaluated once per
 * merged (u,t) via the SAME `sampler.position` both sides use.
 *
 * Pure CPU (analytic / CPU `styleSampler`), no GPU/DOM.
 *
 * @module fidelity/bandRemesh/integrate
 */

import type { SurfaceSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import {
  assembleWatertight,
  type AssemblyDimensions,
  type AssemblyWallOptions,
} from '../../renderers/webgpu/parametric/conforming/WatertightAssembly';
import type { FeatureLine } from '../../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { quantizeRailUT, railVertexKey, QSCALE } from './railKey';
import type { StationPoint, StationGrid, StationRow } from './stations';
import { paveBand } from './paver';
import type { Mesh3 } from './audit';

/** A rail as an ordered (u,t) polyline. */
export type Rail = StationPoint[];

/** Input to {@link integrateSingleBand}. */
export interface IntegrateBandInput {
  /** OUTER-wall surface position evaluator (the real style sampler). */
  sampler: SurfaceSampler;
  /** INNER-wall surface position evaluator (smooth offset). */
  innerSampler: SurfaceSampler;
  /** Pot dims for the assembly (H, tBottom, rDrain). */
  dims: AssemblyDimensions;
  /**
   * The FOOT rail polyline (a real extracted Voronoi locus), pre-extracted, sparse
   * OK. The CREST rail is constructed as this foot rail translated by
   * `crestOffsetCells` dyadic grid cells in t — an INTEGER cell offset so the
   * crest stays on the SAME grid lines as the foot (every crest vertex on-grid →
   * adopted), and is row-matched 1:1 to the foot (every rail vertex is a band row
   * anchor → the weld has no skipped rail vertices). See {@link integrateSingleBand}.
   */
  footRail: Rail;
  /**
   * Crest offset, in INTEGER dyadic grid cells of t at `featureLevel`
   * (Δt = crestOffsetCells / 2^featureLevel). Must be ≥ 1. An integer cell offset
   * is load-bearing: it keeps the translated crest on-grid AND row-matched to the
   * foot (see {@link footRail}).
   */
  crestOffsetCells: number;
  /**
   * Quadtree level the rail-crossed cells refine to in the complement
   * (`featureLevel`). The rail is discretized at THIS level's dyadic grid lines
   * so every rail vertex lands on a cell edge → adopted by both adjacent cells.
   * MUST equal `wallOpts.featureLevel`.
   */
  featureLevel: number;
  /** Wall tuning for the complement assembly (nRing, sag, featureLevel, …). */
  wallOpts: AssemblyWallOptions;
}

/** Output of {@link integrateSingleBand}. */
export interface IntegrateBandResult {
  /** The merged band + complement-outer-wall 3D mesh (welded by rail (u,t)-id). */
  merged: Mesh3;
  /** The band sub-mesh alone (merged indexing) — for band triangle quality. */
  bandMesh: Mesh3;
  /**
   * The TRUE open-boundary vertices of the merged mesh: the complement outer
   * wall's t=0 ring + t=1 ring. Pass to `auditWatertight({boundaryVertexIndices})`.
   * Every count-1 edge OFF these rings is a real defect (T-junction).
   */
  boundaryVertexIndices: Set<number>;
  /**
   * Canonical "i:j" (i<j) edge keys (merged indices) for every edge running
   * ALONG a rail. Each must be referenced EXACTLY twice in `merged.indices`
   * (one band tri + one complement straddle-cell tri) — the band↔straddle weld
   * proof Task 3 could not do.
   */
  railEdgeKeys: string[];
  /** The shared snapped foot rail (the ONE list fed to both sides). */
  footSnapped: Rail;
  /** The shared snapped crest rail (the ONE list fed to both sides). */
  crestSnapped: Rail;
}

/**
 * Discretize a rail at the complement's dyadic GRID-LINE crossings (level `L`).
 *
 * THE WELD CRUX. The complement's force-register (`registerRailVertex`) adopts a
 * rail vertex into BOTH adjacent cells ONLY when it lands on a CELL EDGE — a grid
 * line `u=i/2^L` or `t=j/2^L`. A vertex strictly interior to a cell is inert
 * (the comment in FeatureConformingTriangulator: "a strictly-interior rail
 * vertex's entry is never read"). A metric-densified rail puts ~17 vertices per
 * cell width, almost none on a grid line → the complement mints its OWN crossing
 * vertices and the band's interior vertices never weld (measured 7/119 on-grid).
 *
 * So the rail's discretization MUST be exactly its grid-line crossings: between
 * two consecutive crossings the rail is a straight chord lying within ONE cell,
 * entering one edge and leaving another, and BOTH endpoints are on-edge ⇒ adopted
 * identically by the band and the complement straddle cell. The off-grid end
 * STUBS (from the rail's first vertex to its first crossing, and last crossing to
 * last vertex) are DROPPED so every retained vertex is on a grid line — the band
 * spans only the on-grid interior. Periodic in u (the rail is interior here, so
 * no seam crossing for this single band; a seam-crossing band would split here).
 */
function railGridCrossings(rail: Rail, L: number): Rail {
  const cell = 1 / (1 << L);
  const onGrid = (x: number): boolean => {
    const q = x / cell;
    return Math.abs(q - Math.round(q)) < 1e-7;
  };
  // Collect ALL crossing points (including original on-grid vertices).
  const pts: StationPoint[] = [];
  const pushUnique = (u: number, t: number): void => {
    const last = pts[pts.length - 1];
    if (last && Math.abs(last.u - u) < 1e-12 && Math.abs(last.t - t) < 1e-12) return;
    pts.push({ u, t });
  };
  for (let i = 1; i < rail.length; i++) {
    const a = rail[i - 1];
    const b = rail[i];
    const crossings: Array<{ s: number; u: number; t: number }> = [];
    for (const [c0, c1] of [[a.u, b.u], [a.t, b.t]] as const) {
      if (Math.abs(c1 - c0) < 1e-15) continue;
      const lo = Math.min(c0, c1);
      const hi = Math.max(c0, c1);
      for (let k = Math.ceil(lo / cell - 1e-9); k * cell <= hi + 1e-12; k++) {
        const line = k * cell;
        const s = (line - c0) / (c1 - c0);
        if (s > 1e-9 && s < 1 - 1e-9) {
          crossings.push({ s, u: a.u + (b.u - a.u) * s, t: a.t + (b.t - a.t) * s });
        }
      }
    }
    crossings.sort((x, y) => x.s - y.s);
    if (onGrid(a.u) || onGrid(a.t)) pushUnique(a.u, a.t); // original on-grid vertex
    for (const c of crossings) pushUnique(c.u, c.t);
  }
  const lastV = rail[rail.length - 1];
  if (onGrid(lastV.u) || onGrid(lastV.t)) pushUnique(lastV.u, lastV.t);
  // Trim leading/trailing OFF-grid points so every retained vertex is on an edge.
  let lo = 0;
  while (lo < pts.length && !(onGrid(pts[lo].u) || onGrid(pts[lo].t))) lo++;
  let hi = pts.length - 1;
  while (hi >= 0 && !(onGrid(pts[hi].u) || onGrid(pts[hi].t))) hi--;
  return pts.slice(lo, hi + 1);
}

/** Snap a whole rail's vertices via quantizeRailUT (the shared discipline). */
function snapRail(rail: Rail): Rail {
  return rail.map((p) => {
    const [u, t] = quantizeRailUT(p.u, p.t);
    return { u, t };
  });
}

/**
 * Build a station grid with EVERY rail vertex as a row anchor (foot[i] ↔ crest[i],
 * 1:1 row-matched), and cross-band interior points sized to ≈ the along-rail
 * spacing so band triangles stay near-square. This REPLACES `buildStations` for
 * the integration band: `buildStations` subsamples the rail along-s (skipping rail
 * vertices), which leaves the band's rail edges spanning multiple complement rail
 * vertices → a count-1 weld crack. Here every foot AND crest vertex is `w[0]` /
 * `w[last]` of a row, so the band's rail boundary edges match the complement's
 * subdivision exactly. The interior cross-band points are NOT shared with the
 * complement (the band fills the interior), so they need not be on-grid.
 */
function buildOffsetBandGrid(foot: Rail, crest: Rail, sampler: SurfaceSampler): StationGrid {
  const n = Math.min(foot.length, crest.length);
  const rows: StationRow[] = [];
  // Cross-band edge target ≈ the median along-rail 3D spacing (near-square cells).
  const spacings: number[] = [];
  for (let i = 1; i < n; i++) {
    const a = sampler.position(foot[i - 1].u, foot[i - 1].t);
    const b = sampler.position(foot[i].u, foot[i].t);
    spacings.push(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  }
  spacings.sort((a, b) => a - b);
  const crossTargetMm = spacings.length > 0 ? Math.max(0.25, spacings[Math.floor(spacings.length / 2)]) : 1;

  let sAccum = 0;
  let prevFoot = sampler.position(foot[0].u, foot[0].t);
  for (let i = 0; i < n; i++) {
    const footPt = { u: foot[i].u, t: foot[i].t };
    const crestPt = { u: crest[i].u, t: crest[i].t };
    if (i > 0) {
      const fp = sampler.position(footPt.u, footPt.t);
      sAccum += Math.hypot(fp[0] - prevFoot[0], fp[1] - prevFoot[1], fp[2] - prevFoot[2]);
      prevFoot = fp;
    }
    // Cross-band 3D length foot→crest.
    const pf = sampler.position(footPt.u, footPt.t);
    const pc = sampler.position(crestPt.u, crestPt.t);
    const crossLen = Math.hypot(pf[0] - pc[0], pf[1] - pc[1], pf[2] - pc[2]);
    const nSeg = Math.max(1, Math.round(crossLen / crossTargetMm));
    const w: StationPoint[] = [footPt];
    for (let k = 1; k < nSeg; k++) {
      const a = k / nSeg;
      w.push({ u: footPt.u + (crestPt.u - footPt.u) * a, t: footPt.t + (crestPt.t - footPt.t) * a });
    }
    w.push(crestPt);
    rows.push({ s: sAccum, footPt, crestPt, w });
  }
  return { rows };
}

/**
 * Re-assert exact loop closure after snapping: if the input rail was a closed
 * loop (first ≈ last within one densify spacing), force the snapped last vertex
 * to the snapped first so the loop closes to a single quantized key (risk #4).
 * No-op for an open rail.
 */
function closeLoopIfClosed(snapped: Rail, original: Rail): Rail {
  if (original.length < 3) return snapped;
  const a = original[0];
  const b = original[original.length - 1];
  const closed = Math.abs(a.u - b.u) < 1e-6 && Math.abs(a.t - b.t) < 1e-6;
  if (!closed) return snapped;
  const out = snapped.slice();
  out[out.length - 1] = { u: out[0].u, t: out[0].t };
  return out;
}

/** Build a FeatureLine from a snapped rail (verbatim — same vertices both sides). */
function railToFeatureLine(rail: Rail, label: string): FeatureLine {
  return { kind: 'general-curve', label, points: rail.map((p) => ({ u: p.u, t: p.t })) };
}

/**
 * Build the band's `insideBand(u,t)` predicate — true strictly inside the strip
 * the band paves, so the complement skips those leaves (a hole the band fills).
 *
 * The footprint is the closed polygon foot ⧺ reverse(crest); a (u,t) is inside
 * iff it is in that polygon (even-odd test). The complement's emit-gate skips a
 * leaf only when its 4 corners AND center are ALL inside, so STRADDLE cells at a
 * rail (some corners outside) keep emitting — feature-constrained by the rails —
 * with no inset needed here. The strip is narrow and single-valued in t per u, so
 * the even-odd test is robust.
 */
function makeInsideBand(
  footSnapped: Rail,
  crestSnapped: Rail,
): (u: number, t: number) => boolean {
  const poly: StationPoint[] = [...footSnapped, ...crestSnapped.slice().reverse()];
  return (u: number, t: number): boolean => pointInPoly(u, t, poly);
}

/** Even-odd point-in-polygon in (u,t). The strip never wraps the u-seam (interior band). */
function pointInPoly(u: number, t: number, poly: StationPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ui = poly[i].u, ti = poly[i].t;
    const uj = poly[j].u, tj = poly[j].t;
    const intersect =
      ti > t !== tj > t &&
      u < ((uj - ui) * (t - ti)) / (tj - ti) + ui;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Orchestrate one band: densify-once → paveBand (band) + assembleWatertight
 * (complement, band excised + rails force-registered) → merge by rail (u,t)-id.
 *
 * @throws if the assembly does not run the feature path (no outer wall produced).
 */
export function integrateSingleBand(input: IntegrateBandInput): IntegrateBandResult {
  const { sampler, innerSampler, dims, footRail, crestOffsetCells, featureLevel, wallOpts } = input;
  if (featureLevel !== wallOpts.featureLevel) {
    throw new Error(
      `integrateSingleBand: featureLevel ${featureLevel} != wallOpts.featureLevel ${wallOpts.featureLevel}` +
      ` — the rail is discretized at featureLevel's grid, which must match the complement's refinement`,
    );
  }
  if (!(crestOffsetCells >= 1) || crestOffsetCells !== Math.round(crestOffsetCells)) {
    throw new Error(`integrateSingleBand: crestOffsetCells must be an integer ≥ 1 (got ${crestOffsetCells})`);
  }

  // ── 1. Discretize the FOOT at the complement's grid-line crossings, snap, close.
  //       The CREST is the foot translated by an INTEGER cell offset in t — so it
  //       stays on the SAME grid lines (every crest vertex on-grid → adopted) AND
  //       is row-matched 1:1 to the foot (every rail vertex is a band row anchor →
  //       the weld skips NO rail vertex; this is what the metric-densified +
  //       buildStations-subsampled first attempt got wrong). ─────────────────────────
  const dt = crestOffsetCells / (1 << featureLevel);
  const footGrid = railGridCrossings(footRail, featureLevel);
  if (footGrid.length < 2) {
    throw new Error('integrateSingleBand: foot rail produced < 2 on-grid vertices (band too short for this featureLevel)');
  }
  const footSnapped = closeLoopIfClosed(snapRail(footGrid), footGrid);
  // Crest = foot + integer cell offset in t, re-snapped (the +dt keeps grid-line
  // membership: a u-line crossing stays on its u-line; a t-line crossing shifts to
  // another t-line). Row-matched to footSnapped by construction.
  const crestSnapped = snapRail(footSnapped.map((p) => ({ u: p.u, t: p.t + dt })));

  // ── 2. BAND side: build a station grid with EVERY rail vertex as a row anchor
  //       (NOT buildStations' along-s subsample — that skipped rail vertices and
  //       cracked the weld), then pave. ────────────────────────────────────────────
  const grid = buildOffsetBandGrid(footSnapped, crestSnapped, sampler);
  const band = paveBand(grid, sampler);

  // The band's per-row rail anchor (u,t) — now EVERY snapped rail vertex.
  const footRow: StationPoint[] = band.railVertexIds.foot.map((id) => ({
    u: band.utVertices[id][0],
    t: band.utVertices[id][1],
  }));
  const crestRow: StationPoint[] = band.railVertexIds.crest.map((id) => ({
    u: band.utVertices[id][0],
    t: band.utVertices[id][1],
  }));

  // ── 3. COMPLEMENT side: the SAME snapped rails as railLines + features; the band
  //       footprint excised via bandRegions. ──────────────────────────────────────
  const footLine = railToFeatureLine(footSnapped, 'rail-foot');
  const crestLine = railToFeatureLine(crestSnapped, 'rail-crest');
  const insideBand = makeInsideBand(footSnapped, crestSnapped);

  const assembly = assembleWatertight(sampler, innerSampler, dims, {
    ...wallOpts,
    bandRegions: [{ insideBand }],
    railLines: [footLine, crestLine],
    outerFeatureLines: [footLine, crestLine],
  });

  // ── 4. MERGE: weld band + complement-outer-wall by the SAME QSCALE (u,t) key. ──
  // Outer wall is surfaceId 0. Its vertices are the assembly range surfaceId 0; we
  // identify outer triangles as those whose 3 vertices are all in the outer-wall
  // index window [0, outerVertCount). (assembleWatertight appends the outer wall
  // FIRST, so outer-wall vertex ids are [0, outerVertCount).)
  const av = assembly.vertices; // packed (u,t,surfaceId)
  const ai = assembly.indices;
  const outerRange = assembly.surfaceRanges.find((r) => r.surfaceId === 0);
  if (outerRange === undefined) {
    throw new Error('integrateSingleBand: assembly produced no outer wall (surfaceId 0)');
  }
  // The outer wall is the FIRST appended block; its owned vertices are [0, count).
  const outerVertCount = outerRange.vertexCount;

  // Merged vertex table keyed by the complement's QSCALE (u,t) key. Both band and
  // complement vertices intern here, so a shared rail (u,t) collapses to ONE id.
  const keyToMerged = new Map<number, number>();
  const mergedUt: Array<[number, number]> = [];
  const internUt = (u: number, t: number): number => {
    const key = railVertexKey(u, t);
    let id = keyToMerged.get(key);
    if (id === undefined) {
      id = mergedUt.length;
      keyToMerged.set(key, id);
      mergedUt.push([u, t]);
    }
    return id;
  };

  // 4a. Intern complement OUTER-wall vertices (only those an outer triangle uses)
  //     and remap outer triangles.
  const tris: number[] = [];
  const compToMerged = new Int32Array(outerVertCount).fill(-1);
  const isOuterVert = (vi: number): boolean => vi < outerVertCount;
  const internComp = (vi: number): number => {
    if (compToMerged[vi] >= 0) return compToMerged[vi];
    const u = av[vi * 3];
    const t = av[vi * 3 + 1];
    const id = internUt(u, t);
    compToMerged[vi] = id;
    return id;
  };
  for (let k = 0; k + 2 < ai.length; k += 3) {
    const a = ai[k], b = ai[k + 1], c = ai[k + 2];
    if (!isOuterVert(a) || !isOuterVert(b) || !isOuterVert(c)) continue; // not an outer-wall tri
    tris.push(internComp(a), internComp(b), internComp(c));
  }

  // 4b. Intern band vertices (rail anchors weld to the complement by the shared
  //     key; band-interior vertices get fresh ids) and remap band triangles.
  const bandToMerged = new Int32Array(band.utVertices.length);
  for (let i = 0; i < band.utVertices.length; i++) {
    bandToMerged[i] = internUt(band.utVertices[i][0], band.utVertices[i][1]);
  }
  const bandTris: number[] = [];
  for (let k = 0; k + 2 < band.indices.length; k += 3) {
    const a = bandToMerged[band.indices[k]];
    const b = bandToMerged[band.indices[k + 1]];
    const c = bandToMerged[band.indices[k + 2]];
    tris.push(a, b, c);
    bandTris.push(a, b, c);
  }

  // ── 5. Evaluate 3D once per merged (u,t) via the SAME sampler. ────────────────
  const positions = new Float32Array(mergedUt.length * 3);
  for (let i = 0; i < mergedUt.length; i++) {
    const p = sampler.position(mergedUt[i][0], mergedUt[i][1]);
    positions[i * 3] = p[0];
    positions[i * 3 + 1] = p[1];
    positions[i * 3 + 2] = p[2];
  }
  const merged: Mesh3 = { positions, indices: new Uint32Array(tris) };
  const bandMesh: Mesh3 = { positions, indices: new Uint32Array(bandTris) };

  // ── 6. TRUE open boundary: the complement outer wall's t=0 and t=1 rings. ─────
  // Those are merged vertices whose snapped t is exactly 0 or 1 (the pinned rings).
  const boundaryVertexIndices = new Set<number>();
  for (let i = 0; i < mergedUt.length; i++) {
    const tQ = Math.round(mergedUt[i][1] * QSCALE);
    if (tQ === 0 || tQ === QSCALE) boundaryVertexIndices.add(i);
  }

  // ── 7. Rail edge keys (merged indices): each must be used exactly twice. ──────
  const railEdgeKeys: string[] = [];
  const edgeKey = (i: number, j: number): string => (i < j ? `${i}:${j}` : `${j}:${i}`);
  const railMergedIds = (row: StationPoint[]): number[] =>
    row.map((p) => internUt(p.u, p.t));
  const footMergedRow = railMergedIds(footRow);
  const crestMergedRow = railMergedIds(crestRow);
  for (let r = 0; r + 1 < footMergedRow.length; r++) {
    railEdgeKeys.push(edgeKey(footMergedRow[r], footMergedRow[r + 1]));
  }
  for (let r = 0; r + 1 < crestMergedRow.length; r++) {
    railEdgeKeys.push(edgeKey(crestMergedRow[r], crestMergedRow[r + 1]));
  }

  return {
    merged,
    bandMesh,
    boundaryVertexIndices,
    railEdgeKeys,
    footSnapped,
    crestSnapped,
  };
}
