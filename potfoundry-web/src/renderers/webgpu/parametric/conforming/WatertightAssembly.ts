/**
 * WatertightAssembly.ts — Whole-pot watertight-by-construction assembly.
 *
 * Builds the outer and inner walls (conforming, pinned to a shared uniform
 * `nRing`), then joins them with cap surfaces (rim, bottom-under, bottom-top,
 * drain) that REFERENCE the walls' shared ring vertex indices rather than
 * duplicating them. Because every boundary ring is a single set of indices
 * shared by both neighbouring surfaces, the result is watertight by
 * construction — no weld, no repair battery.
 *
 * Output: a combined `{ vertices:(u,t,surfaceId), indices, surfaceRanges }`.
 * The pipeline (T5) GPU-evaluates every packed (u,t,surfaceId) vertex to 3D;
 * each shared ring vertex carries its OWNING surface's triple, and the GPU's
 * evaluate_vertices is constructed so neighbouring surfaces' ring positions
 * coincide exactly (same r, z, twist), so index-sharing yields a closed solid.
 *
 * Geometry per surfaceId (see adaptive_mesh.wgsl evaluate_vertices):
 *  - 0 outer wall: z=t·H
 *  - 1 inner wall: z=tBottom+t·(H−tBottom)
 *  - 2 rim @z=H:           inner-top (t=0) ↔ outer-top (t=1)
 *  - 3 bottom-under @z=0:  outer-bottom (t=0) ↔ drain ring (t=1)
 *  - 4 bottom-top @z=tBottom: inner-bottom (t=0) ↔ drain ring (t=1)
 *  - 5 drain: bottom-under drain ring (t=0, z=0) ↔ bottom-top drain ring (t=1, z=tBottom)
 *
 * If rDrain<=0 there is no drain surface; the two base discs fan to a single
 * centre vertex on the axis.
 *
 * @module conforming/WatertightAssembly
 */

import type { SurfaceSampler } from './SurfaceSampler';
import {
  buildConformingWall, type ConformingWallResult, type WallBudgetTelemetry, type WallStageTiming,
} from './ConformingWall';
import type { BandRegion } from './FeatureConformingTriangulator';
export type { BandRegion } from './FeatureConformingTriangulator';
import type { CdtStats } from './ConstrainedCellTriangulator';
import { TRI_SOURCE } from './QuadtreeTriangulator';
import { annulusStrip, discFan } from './RingStrip';
import type { FeatureLine } from './FeatureLineGraph';
import { classifySurfaceShear } from './FShearDiagnostics';
import type { ConformingOuterWallResult } from './ConformingOuterWall';
import { isPerfectMesherEnabled } from './tierC';

/** Reference shape anisotropy gating uBias on (a wide/flat pot exceeds it). */
const UBIAS_AREF = 3;
/**
 * Fixed anisotropy bias applied to a wide/flat pot. MEASURED (2026-06-09, full-20
 * short-wide H40/OD300 B-sweep): the previous relief-driven per-cell B
 * (`round(log2(median(√E/√G)/AREF))`, capped 4) MIS-FIRED. It OVER-biased
 * moderate-relief styles — ArtDeco got B=3, whose extra u-refinement turned the
 * grading-transition triangles into a 3639-cell band of ~101-aspect slivers
 * (the surface metric there is clean, maxSquareAspect≤29 — the slivers are a
 * CONSTRUCTION artifact of too much bias, not surface anisotropy) — while a
 * UNIFORM B=2 left EVERY wide/flat non-feature style sliver-free at short-wide
 * (ArtDeco 3639→0, SpiralRidges 468→0, FourierBloom & 11 others all 0, max
 * aspect ≤51). B=1 left SpiralRidges' helix at 11; B=3 broke ArtDeco. So the
 * bias no longer scales with relief — a single modest exponent is both necessary
 * and sufficient across the wide/flat regime. (Default/tall pots are handled by
 * GATE B below — the anisotropy quality bias — not this wide/flat dims bias.)
 */
const UBIAS_WIDE_B = 2;

/**
 * Cap on the relief bias (mirrors the GAP-1 uBias ceiling). Extreme relief
 * saturates here rather than over-refining into construction slivers.
 */
const MAX_RELIEF_B = 4;

/**
 * Anisotropy bias B (≥0) for a wall sampler — a GATED, FIXED bias.
 *
 * Gates on a RELIEF-FREE wide/flat measure: `wideFlat = 2π·R̄ / Hspan`, the mean
 * wall radius over the wall height span. A genuinely wide/flat pot gets a single
 * FIXED bias {@link UBIAS_WIDE_B} (GATE A); a pot that is not wide/flat falls
 * through to GATE B (the anisotropy quality bias), which now fires at default dims.
 *
 * Why GEOMETRIC, not `median(2π·r/√G)`: √G = √(Hspan² + (∂r/∂t)²) is inflated by a
 * style's t-DIRECTION relief, so the old `2π·r/√G` gate UNDER-read the wide/flat-
 * ness of t-relief styles and wrongly excluded them — Crystalline at short-wide
 * stayed B=0 and kept 55 slivers, while its plain-shape twins were biased. R̄ and
 * the z-RANGE wash out relief (∂r/∂t averages/ranges away), so the gate sees the
 * true shape. It is a strict SUPERSET of the old gate (√G ≥ Hspan ⇒ geometric ≥
 * old ratio), so it never drops a style the old gate biased; across the dimension
 * space only the SHORT-WIDE regime crosses it (tall-narrow 0.25, no-drain 2.98,
 * high-flare 1.66, twisted 2.16, default 2.98 — all B=0; short-wide ≈22.8 → B=2).
 *
 * Why the wide/flat bias is FIXED, not relief-scaled: a square (u,t) cell maps to
 * a √E/√G:1 3D sliver (GAP 1, level-independent); the bias makes a level-L leaf
 * span Δu=1/2^(L+B), 3D-near-square. The earlier version scaled B by
 * `median(√E/√G)`, but a full-20 short-wide B-sweep MEASURED that harmful: the
 * REAL band-limited surfaces never exceed maxSquareAspect≈67 (never sliver from
 * surface anisotropy), and a larger B only adds CONSTRUCTION slivers at grading
 * transitions (ArtDeco B=3 → 3639 ~101-aspect cells). A uniform B={@link
 * UBIAS_WIDE_B} is necessary (FourierBloom/SpiralRidges fail at B=0/1) and
 * sufficient (every wide/flat non-feature style is sliver-free). See UBIAS_WIDE_B.
 *
 * TWO GATES (the wide/flat dims bias is GATE A; the serration fix is GATE B):
 *  - GATE A — wide/flat DIMS (`wideFlat > AREF·√2`): the fixed {@link UBIAS_WIDE_B}.
 *    WITH features it stays 0 — NOT the (now-fixed) braid crack, but because B>0
 *    amplifies GAP-2 curve-needle slivers on the level-set styles (Voronoi/Gyroid);
 *    see the deferral note at the caller. Lifting it awaits the needle fix.
 *  - GATE B — surface ANISOTROPY at default/tall dims (`!wideFlat`): a square (u,t)
 *    cell at √E/√G=ρ splits into ρ:1 3D triangles (low min-angle; staircased crests
 *    at steep relief). `B≈log2(maxURatio/√3)` squares them toward equilateral. It is
 *    SELF-CALIBRATING: moderate base anisotropy (ρ≈3 → B=1) gives clean-CAD triangle
 *    quality (MEASURED 2026-06-10: %below-20° ~50%→~2-10%, fewer triangles); high
 *    u-relief climbs (11.8 → B=3 — but B≥3 was later MEASURED non-manifold on
 *    CDT-insertion styles, hence the temporary hasFeatures cap below);
 *    `maxURatio < √2·√3 ≈ 2.45` (tall-narrow) → B=0. It FIRES WITH features and is
 *    the !wideFlat branch only (never the short-wide regime). This RE-BASELINES
 *    default meshes (no longer byte-identical) — a deliberate quality trade; the
 *    goal vector (watertight / features / no slivers) still holds.
 *
 * @param hasFeatures whether the OUTER wall carries inserted feature lines.
 *   Affects GATE A (see above) and, TEMPORARILY (Stage 0), caps GATE B at 2 —
 *   see the containment note at the GATE B tail.
 * Exported for unit testing (both gate thresholds + the fixed/relief values).
 */
export function computeUBias(sampler: SurfaceSampler, hasFeatures = false): number {
  // Relief-free shape: mean radius over the z-span. ∂r/∂t relief averages/ranges
  // away, so t-relief styles read their true wide/flatness (unlike 2π·r/√G).
  let rSum = 0;
  let n = 0;
  let zMin = Infinity;
  let zMax = -Infinity;
  const N = 16;
  for (let j = 0; j <= N; j++) {
    const t = j / N;
    for (let i = 0; i < N; i++) {
      const p = sampler.position(i / N, t);
      rSum += Math.hypot(p[0], p[1]);
      n++;
      if (p[2] < zMin) zMin = p[2];
      if (p[2] > zMax) zMax = p[2];
    }
  }
  const wideFlat = (2 * Math.PI * (rSum / Math.max(n, 1))) / Math.max(zMax - zMin, 1e-6);
  // GATE A — wide/flat DIMS ⇒ the fixed wide bias, EXCEPT with features (deferred to
  // 0 — the braid crack it once guarded is fixed; B>0 now amplifies Voronoi/Gyroid
  // curve-needle slivers, so the defer waits on the GAP-2 needle fix; see caller).
  // GATE B never reaches this regime (it is the !wideFlat branch below).
  if (wideFlat > UBIAS_AREF * Math.SQRT2) return hasFeatures ? 0 : UBIAS_WIDE_B;
  // GATE B — ANISOTROPY bias at default/tall dims (clean-CAD triangle quality +
  // serration, unified). `maxURatio` is the worst u-dominant √E/√G over the surface
  // (same 192² lattice the serration probe uses). A square (u,t) cell at √E/√G=ρ
  // splits into ρ:1 3D triangles — low min-angle, and at steep relief a staircased
  // crest. uBias B sets Δu/Δt=1/2^B, so B≈log2(ρ/√3) squares the cell toward the
  // equilateral residual √3. The formula is SELF-CALIBRATING and now fires at
  // DEFAULT dims: moderate base anisotropy (ρ≈3 → B=1) — MEASURED 2026-06-10 to drop
  // %below-20° from ~50% to ~2-10% with FEWER triangles, watertight, across
  // Hive/Gyroid/Gothic/Voronoi/ArtDeco/CelticKnot/BasketWeave; high u-relief still
  // climbs (11.8 → B=3 — but B≥3 was later MEASURED non-manifold on CDT-insertion
  // styles, hence the temporary hasFeatures cap below); very low
  // anisotropy (maxURatio < √2·√3 ≈ 2.45, e.g. tall-narrow) → B=0 (untouched). It
  // FIRES WITH features (crests/quality need it) and is the !wideFlat branch only,
  // so it never touches the short-wide regime (GATE A). This RE-BASELINES default
  // meshes (no longer byte-identical) — a deliberate quality-for-byte-identical
  // trade; the goal vector (watertight / features / no slivers) still holds.
  const { maxURatio } = classifySurfaceShear(sampler);
  const b = Math.round(Math.log2(maxURatio / Math.sqrt(3)));
  // TEMPORARY Stage-0 containment (export-endgame spec §5 Stage 0; B-sweep artifact
  // e2e/baselines/b-sweep-2026-06.json): auto-B>=3 is NON-MANIFOLD on CDT-insertion
  // styles (SFB@1 B=3: nonMan=3, sliver=2285) with no true-instrument gain over B=2
  // (band 40.6%->11.6% sub-15deg at B=2, crestRms within 4%). Lifted by Stage 3's gate.
  const capped = hasFeatures ? Math.min(b, 2) : b;
  return Math.max(0, Math.min(MAX_RELIEF_B, capped));
}

/** Pot dimensions needed to place the cap/drain surfaces. */
export interface AssemblyDimensions {
  /** Overall height (mm). */
  H: number;
  /** Base thickness — z of the inner-wall bottom / bottom-top disc (mm). */
  tBottom: number;
  /** Drain radius (mm). <=0 ⇒ solid base (discs fan to a centre vertex). */
  rDrain: number;
}

/** Wall tuning shared by both walls (mirrors ConformingWallOptions sans surfaceId). */
export interface AssemblyWallOptions {
  maxSagMm: number;
  maxEdgeMm: number;
  minEdgeMm: number;
  gradeRatio: number;
  maxLevel: number;
  resU: number;
  resT: number;
  /**
   * Uniform ring count — power of two; both walls pin to this in t. With an
   * anisotropy bias B>0 the actual shared ring carries nRing·2^B vertices.
   */
  nRing: number;
  /**
   * Optional explicit anisotropy bias B (≥0) for BOTH walls (GAP 1). When
   * omitted it is auto-computed from the OUTER metric (median √E/√G), deferred to
   * 0 when the outer wall carries feature lines. Δu=1/2^(level+B), Δt=1/2^level —
   * cells stay 3D-near-square on wide/flat pots. B=0 (default at default dims) is
   * a perfect no-op.
   */
  uBias?: number;
  /**
   * Enable the LOCAL directional u-refinement pass (per-leaf `uExtra`, GAP 1) on
   * the final build of NON-feature walls — removes residual short-WIDE slivers on
   * wide/flat smooth pots (Crystalline / ArtDeco / HexagonalHive analogues). It
   * is GATED (no-op at default dims) and never touches the pinned boundary rows
   * (so `nRing` is unchanged and both walls' rings still match). Forced OFF when
   * `outerFeatureLines` are present (directional refine is disabled on feature
   * walls). Defaults to true; pass false to disable globally.
   */
  directionalRefine?: boolean;
  /**
   * Metric samples per axis for the quadtree refinement size test on BOTH walls
   * (default 1 = centre-only, byte-identical). >1 makes the refiner SEE a steep
   * relief crease anywhere in a cell (the centre-only test misses an off-centre
   * crease → under-tessellated wall → stretched chord facets). See
   * {@link ConformingWallOptions.cellSamples}.
   */
  cellSamples?: number;
  /**
   * Optional ANALYTIC curvature floor for the OUTER wall's sizing field ONLY
   * (E-2026-07-09-ANALYTIC-FLOOR; see conforming/AnalyticCurvatureFloor and
   * {@link ConformingWallOptions.curvatureFloor}). The inner wall keeps the pure
   * sampler estimate — its offset field's κ differs, and an outer-derived floor
   * there could only mis-spend budget. Omit ⇒ byte-identical assembly.
   */
  outerCurvatureFloor?: (u: number, t: number) => number;
  /** κ cap paired with `outerCurvatureFloor` (see {@link SizingOptions.maxKappa}). */
  outerMaxKappa?: number;
  /**
   * PRODUCTION-MESHER analytic-score inputs for the OUTER wall ONLY
   * (E-2026-07-24-ANALYTIC-SCORE / -LEVER-STACK-CLOSE). When the
   * `__pfConformingAnalyticScore` flag is on AND these are supplied, the outer
   * wall's quadtree refinement decision scores its chord sag against the EXACT
   * analytic surface `outerAnalyticRA` (θ=u·2π, z=t·`outerAnalyticH`) instead of
   * the band-limited bilinear sampler — the cure for the sampler blindness that
   * floors Crystalline/GeoStar/Gyroid/Voronoi. Forwarded verbatim to the OUTER
   * {@link buildConformingWall} as `analyticRA`/`analyticH`/`analyticSagMm`; the
   * INNER wall is deliberately left WITHOUT them so its analytic branch stays
   * inert ({@link buildConformingWall}'s `buildAnalyticSagSpec` no-ops when
   * `analyticRA` is absent). Omit ⇒ byte-identical assembly (production default).
   */
  outerAnalyticRA?: (theta: number, z: number) => number;
  /** Wall height H (mm) paired with `outerAnalyticRA` (the analytic z=t·H lift). */
  outerAnalyticH?: number;
  /**
   * Analytic-sag target (mm) for the OUTER analytic-score refine, DECOUPLED from
   * the sampler `maxSagMm`. Only read with `outerAnalyticRA`. Omit ⇒ the outer
   * wall's analytic criterion defaults to `maxSagMm` (see {@link ConformingWallOptions.analyticSagMm}).
   */
  outerAnalyticSagMm?: number;
  /**
   * Optional whole-pot triangle budget. Split evenly across the two walls (the
   * caps add only a small fixed amount), then each wall's sizing field is scaled
   * to approach its share — bounded so neither wall coarsens below the
   * sag-required mesh. Omit for the pure sag-driven mesh.
   */
  targetTriangles?: number;
  /**
   * Budget interpretation (see ConformingWallOptions.budgetMode). Defaults to
   * `'target'`; production passes `'cap'` so smooth walls keep their small
   * sag-tight count instead of being inflated up to the budget.
   */
  budgetMode?: 'target' | 'cap';
  /**
   * Optional uniform base-refinement level for BOTH walls (see
   * ConformingWallOptions.minUniformLevel). Guarantees full-height columns at
   * u=i/2^L so sharp vertical creases can be pinned to real mesh edges. Omit for
   * the pure adaptive mesh.
   */
  minUniformLevel?: number;
  /**
   * Optional feature curves (loops / diagonals / braids) inserted into the
   * OUTER wall only (surfaceId 0) as real mesh edges via local constrained
   * Delaunay. The inner wall is smooth (constant offset), so it gets none. See
   * {@link ConformingWallOptions.featureLines}. Clipped to keep the shared
   * boundary rings intact. Omit for the plain mesh.
   */
  outerFeatureLines?: FeatureLine[];
  /** t-margin for feature clipping (see ConformingWallOptions.featureTMargin). */
  featureTMargin?: number;
  /** Feature-cell refinement level (see ConformingWallOptions.featureLevel). */
  featureLevel?: number;
  /**
   * Warp-pinned CREASE loci (vertical/horizontal/helical) for the OUTER wall —
   * REFINE-ONLY (see {@link ConformingWallOptions.creaseLines}): they drive
   * uBias-invariant t-refinement of the crease columns/rows so an anisotropy bias
   * B>0 does not strip the crease t-rows feature coverage needs. NOT inserted as
   * CDT edges (the downstream warps realise the creases). Applied to the outer
   * wall only (the inner wall is a smooth constant offset). No-op at B=0 / empty.
   */
  outerCreaseLines?: FeatureLine[];
  /**
   * Optional WARP-COMPOSED surface map of the OUTER wall, used ONLY to tag
   * quadtree leaves with `efg` so the shaped triangulation templates measure
   * the metric the emitted triangles ACTUALLY carry after the post-assembly
   * domain warps (Stage-1 Task 2; see {@link ConformingWallOptions.efgSampler}).
   * Per-wall because each wall's warp composition reads its OWN plain sampler.
   * Sizing/refinement stay on the plain `outerSampler`. Omit ⇒ untagged
   * (legacy templates, byte-identical).
   */
  outerEfgSampler?: SurfaceSampler;
  /**
   * Warp-composed map of the INNER wall (same role as `outerEfgSampler`). The
   * inner wall receives the SAME three warps as the outer (u-warp: all
   * surfaces; t-warp: surfaceId<1.5 includes the inner wall; helix: walls
   * sheared by their own t — verified against the ParametricExportComputer
   * application loops), composed over the inner plain sampler.
   */
  innerEfgSampler?: SurfaceSampler;
  /**
   * Opt-in offset-band footprints (general-mesher integration spike, Task 2),
   * threaded to the OUTER wall's emit-gate (features are outer-only, so the
   * inner smooth-offset wall gets none). A leaf fully inside a band is skipped
   * at emission so the band's own paving fills it. Omit ⇒ byte-identical
   * default assembly (the load-bearing flag-OFF guarantee).
   */
  bandRegions?: BandRegion[];
  /**
   * Opt-in offset-band RAIL feature lines (general-mesher integration spike,
   * Task 4), threaded to the OUTER wall only (features are outer-only). Every
   * snapped rail vertex is force-registered into the complement's grid-line
   * registry so both adjacent cells adopt it identically and the band's paving
   * welds to the complement by the same global id (watertight by construction).
   * Omit / empty ⇒ byte-identical default assembly.
   */
  railLines?: FeatureLine[];
  /**
   * OPT-IN remedy for the 2-locus deterministic non-manifold defect at
   * near-tangent doubled general-curve passes (E-2026-07-11-TIERC-HEADTOHEAD
   * Arm A2 — `research/lab/tierc/champion-spec-gyroid.md` §1.5; `'snapMerge'`
   * is Arm A4b). Threaded to the OUTER wall only (features are outer-only,
   * see `outerFeatureLines`). Default `'off'` (or omitted) ⇒ byte-identical
   * default assembly (the load-bearing flag-OFF guarantee). See
   * `FeatureConformingTriangulator.ts`'s `multiCurveCellPolicy` doc for the
   * mechanism.
   */
  multiCurveCellPolicy?: 'off' | 'forceRefine' | 'fanRepair' | 'snapMerge';
  /**
   * PROD-TIERC (opt-in, flag-gated): a pre-built Tier-C analytic outer wall to
   * ADOPT for surfaceId 0 instead of building it via {@link buildConformingWall}.
   * This is the literal-0.01 Gothic/GeoStar outer wall
   * ({@link buildTierCOuterWall}); its periodic u-seam is welded and its t=0/t=1
   * rings MUST be rim-pinned (via `TierCOuterWallOptions.nRing`) to exactly this
   * assembly's `nRing`, ascending-U — so the shared rim (`annulusStrip`) and base
   * caps (`emitRadialCap`) pair it index-for-index against the pinned-nRing inner
   * wall UNCHANGED. When adopted, the inner wall is built at the SAME ring count
   * with uBias 0 to guarantee the equal-count rim join. CONSUMED ONLY when
   * {@link isPerfectMesherEnabled} is true AND this is present; omit (or flag-off)
   * ⇒ structurally byte-identical default assembly (the load-bearing tripwire).
   */
  tierCOuterWall?: ConformingOuterWallResult;
}

/** Index range and vertex count for one surface in the combined mesh. */
export interface SurfaceRange {
  surfaceId: number;
  /** First index (into `indices`) belonging to this surface. */
  indexStart: number;
  /** One past the last index. */
  indexEnd: number;
  /** Vertices uniquely OWNED by this surface (walls: grid verts; caps: 0 or new ring/centre verts). */
  vertexCount: number;
}

/** Combined watertight mesh in (u,t,surfaceId) parameter space. */
export interface WatertightAssemblyResult {
  /** Packed (u, t, surfaceId) per vertex — GPU-evaluated to 3D downstream. */
  vertices: Float32Array;
  /** Triangle indices into `vertices` (consistently oriented). */
  indices: Uint32Array;
  /** Per-surface index ranges + owned-vertex counts. */
  surfaceRanges: SurfaceRange[];
  /**
   * Per-wall constrained-CDT masking-channel counters (Stage-0 instrument).
   * Present only when a wall took the feature path; in practice only the OUTER
   * wall carries features (the inner wall is a smooth offset). Metadata only.
   */
  cdtStats?: { outer?: CdtStats; inner?: CdtStats };
  /**
   * Per-triangle emission provenance (Stage-0 instrument): TRI_SOURCE values,
   * parallel to `indices`/3 of the FINAL assembled mesh. Wall triangles carry
   * their triangulator tags; every ring/cap/disc triangle is RING_OR_CAP.
   * Metadata only — the triangle content/order is untouched.
   */
  triangleSource?: Uint8Array;
  /**
   * Pre-triangulation budget telemetry: how far 'cap' sizing got toward
   * `opts.targetTriangles` BEFORE triangulation. `capSaturated` on either wall
   * means the budget is unreachable by coarsening alone (the residual gap is
   * the decimate-or-refuse decision's input). Metadata only — the mesh is
   * byte-identical with or without it.
   */
  budgetReport?: {
    requestedTriangles?: number;
    perWallBudget?: number;
    outer?: WallBudgetTelemetry;
    inner?: WallBudgetTelemetry;
  };
  /**
   * DEV-ONLY per-wall search/final-build/triangulation sub-timing, kept
   * SEPARATE per wall (E-2026-07-10 follow-up to E-2026-07-09-EXPORT-STAGE-TIMING,
   * which summed outer+inner — hiding that features, and therefore the CDT
   * path, only ever land on the outer wall), plus the array-packing time this
   * function spends outside either wall build (rim/drain-or-disc emission,
   * vertex/index array growth, orientOutward). Present only when both walls
   * carried `stageTiming` (dev builds only). Metadata only — the mesh is
   * unchanged.
   */
  stageTiming?: {
    outer: WallStageTiming;
    inner: WallStageTiming;
    arrayPackingMs: number;
  };
}

/** Append a wall's packed vertices to `verts`, returning the index offset. */
function appendWall(verts: number[], wall: ConformingWallResult): number {
  const offset = verts.length / 3;
  for (let i = 0; i < wall.vertices.length; i++) verts.push(wall.vertices[i]);
  return offset;
}

/**
 * Number of radial bands for a cap whose radius runs `rOuter`→`rInner` over a
 * ring of `nRing` U-samples. Picks bands so each is roughly square (radial step
 * ≈ tangential segment width at the mid radius), clamped to [1, 64]. A single
 * outer↔inner band on a wide base would be a long thin needle (high aspect); a
 * few intermediate concentric rings keep every band well-shaped — watertight by
 * construction (the intermediate rings are shared between adjacent bands).
 */
function radialBandCount(rOuter: number, rInner: number, nRing: number): number {
  const span = Math.abs(rOuter - rInner);
  const rMid = 0.5 * (Math.abs(rOuter) + Math.abs(rInner));
  const tangential = (2 * Math.PI * Math.max(rMid, 1e-6)) / nRing;
  if (tangential <= 1e-9) return 1;
  return Math.max(1, Math.min(64, Math.round(span / tangential)));
}

/**
 * Emit a radially-subdivided annular/disc cap referencing a shared outer ring.
 *
 * The cap surface parameterizes t: t=0 is the (shared) `outerRing`, t=1 is the
 * inner terminus — either a shared `innerRing` (e.g. a drain ring) or a single
 * `centreIdx` on the axis (solid base). `nRadial` bands are built; intermediate
 * rings (t=k/nRadial, k=1..nRadial-1) are NEW vertices owned by this surface and
 * SHARED between consecutive bands, so the cap stays watertight. Returns the
 * number of NEW vertices appended (for surfaceRange bookkeeping).
 */
function emitRadialCap(
  verts: number[],
  indices: number[],
  outerRing: number[],
  inner: { ring: number[] } | { centreIdx: number },
  surfaceId: number,
  nRing: number,
  nRadial: number,
  invert: boolean,
): number {
  const newVertStart = verts.length / 3;
  // Build the intermediate rings (t = k/nRadial for k=1..nRadial-1).
  const rings: number[][] = [outerRing];
  for (let k = 1; k < nRadial; k++) {
    const t = k / nRadial;
    const ring: number[] = [];
    for (let i = 0; i < nRing; i++) {
      ring.push(verts.length / 3);
      verts.push(i / nRing, t, surfaceId);
    }
    rings.push(ring);
  }

  const hasInnerRing = 'ring' in inner;
  if (hasInnerRing) rings.push(inner.ring);

  // Bands between consecutive rings.
  for (let b = 0; b < rings.length - 1; b++) {
    const tri = annulusStrip(rings[b], rings[b + 1], invert);
    for (const v of tri) indices.push(v);
  }
  // Final band to the centre (solid base), if any.
  if (!hasInnerRing) {
    const tri = discFan(rings[rings.length - 1], inner.centreIdx, invert);
    for (const v of tri) indices.push(v);
  }
  return verts.length / 3 - newVertStart;
}

/**
 * Assemble the whole pot watertight from an outer and inner wall sampler.
 *
 * @param outerSampler Returns outer-wall 3D positions for (u,t) (surfaceId 0).
 * @param innerSampler Returns inner-wall 3D positions for (u,t) (surfaceId 1).
 * @param dims Pot dimensions (H, tBottom, rDrain).
 * @param opts Wall tuning incl. the shared uniform `nRing`.
 */
export function assembleWatertight(
  outerSampler: SurfaceSampler,
  innerSampler: SurfaceSampler,
  dims: AssemblyDimensions,
  opts: AssemblyWallOptions,
): WatertightAssemblyResult {
  const nRing = opts.nRing;

  // --- 0. Anisotropy bias (GAP 1): make cells 3D-near-square on wide/flat pots.
  // Both walls MUST share the same bias so their boundary rings (= nRing verts
  // after the pin adjustment) match by index. Computed once from the OUTER metric
  // by `computeUBias`, which itself gates features: the WIDE/FLAT dims bias (GATE A)
  // stays DEFERRED to B=0 on feature walls. RE-MEASURED 2026-06-09 (forced B=2,
  // H40/OD300, 6 inserted styles): the bnd=6 BRAID T-JUNCTION crack this once guarded
  // is GONE — bnd=nonMan=orient=0 for ALL of them (the grid-line registry + transition-
  // edge snap that landed after this comment fixed it). The deferral now serves a
  // DIFFERENT, narrower purpose: B>0 AMPLIFIES the GAP-2 curve-needle slivers on the
  // LEVEL-SET styles — Voronoi sliver 3→10, GyroidManifold 0→2 — even though it
  // IMPROVES the others (CelticTriquetra maxAspect 39.8→10.7, CelticKnot 72.7→60.5,
  // HexagonalHive 76→61, BasketWeave 50→25). So a blanket un-defer trades a wash; it
  // waits on the GAP-2 forced-crossing-mirror needle fix (then un-defer is a clean
  // win). The DEFAULT-dims RELIEF bias (GATE B) DOES fire with features
  // (SuperformulaBlossom@high needs B>0 to de-staircase its crests, MEASURED watertight
  // + crest-tracked) — safe because the inserted styles sit below GATE B's threshold at
  // default dims (CelticKnot maxURatio 4.1 < 6); only their short-wide (wide/flat) case
  // reaches GATE A. `opts.uBias` overrides (used by the uBias unit tests).
  const hasFeatures = (opts.outerFeatureLines?.length ?? 0) > 0;
  // Dev/diagnostic override (`window.__pfConformingUBias`): force a specific
  // anisotropy bias to bisect short-wide construction artifacts (e.g. 0 = no
  // bias). Never set in production; mirrors `__pfConformingNRing`. Takes
  // precedence over the gated auto-computed bias.
  const uBiasOverride = (globalThis as unknown as { __pfConformingUBias?: number }).__pfConformingUBias;
  const uBias = typeof uBiasOverride === 'number' && uBiasOverride >= 0
    ? Math.floor(uBiasOverride)
    : opts.uBias ?? computeUBias(outerSampler, hasFeatures);

  // GAP 1 local/directional anisotropy: OPT-IN (default OFF). The pass is proven
  // a true no-op at DEFAULT dims (gated + uExtra=0 byte-identical — verified, all
  // 20 styles byte-identical e2e) and topologically watertight/T-junction-free
  // (adversarially verified). BUT the e2e on the real SHORT-WIDE residuals showed
  // it does NOT deliver and REGRESSES: the real residual slivers are F-SHEAR
  // (area-collapse EG−F²→0), not u-long — so Crystalline gets 0 splits (correctly
  // skipped via the physW>physH guard), while ArtDeco's u-long cells DO fire but
  // the both-axis eUL-balance cascade explodes → BUILD TIMEOUT (the vertical-stripe
  // propagation the design review flagged). So it stays OFF by default until (a)
  // the cascade is bounded AND (b) a genuinely u-long-residual case exists; the
  // real short-wide residuals need metric-ALIGNED/rotated cells (F-shear), same as
  // twisted. Pass `directionalRefine:true` to opt in (used by the GAP-1 tests).
  // DISABLED on feature walls regardless (directional refine is not insertion-aware).
  // Dev/diagnostic override (`window.__pfConformingDirectional`): force the local
  // directional u-refine on/off, BYPASSING the opt-in default AND the
  // hasFeatures disable, to measure its effect on relief anisotropy. Never set in
  // production; mirrors `__pfConformingUBias`.
  const directionalOverride = (globalThis as unknown as { __pfConformingDirectional?: boolean }).__pfConformingDirectional;
  const directionalRefine = typeof directionalOverride === 'boolean'
    ? directionalOverride
    : (opts.directionalRefine ?? false) && !hasFeatures;

  // --- 1. Build the two conforming walls (uniform shared rings) -------------
  // Split the whole-pot budget across the two walls (caps add only a small fixed
  // amount). Each wall's own sag floor still bounds its share from below.
  const perWallBudget =
    opts.targetTriangles !== undefined && opts.targetTriangles > 0
      ? Math.max(1, Math.floor(opts.targetTriangles / 2))
      : undefined;
  const wallOpts = {
    maxSagMm: opts.maxSagMm,
    maxEdgeMm: opts.maxEdgeMm,
    minEdgeMm: opts.minEdgeMm,
    gradeRatio: opts.gradeRatio,
    maxLevel: opts.maxLevel,
    resU: opts.resU,
    resT: opts.resT,
    nRing,
    targetTriangles: perWallBudget,
    budgetMode: opts.budgetMode,
    minUniformLevel: opts.minUniformLevel,
    uBias,
    directionalRefine,
    cellSamples: opts.cellSamples,
  };
  // PROD-TIERC (flag-gated, opt-in): ADOPT a pre-built Tier-C analytic outer wall
  // for surfaceId 0 instead of building it here. Gated on BOTH the perfect-mesher
  // flag AND the wall being supplied ⇒ the non-Tier-C path is structurally
  // untouched (flag-off / absent = byte-identical default assembly). The adopted
  // wall's rings are rim-pinned to `nRing`; the inner wall is built at that SAME
  // ring count (uBias 0) so the shared rim/base caps pair index-for-index.
  const adoptTierC =
    isPerfectMesherEnabled() && opts.tierCOuterWall !== undefined;
  // Features go on the OUTER wall only (the inner wall is a smooth offset).
  // The per-wall efg samplers (warp-composed maps) arm the shaped templates;
  // sizing stays on the plain samplers (first positional arg).
  const outer: ConformingWallResult = adoptTierC
    ? {
        vertices: opts.tierCOuterWall!.vertices,
        indices: opts.tierCOuterWall!.indices,
        seamTriangles: opts.tierCOuterWall!.seamTriangles,
        gridVertexCount: opts.tierCOuterWall!.gridVertexCount,
        bottomRing: opts.tierCOuterWall!.bottomRing,
        topRing: opts.tierCOuterWall!.topRing,
      }
    : buildConformingWall(outerSampler, {
        ...wallOpts,
        surfaceId: 0,
        featureLines: opts.outerFeatureLines,
        featureTMargin: opts.featureTMargin,
        featureLevel: opts.featureLevel,
        creaseLines: opts.outerCreaseLines,
        efgSampler: opts.outerEfgSampler,
        bandRegions: opts.bandRegions,
        railLines: opts.railLines,
        // Analytic curvature floor — OUTER wall only (see AssemblyWallOptions doc).
        curvatureFloor: opts.outerCurvatureFloor,
        maxKappa: opts.outerMaxKappa,
        // PRODUCTION-MESHER analytic-score surface — OUTER wall only (see
        // AssemblyWallOptions doc). buildAnalyticSagSpec no-ops when analyticRA is
        // absent, so this is byte-identical unless the production mesher supplied it.
        analyticRA: opts.outerAnalyticRA,
        analyticH: opts.outerAnalyticH,
        analyticSagMm: opts.outerAnalyticSagMm,
        // Multi-curve cell force-refine — OUTER wall only (features are outer-only).
        multiCurveCellPolicy: opts.multiCurveCellPolicy,
      });
  const inner = buildConformingWall(innerSampler, {
    ...wallOpts,
    surfaceId: 1,
    efgSampler: opts.innerEfgSampler,
    // When adopting the Tier-C outer wall, pin the inner wall to the SAME emergent
    // ring count (uBias 0) so both walls' boundary rings match by index — the
    // equal-count precondition of the rim `annulusStrip` and base `emitRadialCap`.
    ...(adoptTierC
      ? { nRing: outer.bottomRing.length, uBias: 0 }
      : {}),
  });

  // DEV-ONLY "array packing" timer (E-2026-07-10 follow-up): everything from
  // here through orientOutward — rim/drain-or-disc emission, vertex/index
  // array growth, the Float32Array/Uint32Array conversion, and the
  // orientation-consistency pass. Gated on both walls actually carrying
  // stageTiming (same dev-build condition they were computed under) rather
  // than a second isDevWallStageTimingEnabled() call, so this can never
  // disagree with the walls about whether timing is on.
  const timingOn = Boolean(outer.stageTiming) && Boolean(inner.stageTiming);
  const packStart = timingOn ? performance.now() : 0;

  // The shared ring vertex count grows with the bias: 2^(log2(nRing)+B). Both
  // walls pin the SAME (pinBoundaryLevel + uBias), so their rings match; the caps
  // reference this actual count (not the input nRing) so index-sharing holds.
  const nRingActual = outer.bottomRing.length;
  if (inner.bottomRing.length !== nRingActual) {
    throw new Error(
      `assembleWatertight: wall ring mismatch (outer ${nRingActual}, inner ${inner.bottomRing.length})`,
    );
  }

  const verts: number[] = [];
  const indices: number[] = [];
  const ranges: SurfaceRange[] = [];
  // Stage-0 provenance: one TRI_SOURCE tag per triangle of the FINAL index
  // array, built in lockstep — walls copy their per-triangle tags below; every
  // later (non-wall) emission is back-filled RING_OR_CAP before packing.
  const sourceTags: number[] = [];

  // --- 2. Concatenate wall vertices; remap each wall's local indices --------
  const outerOffset = appendWall(verts, outer); // 0
  const outerCount = outer.vertices.length / 3;
  const innerOffset = appendWall(verts, inner);
  const innerCount = inner.vertices.length / 3;

  const remap = (offset: number, ring: number[]): number[] =>
    ring.map((i) => i + offset);

  // Shared boundary rings (global indices), each ordered by ascending U.
  const outerTop = remap(outerOffset, outer.topRing); // z=H, r=outer
  const outerBottom = remap(outerOffset, outer.bottomRing); // z=0, r=outer
  const innerTop = remap(innerOffset, inner.topRing); // z=H, r=inner
  const innerBottom = remap(innerOffset, inner.bottomRing); // z=tBottom, r=inner

  // Wall triangle blocks (remapped) recorded as their own surface ranges.
  const pushWallTris = (
    surfaceId: number,
    offset: number,
    vertexCount: number,
    wall: ConformingWallResult,
  ): void => {
    const indexStart = indices.length;
    for (let i = 0; i < wall.indices.length; i++) indices.push(wall.indices[i] + offset);
    // Stage-0 provenance: copy the wall's per-triangle tags in lockstep. Both
    // triangulators always populate `triangleSource`; the fallback only keeps
    // the channel length-aligned if that contract ever breaks.
    const wallSource = wall.triangleSource;
    const wallTris = wall.indices.length / 3;
    for (let i = 0; i < wallTris; i++) {
      sourceTags.push(wallSource !== undefined ? wallSource[i] : TRI_SOURCE.PLAIN_QUAD);
    }
    ranges.push({ surfaceId, indexStart, indexEnd: indices.length, vertexCount });
  };
  // INVARIANT: all pushWallTris calls MUST complete before any cap/ring index
  // emission — the RING_OR_CAP back-fill assumes walls' tags are already in place.
  pushWallTris(0, outerOffset, outerCount, outer);
  pushWallTris(1, innerOffset, innerCount, inner);

  // --- 3. Rim (surfaceId 2): annulus inner-top ↔ outer-top, no new verts ----
  {
    const indexStart = indices.length;
    const tri = annulusStrip(innerTop, outerTop, false);
    for (const v of tri) indices.push(v);
    ranges.push({ surfaceId: 2, indexStart, indexEnd: indices.length, vertexCount: 0 });
  }

  const hasDrain = dims.rDrain > 0;

  // Representative ring radii for radial band sizing (twist-free magnitudes).
  const rOuterBot = radial(outerSampler.position(0, 0)); // outer-wall bottom
  const rInnerBot = radial(innerSampler.position(0, 0)); // inner-wall bottom

  if (hasDrain) {
    // --- 4. Drain rings (surfaceId 5): NEW vertices, ordered by U ----------
    const drainBottomRing: number[] = []; // z=0   (drain t=0)
    const drainTopRing: number[] = []; // z=tBottom (drain t=1)
    const drainVertStart = verts.length / 3;
    for (let i = 0; i < nRingActual; i++) {
      drainBottomRing.push(verts.length / 3);
      verts.push(i / nRingActual, 0, 5);
    }
    for (let i = 0; i < nRingActual; i++) {
      drainTopRing.push(verts.length / 3);
      verts.push(i / nRingActual, 1, 5);
    }
    const drainVertCount = verts.length / 3 - drainVertStart;

    // bottom-under (3): outer-bottom (t=0) ↔ drain bottom ring (t=1), radial bands.
    {
      const indexStart = indices.length;
      const nRad = radialBandCount(rOuterBot, dims.rDrain, nRingActual);
      const newV = emitRadialCap(
        verts, indices, outerBottom, { ring: drainBottomRing }, 3, nRingActual, nRad, false,
      );
      ranges.push({ surfaceId: 3, indexStart, indexEnd: indices.length, vertexCount: newV });
    }
    // bottom-top (4): inner-bottom (t=0) ↔ drain top ring (t=1), radial bands.
    {
      const indexStart = indices.length;
      const nRad = radialBandCount(rInnerBot, dims.rDrain, nRingActual);
      const newV = emitRadialCap(
        verts, indices, innerBottom, { ring: drainTopRing }, 4, nRingActual, nRad, false,
      );
      ranges.push({ surfaceId: 4, indexStart, indexEnd: indices.length, vertexCount: newV });
    }
    // drain (5): drain bottom ring (t=0) ↔ drain top ring (t=1).
    {
      const indexStart = indices.length;
      const tri = annulusStrip(drainBottomRing, drainTopRing, false);
      for (const v of tri) indices.push(v);
      ranges.push({
        surfaceId: 5,
        indexStart,
        indexEnd: indices.length,
        vertexCount: drainVertCount,
      });
    }
  } else {
    // --- 4'. Solid base: each disc reduces radially to ONE centre vertex ----
    // bottom-under (3): outer-bottom ring → centre at z=0.
    {
      const indexStart = indices.length;
      const centreUnder = verts.length / 3;
      verts.push(0, 1, 3); // (u=0, t=1, s=3) ⇒ r=rDrain≈0, z=0
      const nRad = radialBandCount(rOuterBot, 0, nRingActual);
      const newV = emitRadialCap(
        verts, indices, outerBottom, { centreIdx: centreUnder }, 3, nRingActual, nRad, false,
      );
      ranges.push({ surfaceId: 3, indexStart, indexEnd: indices.length, vertexCount: newV + 1 });
    }
    // bottom-top (4): inner-bottom ring → centre at z=tBottom.
    {
      const indexStart = indices.length;
      const centreTop = verts.length / 3;
      verts.push(0, 1, 4); // (u=0, t=1, s=4) ⇒ r≈0, z=tBottom
      const nRad = radialBandCount(rInnerBot, 0, nRingActual);
      const newV = emitRadialCap(
        verts, indices, innerBottom, { centreIdx: centreTop }, 4, nRingActual, nRad, false,
      );
      ranges.push({ surfaceId: 4, indexStart, indexEnd: indices.length, vertexCount: newV + 1 });
    }
  }

  // Stage-0 provenance: every triangle emitted AFTER the two walls (rim, caps,
  // discs, drain) is a ring/cap template — back-fill the channel to the final
  // triangle count. orientOutward below flips windings in place but never
  // drops/reorders triangles, so the tags stay parallel.
  while (sourceTags.length < indices.length / 3) sourceTags.push(TRI_SOURCE.RING_OR_CAP);
  if (sourceTags.length !== indices.length / 3) {
    throw new Error(
      `assembleWatertight: triangleSource length ${sourceTags.length} != triangle count ${indices.length / 3}`,
    );
  }

  const vertices = new Float32Array(verts);
  const indexArr = new Uint32Array(indices);

  // --- 5. Orientation: make the closed solid consistently outward -----------
  orientOutward(vertices, indexArr, evalPos.bind(null, dims, outerSampler, innerSampler));
  const arrayPackingMs = timingOn ? performance.now() - packStart : 0;

  // Stage-0 instrument: surface the per-wall CDT masking-channel counters where
  // present (feature walls only). Metadata only — the mesh is unchanged.
  const cdtStats =
    outer.cdtStats !== undefined || inner.cdtStats !== undefined
      ? { outer: outer.cdtStats, inner: inner.cdtStats }
      : undefined;

  // Budget-honesty channel: per-wall sizing-search telemetry, present only when
  // a budget drove the search. Metadata only — the mesh is unchanged.
  const budgetReport =
    opts.targetTriangles !== undefined && opts.targetTriangles > 0
      ? {
          requestedTriangles: opts.targetTriangles,
          perWallBudget,
          outer: outer.budget,
          inner: inner.budget,
        }
      : undefined;

  // DEV-ONLY: the two walls' search/final-build/triangulation sub-timing kept
  // SEPARATE (E-2026-07-10 follow-up — the prior E-2026-07-09-EXPORT-STAGE-TIMING
  // arm summed them; features only ever land on the outer wall, so summing hid
  // that asymmetry) + the array-packing time this function spends outside
  // either wall build. Metadata only — the mesh is unchanged.
  const stageTiming =
    outer.stageTiming && inner.stageTiming
      ? { outer: outer.stageTiming, inner: inner.stageTiming, arrayPackingMs }
      : undefined;

  return {
    vertices,
    indices: indexArr,
    surfaceRanges: ranges,
    cdtStats,
    triangleSource: Uint8Array.from(sourceTags),
    budgetReport,
    stageTiming,
  };
}

/**
 * 3D position of a packed (u,t,surfaceId) vertex, used only by the orientation
 * pass. Walls defer to their samplers; caps/drain are placed analytically to
 * coincide with the GPU geometry (same r, z as evaluate_vertices). The twist is
 * irrelevant to orientation (a rigid rotation about z preserves winding), so it
 * is omitted here.
 */
function evalPos(
  dims: AssemblyDimensions,
  outerSampler: SurfaceSampler,
  innerSampler: SurfaceSampler,
  u: number,
  t: number,
  surfaceId: number,
): [number, number, number] {
  if (surfaceId < 0.5) {
    const p = outerSampler.position(u, t);
    return [p[0], p[1], p[2]];
  }
  if (surfaceId < 1.5) {
    const p = innerSampler.position(u, t);
    return [p[0], p[1], p[2]];
  }
  const theta = 2 * Math.PI * (u - Math.floor(u));
  // Radii at the rings (twist-free; radial magnitude is all the orient pass needs).
  const rOuterTop = radial(outerSampler.position(u, 1));
  const rOuterBot = radial(outerSampler.position(u, 0));
  const rInnerTop = radial(innerSampler.position(u, 1));
  const rInnerBot = radial(innerSampler.position(u, 0));
  let r: number;
  let z: number;
  if (surfaceId < 2.5) {
    r = rInnerTop + (rOuterTop - rInnerTop) * t;
    z = dims.H;
  } else if (surfaceId < 3.5) {
    r = rOuterBot + (dims.rDrain - rOuterBot) * t;
    z = 0;
  } else if (surfaceId < 4.5) {
    r = rInnerBot + (dims.rDrain - rInnerBot) * t;
    z = dims.tBottom;
  } else {
    r = dims.rDrain;
    z = t * dims.tBottom;
  }
  return [r * Math.cos(theta), r * Math.sin(theta), z];
}

function radial(p: readonly number[]): number {
  return Math.hypot(p[0], p[1]);
}

/**
 * Make every triangle consistently outward-facing. The mesh is a single closed
 * manifold built from index-shared rings, so a position-welded edge adjacency
 * is connected; flood-fill orientation from a seed, then flip the whole mesh if
 * its signed volume is negative (i.e. it came out inward). Deterministic and
 * purely topological — not a repair/weld pass (it never merges/moves vertices).
 */
function orientOutward(
  packed: Float32Array,
  indices: Uint32Array,
  posOf: (u: number, t: number, s: number) => [number, number, number],
): void {
  const triCount = indices.length / 3;
  if (triCount === 0) return;

  // Weld vertices by 3D position so shared-ring edges are identified. Sorted
  // group scan, NOT a keyed Map: V8 Maps cap at ~16.7M entries, and the string-
  // keyed weld/edge maps this replaces crashed real 5-6M-tri assemblies run in
  // Node (the §V11w/§V11x Map-cap wall, reproduced 2026-07-09 — same class as
  // the metrics.ts topologyMetric fix). Group key = quantized (x,y,z); weld id
  // = the group's smallest vertex index, identical to the old Map's
  // first-occurrence-wins id (ties in the sort break on index).
  const n = packed.length / 3;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = posOf(packed[i * 3], packed[i * 3 + 1], packed[i * 3 + 2]);
    pos[i * 3] = p[0];
    pos[i * 3 + 1] = p[1];
    pos[i * 3 + 2] = p[2];
  }
  const inv = 1 / 1e-4;
  const qx = new Float64Array(n);
  const qy = new Float64Array(n);
  const qz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    qx[i] = Math.round(pos[i * 3] * inv);
    qy[i] = Math.round(pos[i * 3 + 1] * inv);
    qz[i] = Math.round(pos[i * 3 + 2] * inv);
  }
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => qx[a] - qx[b] || qy[a] - qy[b] || qz[a] - qz[b] || a - b);
  const weld = new Uint32Array(n);
  for (let s = 0; s < n; ) {
    const r = order[s];
    let e = s + 1;
    while (e < n && qx[order[e]] === qx[r] && qy[order[e]] === qy[r] && qz[order[e]] === qz[r]) e++;
    for (let k = s; k < e; k++) weld[order[k]] = r;
    s = e;
  }

  // Undirected welded edge → adjacent triangles, as a sorted-key CSR (capless).
  // Key = lo·2^26 + hi is exact in a double (weld ids ≪ 2^26); entries are
  // emitted in ascending-triangle order and the CSR fill preserves that order,
  // so each edge's triangle list matches the old Map's push order exactly —
  // the flood fill below visits identical neighbours in identical order.
  const EK = 1 << 26;
  if (n >= EK) throw new Error(`orientOutward: vertex count ${n} exceeds edge-key range`);
  const mMax = triCount * 3;
  const eKeys = new Float64Array(mMax);
  const eTriIds = new Uint32Array(mMax);
  let m = 0;
  for (let t = 0; t < triCount; t++) {
    const a = weld[indices[t * 3]];
    const b = weld[indices[t * 3 + 1]];
    const c = weld[indices[t * 3 + 2]];
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
      if (i === j) continue;
      eKeys[m] = (i < j ? i : j) * EK + (i < j ? j : i);
      eTriIds[m] = t;
      m++;
    }
  }
  const sorted = eKeys.slice(0, m);
  sorted.sort();
  const uKeys = new Float64Array(m);
  const uOff = new Uint32Array(m + 1);
  let nEdges = 0;
  for (let s = 0; s < m; ) {
    let e = s + 1;
    while (e < m && sorted[e] === sorted[s]) e++;
    uKeys[nEdges] = sorted[s];
    uOff[nEdges + 1] = uOff[nEdges] + (e - s);
    nEdges++;
    s = e;
  }
  const findEdge = (key: number): number => {
    let lo = 0;
    let hi = nEdges - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = uKeys[mid];
      if (v === key) return mid;
      if (v < key) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  };
  const csrTris = new Uint32Array(m);
  const cursor = new Uint32Array(nEdges);
  for (let k = 0; k < m; k++) {
    const slot = findEdge(eKeys[k]);
    csrTris[uOff[slot] + cursor[slot]++] = eTriIds[k];
  }

  // Flood-fill: neighbours across a shared edge must traverse it in opposite
  // directions. Flip a neighbour whose directed edge matches ours.
  const oriented = new Uint8Array(triCount);
  const flip = (t: number): void => {
    const i0 = t * 3;
    const tmp = indices[i0 + 1];
    indices[i0 + 1] = indices[i0 + 2];
    indices[i0 + 2] = tmp;
  };
  const directedHas = (t: number, i: number, j: number): boolean => {
    const a = weld[indices[t * 3]];
    const b = weld[indices[t * 3 + 1]];
    const c = weld[indices[t * 3 + 2]];
    return (
      (a === i && b === j) ||
      (b === i && c === j) ||
      (c === i && a === j)
    );
  };
  for (let seed = 0; seed < triCount; seed++) {
    if (oriented[seed]) continue;
    oriented[seed] = 1;
    const stack = [seed];
    while (stack.length > 0) {
      const t = stack.pop() as number;
      const a = weld[indices[t * 3]];
      const b = weld[indices[t * 3 + 1]];
      const c = weld[indices[t * 3 + 2]];
      const dirEdges: Array<[number, number]> = [[a, b], [b, c], [c, a]];
      for (const [i, j] of dirEdges) {
        if (i === j) continue;
        const slot = findEdge((i < j ? i : j) * EK + (i < j ? j : i));
        if (slot < 0) continue;
        for (let li = uOff[slot]; li < uOff[slot + 1]; li++) {
          const nb = csrTris[li];
          if (nb === t || oriented[nb]) continue;
          // Consistent if the neighbour traverses (i,j) as (j,i). If it has the
          // SAME directed edge, flip it.
          if (directedHas(nb, i, j)) flip(nb);
          oriented[nb] = 1;
          stack.push(nb);
        }
      }
    }
  }

  // Global sense: if the signed volume is negative the mesh is inward — flip all.
  let vol6 = 0;
  for (let t = 0; t < triCount; t++) {
    const ia = indices[t * 3] * 3;
    const ib = indices[t * 3 + 1] * 3;
    const ic = indices[t * 3 + 2] * 3;
    const ax = pos[ia], ay = pos[ia + 1], az = pos[ia + 2];
    const bx = pos[ib], by = pos[ib + 1], bz = pos[ib + 2];
    const cx = pos[ic], cy = pos[ic + 1], cz = pos[ic + 2];
    vol6 +=
      ax * (by * cz - bz * cy) -
      ay * (bx * cz - bz * cx) +
      az * (bx * cy - by * cx);
  }
  if (vol6 < 0) {
    for (let t = 0; t < triCount; t++) flip(t);
  }
}
