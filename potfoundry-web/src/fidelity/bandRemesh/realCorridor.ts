/**
 * realCorridor.ts — drive the PROVEN dyadic-edge-seam corridor (`corridorPave`)
 * from a REAL detector feature edge (Task 1 of the real-feature mesher de-risk).
 *
 * The spike ({@link module:fidelity/bandRemesh/seamFill} Q1 + {@link
 * module:fidelity/bandRemesh/corridorPave} Q2) PROVED the universal mechanism on a
 * SYNTHETIC diagonal ridge: exclude a cell-aligned region with a {@link BandRegion}
 * → the emit-gate leaves a whole-cell hole bounded by dyadic cell edges → fill it
 * as ONE constrained-Delaunay region with the feature pinned as our own constraint
 * edge-chain and the boundary pinned to the EXACT complement vertex ids → the seam
 * welds 0/0/0 and the feature is a continuous mesh edge-chain.
 *
 * This module changes ONE thing: the feature polyline is sourced from a REAL
 * {@link module:conforming/featureGraph/detectFeatures} edge on a REAL
 * {@link module:conforming/featureGraph/styleSampler} pot, not a straight synthetic
 * diagonal. Everything else is the spike machinery, reused verbatim:
 *   - the corridor {@link BandRegion} is `dist((u,t), featurePolyline) <
 *     widthCells · cellWidth` with PERIODIC-u distance (a real wall curves, so the
 *     band is a tube around the polyline, not a slab around a line);
 *   - {@link assembleWatertight} with that band → the hole;
 *   - {@link extractHoleBoundary} → the count-1 dyadic boundary loops;
 *   - {@link corridorPave} → the feature-pinned fill (it snaps the feature's two
 *     ends onto EXISTING hole-boundary vertex ids, so the Q1 seam guarantee holds);
 *   - merge the complement outer wall + the corridor fill in one id-space.
 *
 * Pure CPU (CPU `styleSampler` / analytic), no GPU/DOM — safe for Vitest/jsdom.
 *
 * @module fidelity/bandRemesh/realCorridor
 */

import type { SurfaceSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { FeatureLine } from '../../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import {
  assembleWatertight,
  type AssemblyDimensions,
  type AssemblyWallOptions,
  type BandRegion,
} from '../../renderers/webgpu/parametric/conforming/WatertightAssembly';
import { railVertexKey, QSCALE } from './railKey';
import { extractHoleBoundary, type HoleBoundary, type IndexedMesh } from './seamFill';
import {
  corridorPave,
  corridorPaveMulti,
  type CorridorPaveResult,
  type CorridorPaveMultiResult,
  type FeatureChainInput,
  type UTPoint,
} from './corridorPave';

/** Periodic distance in u (the wall wraps at u=1). */
function uDistPeriodic(a: number, b: number): number {
  let d = Math.abs(a - b) % 1;
  if (d > 0.5) d = 1 - d;
  return d;
}

/**
 * 2D distance in (u,t) using PERIODIC u, with optional anisotropic mm scaling.
 * When `uScale`/`tScale` are the u→mm / t→mm factors the result is a true MILLIMETRE
 * distance (so an mm corridor half-width is FL-independent); with both = 1 it is the
 * legacy isotropic (u,t)-unit distance. The default keeps the spike's behaviour.
 */
function dist2Periodic(
  au: number,
  at: number,
  bu: number,
  bt: number,
  uScale = 1,
  tScale = 1,
): number {
  return Math.hypot(uDistPeriodic(au, bu) * uScale, (at - bt) * tScale);
}

/** Unwrap `x`'s u so it is within ±0.5 of reference `ref` (the same u period). */
function unwrapU(x: number, ref: number): number {
  let d = (x - ref) % 1;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return ref + d;
}

/**
 * Distance from a (u,t) point to a polyline (closest point over all segments),
 * with periodic u.
 *
 * CRITICAL (real-geometry bug fixed in Task 1): each segment is unwrapped in a
 * SINGLE consistent local u-frame — endpoint A anchored to itself, endpoint B and
 * the query both unwrapped RELATIVE TO A — then projected with plain Euclidean
 * math in that frame. Unwrapping each endpoint INDEPENDENTLY about the query (the
 * first, buggy version) could fold a short segment whose two ends sit on opposite
 * sides of the ±0.5 wrap boundary into a SPURIOUS long segment crossing the query
 * u, reporting distance ≈0 a third of the way around the pot from the real feature
 * → the emit-gate carved phantom holes far from the feature (FL7 loop0 at u≈0.84
 * for a feature at u≈0.34). Anchoring the whole segment+query to ONE frame removes
 * the fold: a segment never spans more than its true (≤0.5) u-extent.
 */
function distToPolylinePeriodic(
  u: number,
  t: number,
  polyline: UTPoint[],
  uScale = 1,
  tScale = 1,
): number {
  if (polyline.length === 1) {
    return dist2Periodic(u, t, polyline[0].u, polyline[0].t, uScale, tScale);
  }
  let best = Infinity;
  for (let i = 0; i + 1 < polyline.length; i++) {
    const au = polyline[i].u;
    const at = polyline[i].t;
    // Endpoint B and the query, both expressed in A's local u-frame.
    const bu = unwrapU(polyline[i + 1].u, au);
    const bt = polyline[i + 1].t;
    const qu = unwrapU(u, au);
    // Project in MM space so a thin curved segment is not over/under-weighted in
    // one axis; the closest-point parameter is computed against mm-scaled offsets.
    const du = (bu - au) * uScale;
    const dt = (bt - at) * tScale;
    const len2 = du * du + dt * dt;
    let f = 0;
    if (len2 > 1e-24) {
      f = Math.max(0, Math.min(1, ((qu - au) * uScale * du + (t - at) * tScale * dt) / len2));
    }
    const cu = au + (bu - au) * f;
    const ct = at + (bt - at) * f;
    // qu and cu are in the SAME (A-anchored) frame → mm-scaled Euclidean is exact.
    const d = Math.hypot((qu - cu) * uScale, (t - ct) * tScale);
    if (d < best) best = d;
  }
  return best;
}

/** Options for {@link realFeatureCorridor}. */
export interface RealFeatureCorridorOptions {
  /**
   * Feature-cell refinement level passed to {@link assembleWatertight}. The dyadic
   * cell width at this level is `1 / 2^featureLevel`; the corridor band half-width
   * is `widthCells · cellWidth` so it always covers WHOLE cells around the feature.
   */
  featureLevel: number;
  /**
   * Corridor half-width in MILLIMETRES (default 3 mm). This is the LOAD-BEARING
   * width lever: a fixed mm half-width makes the corridor MULTIPLE small dyadic
   * cells wide at ANY `featureLevel` (a fixed CELL count, by contrast, shrinks to a
   * sub-cell tube at high FL → no whole cell fits → no hole forms / corridorPave
   * throws — the old FL11 failure). Multiple cells wide ⇒ the concave bays are wider
   * than a Delaunay triangle ⇒ fillable. The band is an mm tube (anisotropic u/t mm
   * scaling) around the feature polyline.
   */
  widthMm?: number;
  /**
   * DEPRECATED legacy half-width in dyadic cells. When set it OVERRIDES `widthMm`
   * (back-compat for the cell-count band); prefer `widthMm`. A fixed cell count is
   * FL-fragile (see `widthMm`) — kept only so existing callers/tests can opt in.
   */
  widthCells?: number;
  /** Pot dimensions (default H=120, tBottom=6, rDrain=0 — the spike's dims). */
  dims?: AssemblyDimensions;
  /** Base wall options (default = the spike's BASE). */
  baseOptions?: AssemblyWallOptions;
  /** Inner-wall sampler (default = a smooth constant-offset cylinder). */
  innerSampler?: SurfaceSampler;
  /**
   * A minimal off-corridor feature strand so the assembly's feature path runs even
   * when the corridor band would otherwise leave `outerFeatureLines` empty. The
   * spike passes a short strand at u≈0.05; we default to the same. The corridor's
   * feature is the REAL polyline, pinned by {@link corridorPave} — NOT this strand.
   */
  assemblyFeatureLines?: FeatureLine[];
}

/** Result of {@link realFeatureCorridor}. */
export interface RealFeatureCorridorResult {
  /** The corridor band region (the emit-gate footprint). */
  bandRegion: BandRegion;
  /** The extracted dyadic hole boundary (loops + complementDir). */
  hole: HoleBoundary;
  /** The feature-pinned corridor paving (cdt2d fill + the feature chain ids). */
  paved: CorridorPaveResult;
  /**
   * The merged complement-outer-wall + corridor-fill mesh in one id-space:
   *   - `indices`        — flat triangle index buffer (complement tris ++ fill tris);
   *   - `vertexUT`       — (u,t) per merged id (existing ids identity-mapped, then
   *                         the corridor's NEW interior ids appended);
   *   - `ringVertexIds`  — merged ids on the t=0 / t=1 rings (the true open boundary).
   */
  merged: {
    indices: number[];
    vertexUT: Array<[number, number]>;
    ringVertexIds: Set<number>;
  };
  /** Number of merged ids that are SHARED with the complement (ids < this are seam-shared). */
  existingVertexCount: number;
}

/** The spike's default realistic pot dims. */
const DEFAULT_DIMS: AssemblyDimensions = { H: 120, tBottom: 6, rDrain: 0 };

/** The spike's default base wall options (verify_dyadic_seam.test.ts BASE). */
const DEFAULT_BASE: AssemblyWallOptions = {
  maxSagMm: 0.05,
  maxEdgeMm: 1,
  minEdgeMm: 0.1,
  gradeRatio: 2,
  maxLevel: 12,
  resU: 128,
  resT: 128,
  nRing: 1024,
  targetTriangles: 6_000_000,
  budgetMode: 'cap',
};

/**
 * Intern an assembly's OUTER wall (surfaceId 0) into merged-id space by the
 * complement's QSCALE key ({@link railVertexKey}) — a shared (u,t) collapses to ONE
 * merged id — and remap the outer-wall triangles. Returns the merged outer-wall
 * mesh (indices in merged-id space), the (u,t) per merged id, and the ring ids.
 *
 * This is the EXACT interning the spike harness uses (verify_dyadic_seam.test.ts
 * `internAssembly`), lifted here so {@link realFeatureCorridor} owns the whole
 * detector→corridor pipeline. No production code is touched.
 */
function internOuterWall(assembly: ReturnType<typeof assembleWatertight>): {
  outerWall: IndexedMesh;
  vertexUT: Array<[number, number]>;
  ringVertexIds: Set<number>;
} {
  const av = assembly.vertices; // packed (u,t,surfaceId)
  const ai = assembly.indices;
  const outerRange = assembly.surfaceRanges.find((r) => r.surfaceId === 0);
  if (outerRange === undefined) {
    throw new Error('realFeatureCorridor: assembly produced no outer wall (surfaceId 0)');
  }
  // The outer wall is appended FIRST → its owned vertices are [0, outerVertCount).
  const outerVertCount = outerRange.vertexCount;

  const keyToMerged = new Map<number, number>();
  const vertexUT: Array<[number, number]> = [];
  const internUt = (u: number, t: number): number => {
    const key = railVertexKey(u, t);
    let id = keyToMerged.get(key);
    if (id === undefined) {
      id = vertexUT.length;
      keyToMerged.set(key, id);
      vertexUT.push([u, t]);
    }
    return id;
  };

  const tris: number[] = [];
  const compToMerged = new Int32Array(outerVertCount).fill(-1);
  const isOuterVert = (vi: number): boolean => vi < outerVertCount;
  const internComp = (vi: number): number => {
    if (compToMerged[vi] >= 0) return compToMerged[vi];
    const id = internUt(av[vi * 3], av[vi * 3 + 1]);
    compToMerged[vi] = id;
    return id;
  };
  for (let k = 0; k + 2 < ai.length; k += 3) {
    const a = ai[k], b = ai[k + 1], c = ai[k + 2];
    if (!isOuterVert(a) || !isOuterVert(b) || !isOuterVert(c)) continue; // not an outer-wall tri
    tris.push(internComp(a), internComp(b), internComp(c));
  }

  // Ring vertices: merged ids whose snapped t is exactly 0 or 1 (the pinned rings).
  const ringVertexIds = new Set<number>();
  for (let i = 0; i < vertexUT.length; i++) {
    const tQ = Math.round(vertexUT[i][1] * QSCALE);
    if (tQ === 0 || tQ === QSCALE) ringVertexIds.add(i);
  }

  return { outerWall: { indices: tris }, vertexUT, ringVertexIds };
}

/**
 * The default off-corridor feature strand (mirrors the spike's `cylinderFeature`):
 * a short full-height-ish strand at u≈0.05 so the assembly's feature path runs.
 */
function defaultAssemblyFeature(): FeatureLine[] {
  const points: Array<{ u: number; t: number }> = [];
  for (let k = 0; k <= 16; k++) points.push({ u: 0.05, t: 0.1 + (0.8 * k) / 16 });
  return [{ kind: 'general-curve', points, label: 'corridor-strand' }];
}

/**
 * Run the spike's dyadic-edge-seam corridor pipeline with the feature sourced from
 * a REAL detector edge polyline.
 *
 * @param sampler  The outer-wall surface sampler (a REAL `styleSampler` pot).
 * @param featureEdgePolyline  The REAL (u,t) feature polyline (a detector edge,
 *   clipped to a traversing sub-arc whose two ends lie at/near the corridor).
 * @param opts  Feature level, corridor width, and optional dim/sampler overrides.
 */
export function realFeatureCorridor(
  sampler: SurfaceSampler,
  featureEdgePolyline: UTPoint[],
  opts: RealFeatureCorridorOptions,
): RealFeatureCorridorResult {
  const dims = opts.dims ?? DEFAULT_DIMS;
  const base = opts.baseOptions ?? DEFAULT_BASE;
  const cellWidth = 1 / 2 ** opts.featureLevel;

  // The inner wall: a smooth constant-offset cylinder (the spike's innerSampler).
  const innerSampler: SurfaceSampler =
    opts.innerSampler ?? {
      position(u: number, t: number) {
        const theta = u * 2 * Math.PI;
        const r = 36; // R0(40) - 4 wall thickness, matching the spike
        const z = dims.tBottom + t * (dims.H - dims.tBottom);
        return [r * Math.cos(theta), r * Math.sin(theta), z];
      },
    };

  // ── mm scale factors for the band tube. u→mm is the local circumference at the
  // feature (2·π·radius from the REAL sampler at the feature midpoint); t→mm is the
  // pot height. So `widthMm` is a true millimetre half-width, FL-independent. ──
  const midPt = featureEdgePolyline[Math.floor(featureEdgePolyline.length / 2)];
  const midPos = sampler.position(((midPt.u % 1) + 1) % 1, midPt.t);
  const featRadiusMm = Math.hypot(midPos[0], midPos[1]);
  const uToMm = 2 * Math.PI * featRadiusMm;
  const tToMm = dims.H;

  // ── 1. The corridor band: a TUBE around the real feature polyline (periodic u). ─
  // Width is a fixed MM half-width by default (FL-independent → multiple cells wide
  // → fillable bays). A legacy cell-count override is honoured for back-compat: it
  // is converted to mm via the u→mm scale so the band predicate stays mm-anisotropic.
  const widthMm =
    opts.widthCells !== undefined
      ? opts.widthCells * cellWidth * uToMm
      : opts.widthMm ?? 3;
  const bandRegion: BandRegion = {
    insideBand(u: number, t: number): boolean {
      const uu = ((u % 1) + 1) % 1;
      return distToPolylinePeriodic(uu, t, featureEdgePolyline, uToMm, tToMm) < widthMm;
    },
  };

  // ── 2. Assemble with the band excluded → the dyadic hole. ──────────────────────
  const assembly = assembleWatertight(sampler, innerSampler, dims, {
    ...base,
    featureLevel: opts.featureLevel,
    outerFeatureLines: opts.assemblyFeatureLines ?? defaultAssemblyFeature(),
    bandRegions: [bandRegion],
  });
  const { outerWall, vertexUT, ringVertexIds } = internOuterWall(assembly);

  // ── 3. Extract the count-1 dyadic hole boundary. ───────────────────────────────
  const hole = extractHoleBoundary(outerWall, ringVertexIds);

  // ── 4. Feature-pinned corridor paving (the spike machinery, real feature). ─────
  const paved = corridorPave({
    boundary: hole,
    vertexUT,
    featurePolyline: featureEdgePolyline,
    sampler,
  });

  // ── 5. Merge: complement outer wall ++ corridor fill (one id-space). ───────────
  const mergedVertexUT: Array<[number, number]> = vertexUT.slice();
  for (let i = vertexUT.length; i < paved.vertexUT.length; i++) {
    mergedVertexUT.push(paved.vertexUT[i]);
  }
  const mergedIndices: number[] = (outerWall.indices as number[]).slice();
  for (const [a, b, c] of paved.triangles) mergedIndices.push(a, b, c);

  return {
    bandRegion,
    hole,
    paved,
    merged: {
      indices: mergedIndices,
      vertexUT: mergedVertexUT,
      ringVertexIds,
    },
    existingVertexCount: vertexUT.length,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// MULTI-FEATURE corridor (Task 2 — a real junction + a real loop in ONE corridor).
//
// `realFeatureCorridor` (above) drives ONE feature edge. Real topology needs MANY
// features in ONE corridor: a JUNCTION (≥3 open edges meeting at a shared node) or a
// closed LOOP (a Voronoi cell). `realFeatureCorridorMulti` changes exactly two things
// vs the single path: (1) the band TUBE is the UNION of tubes around EVERY feature
// polyline (a point is in-band if it is within `widthMm` of ANY feature); (2) it calls
// {@link corridorPaveMulti} with all the chains (open junction edges + closed loops)
// pinned at once. The assemble → intern → extract → merge spine is byte-identical.
// ═════════════════════════════════════════════════════════════════════════════

/** One real feature to pin in a multi-feature corridor. */
export interface MultiFeatureSpec {
  /** Dense (u,t) polyline (a detector sub-arc, or a closed cell loop). */
  polyline: UTPoint[];
  /** `true` ⇒ a closed loop (a Voronoi cell). */
  closed?: boolean;
  /** Anchor for the chain HEAD (open chains only; default snap-boundary). */
  start?: FeatureChainInput['start'];
  /** Anchor for the chain TAIL (open chains only; default snap-boundary). */
  end?: FeatureChainInput['end'];
}

/** Result of {@link realFeatureCorridorMulti}. */
export interface RealFeatureCorridorMultiResult {
  bandRegion: BandRegion;
  hole: HoleBoundary;
  paved: CorridorPaveMultiResult;
  merged: {
    indices: number[];
    vertexUT: Array<[number, number]>;
    ringVertexIds: Set<number>;
  };
  existingVertexCount: number;
}

/**
 * Run the dyadic-edge-seam corridor pipeline with MULTIPLE real features pinned in
 * ONE corridor (a junction and/or a closed loop). The corridor band is the union of
 * mm-width tubes around every feature polyline.
 *
 * @param sampler  The outer-wall surface sampler (a REAL `styleSampler` pot).
 * @param features  The real features to pin (open junction edges + closed cell loops).
 * @param opts  Feature level, corridor width, and optional dim/sampler overrides.
 */
export function realFeatureCorridorMulti(
  sampler: SurfaceSampler,
  features: MultiFeatureSpec[],
  opts: RealFeatureCorridorOptions,
): RealFeatureCorridorMultiResult {
  const dims = opts.dims ?? DEFAULT_DIMS;
  const base = opts.baseOptions ?? DEFAULT_BASE;
  const cellWidth = 1 / 2 ** opts.featureLevel;

  const innerSampler: SurfaceSampler =
    opts.innerSampler ?? {
      position(u: number, t: number) {
        const theta = u * 2 * Math.PI;
        const r = 36;
        const z = dims.tBottom + t * (dims.H - dims.tBottom);
        return [r * Math.cos(theta), r * Math.sin(theta), z];
      },
    };

  // ── mm scale factors (FL-independent band width). Use the radius at the first
  // feature's midpoint as the local u→mm factor (all features sit in one region). ──
  const ref = features[0].polyline;
  const midPt = ref[Math.floor(ref.length / 2)];
  const midPos = sampler.position(((midPt.u % 1) + 1) % 1, midPt.t);
  const featRadiusMm = Math.hypot(midPos[0], midPos[1]);
  const uToMm = 2 * Math.PI * featRadiusMm;
  const tToMm = dims.H;

  const widthMm =
    opts.widthCells !== undefined
      ? opts.widthCells * cellWidth * uToMm
      : opts.widthMm ?? 3;

  // ── 1. The corridor band: UNION of tubes around every feature polyline. ────────
  const bandRegion: BandRegion = {
    insideBand(u: number, t: number): boolean {
      const uu = ((u % 1) + 1) % 1;
      for (const f of features) {
        if (distToPolylinePeriodic(uu, t, f.polyline, uToMm, tToMm) < widthMm) return true;
      }
      return false;
    },
  };

  // ── 2. Assemble with the band excluded → the dyadic hole. ──────────────────────
  const assembly = assembleWatertight(sampler, innerSampler, dims, {
    ...base,
    featureLevel: opts.featureLevel,
    outerFeatureLines: opts.assemblyFeatureLines ?? defaultAssemblyFeature(),
    bandRegions: [bandRegion],
  });
  const { outerWall, vertexUT, ringVertexIds } = internOuterWall(assembly);

  // ── 3. Extract the count-1 dyadic hole boundary. ───────────────────────────────
  const hole = extractHoleBoundary(outerWall, ringVertexIds);

  // ── 4. Multi-feature corridor paving (all chains pinned in one region). ────────
  const featureChains: FeatureChainInput[] = features.map((f) => ({
    polyline: f.polyline,
    closed: f.closed,
    start: f.start,
    end: f.end,
  }));
  const paved = corridorPaveMulti({
    boundary: hole,
    vertexUT,
    features: featureChains,
    sampler,
  });

  // ── 5. Merge: complement outer wall ++ corridor fill (one id-space). ───────────
  const mergedVertexUT: Array<[number, number]> = vertexUT.slice();
  for (let i = vertexUT.length; i < paved.vertexUT.length; i++) {
    mergedVertexUT.push(paved.vertexUT[i]);
  }
  const mergedIndices: number[] = (outerWall.indices as number[]).slice();
  for (const [a, b, c] of paved.triangles) mergedIndices.push(a, b, c);

  return {
    bandRegion,
    hole,
    paved,
    merged: {
      indices: mergedIndices,
      vertexUT: mergedVertexUT,
      ringVertexIds,
    },
    existingVertexCount: vertexUT.length,
  };
}
