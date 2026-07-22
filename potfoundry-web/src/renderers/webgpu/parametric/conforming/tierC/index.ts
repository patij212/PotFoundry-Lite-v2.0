/**
 * tierC/ — staged perfect-mesher back-port (default-OFF, byte-identical off).
 *
 * `buildTierCOuterWall` is the ONLY symbol the orchestrator calls. With the
 * `__pfPerfectMesher` flag unset/false (always, in production) it delegates
 * unchanged to `buildConformingOuterWall`, so the output is byte-for-byte
 * identical to today (guarded by flagOff.byteIdentical.test.ts). The flag-on
 * Tier-C pipeline (Morse protected complex → no-bridge split → whole-mesh
 * 0-outlier refine → degenerate-face collapse) lands in later plan tasks; see
 * docs/superpowers/plans/2026-07-05-perfect-mesher-backport.md.
 *
 * The flag NEVER flips in the staging plan: Gothic/GeoStar carry a documented
 * print-safe finite-area needle concession (13 sliver levers refuted), and the
 * 20-style whole-mesh re-baseline (VALIDATION 9) blocks any all-styles claim.
 *
 * @module conforming/tierC
 */

import type { SurfaceSampler } from '../SurfaceSampler';
import type { StyleId } from '../../../../../geometry/types';
import {
  buildConformingOuterWall,
  type ConformingOuterWallOptions,
  type ConformingOuterWallResult,
} from '../ConformingOuterWall';
import { detectFeatures } from '../featureGraph/detectFeatures';
import { isCountUnstableStyle } from './countUnstable';
import { TIER_C_DETECT_OPTS } from './detectOpts';
import { buildProtectedComplex } from './morseComplex';
import { DEFAULT_RULER } from './interiorRuler';
import {
  refineToZeroOutliers,
  type RefineOptions,
  type RefineResult,
} from './noBridgeRefine';
import { collapseDegenerateFaces } from './collapseDegenerate';
import type { AnalyticRadiusFn } from '../../../../../fidelity/analyticSurfaceGate';
import { buildMetricOuterWall, type MetricOuterWallOpts } from './regionMetric';
import {
  buildDragonScalesConformingGraph,
  type DsConformingGraphOpts,
  DS_CURVATURE_FINE_STEP,
  DS_CURVATURE_SUBSAMPLES,
} from './dsFeatureEdges';
import { isRegionLayerEnabled, isDsRiserEdgesEnabled, isDsRingStripsEnabled, isDsConeFanEnabled, isSmoothGridEnabled, isBambooEnabled } from './regionLayerFlag';
export { isRegionLayerEnabled, isDsRiserEdgesEnabled, isDsRingStripsEnabled, isDsConeFanEnabled, isSmoothGridEnabled, isBambooEnabled } from './regionLayerFlag';
export { buildMetricOuterWall, type MetricOuterWallOpts } from './regionMetric';
import { buildSmoothGridOuterWall, type SmoothGridOuterWallParams } from './smoothGrid';
export {
  buildSmoothGridWall,
  smoothGridWallToOuterWall,
  deriveSmoothGridDensity,
  buildSmoothGridOuterWall,
  type SmoothGridWall,
  type SmoothGridDensityOpts,
  type SmoothGridOuterWallParams,
} from './smoothGrid';
import { buildDsRingStripWallGeometric, dsRingStripWallToOuterWall, buildDsConeFanWallGeometric, buildBambooRingStripWallGeometric } from './dsRingStrips';
export {
  buildDsRingStripWall,
  buildDsRingStripWallGeometric,
  buildDsRingTSchedule,
  dsRingStripWallToOuterWall,
  buildDsConeFanWall,
  buildDsConeFanWallGeometric,
  buildDsConeFanTSchedule,
  buildDsConeFanCertDomain,
  buildBambooTSchedule,
  buildBambooRingStripWallGeometric,
  type DsRingStripWall,
  type DsTScheduleOpts,
  type DsConeFanOpts,
  type DsConeFanCertDomain,
  type BambooTScheduleOpts,
} from './dsRingStrips';

export {
  countJunctionNodes,
  isCountUnstableStyle,
  COUNT_UNSTABLE_STYLES,
} from './countUnstable';
export { TIER_C_DETECT_OPTS } from './detectOpts';
export {
  buildProtectedComplex,
  type ProtectedComplex,
} from './morseComplex';
export {
  assertWholeMeshZero,
  countInteriorOutliers,
  scoreWholeMesh,
  computeDevArraySeq,
  reduceDevArray,
  radialSurfaceFromSampler,
  DEFAULT_RULER,
  type RulerOptions,
  type WholeMeshScore,
} from './interiorRuler';
// NOTE: parallelScorer.ts statically imports node:worker_threads / node:module /
// node:child_process (dev/test-only parallel path). Re-exporting it from this
// barrel pulled those Node built-ins into the BROWSER bundle via the
// conforming/index → ParametricExportComputer static import chain, and Vite's
// externalization made the module-eval throw ("Module node:worker_threads has
// been externalized…") at app boot — which killed WebGPU init before any canvas
// mounted (all preview modes, not just raycast). Tests import ParallelScorerPool
// / scoreWholeMeshParallel / samplerGrid directly from './parallelScorer', and
// no production code imports them through this barrel, so dropping the re-export
// is safe and keeps the flag-off Tier-C path byte-identical. Import from
// './parallelScorer' directly if a browser-safe consumer ever needs the pool.
export {
  refineToZeroOutliers,
  refineToZeroOutliersParallel,
  seedFromComplex,
  adaptiveSeedPoints,
  type ChartDomain,
  type RefineOptions,
  type RefineResult,
  type DevScorer,
  type AdaptiveSeedCfg,
} from './noBridgeRefine';
export {
  collapseDegenerateFaces,
  countZeroAreaFaces,
  type CollapseResult,
} from './collapseDegenerate';

/** Raw-u proximity (fraction) to the uLo / uHi periodic columns. */
const SEAM_WRAP_EPS = 1e-6;
/** t-station match tolerance (fraction) between the two locked seam columns. */
const SEAM_T_EPS = 1e-6;

/**
 * Build the u=uHi→u=uLo remap that dedupes the periodic seam column (T3.2).
 * The seam lock ({@link buildProtectedComplex}'s `SeamLockSpec`) gives the u=0
 * and u=1 columns byte-identical t-stations, so each u=1 vertex coincides 1:1
 * (same t) with a u=0 vertex after the u→[0,1) wrap.
 *
 * SAFETY GATE (T3.2 concern): the merge is APPLIED only when the two columns
 * form a CLEAN equal-count, injective, t-matched BIJECTION — the converged
 * shared-column state. Merging asymmetric columns (which the whole-domain
 * RED-refine currently produces: it densifies the two boundaries unequally,
 * measured u0≫u1) folds a sparse boundary onto a dense one and introduces
 * NON-MANIFOLD edges — a mesh the watertight guard would reject. So when the
 * columns are NOT a clean bijection this returns IDENTITY (a safe no-op that
 * leaves the prior open-seam mesh untouched, nonManifoldByIndex unchanged),
 * and the dedup auto-activates once the seam boundaries are symmetric. Also
 * identity when the flag is off / no wrap columns exist ⇒ byte-identical.
 */
function seamColumnRemap(uv: number[]): Int32Array {
  const nV = uv.length / 2;
  const remap = new Int32Array(nV);
  for (let i = 0; i < nV; i++) remap[i] = i;
  if (!isPerfectMesherEnabled()) return remap;
  const s0: number[] = [];
  const s1: number[] = [];
  for (let i = 0; i < nV; i++) {
    const u = uv[2 * i];
    if (Math.abs(u) < SEAM_WRAP_EPS) s0.push(i);
    else if (Math.abs(u - 1) < SEAM_WRAP_EPS) s1.push(i);
  }
  // Only a clean equal-count bijection is safe to weld (see SAFETY GATE above).
  if (s0.length === 0 || s1.length === 0 || s0.length !== s1.length) return remap;
  // Two-pointer pairing over BOTH t-sorted columns: with equal counts a clean
  // bijection is the k-th u=1 station paired to the k-th u=0 station. Every pair
  // MUST coincide within SEAM_T_EPS or the columns are not a shared set (abandon
  // to the safe identity no-op). This is robust to genuine within-column
  // duplicate stations that a greedy nearest-match would collide on — the
  // refine's symmetric-seam reconciliation (noBridgeRefine.seamSymmetry) emits
  // both columns as the SAME sorted station multiset, so k-th↔k-th is exact.
  s0.sort((a, b) => uv[2 * a + 1] - uv[2 * b + 1]);
  s1.sort((a, b) => uv[2 * a + 1] - uv[2 * b + 1]);
  for (let k = 0; k < s1.length; k++) {
    if (Math.abs(uv[2 * s1[k] + 1] - uv[2 * s0[k] + 1]) >= SEAM_T_EPS) return remap;
  }
  for (let k = 0; k < s1.length; k++) remap[s1[k]] = s0[k];
  return remap;
}

/**
 * Map a refined chart mesh onto the ConformingOuterWallResult contract.
 * Seam-wrap flags are derived per-facet (corner u's straddling the wrap);
 * boundary rings are the ordered t=0 / t=1 vertex rows.
 *
 * FLAG-ON (T3.2): the periodic u=0/u=1 wrap is deduped to ONE shared locked
 * index column via {@link seamColumnRemap} (the seam lock installs identical
 * t-stations on both columns). Flag-off never reaches here (buildTierCOuterWall
 * pure-delegates) AND `seamColumnRemap` returns identity when the flag is off,
 * so the mapping stays byte-identical to the pre-T3.2 output for any caller.
 */
function toOuterWallResult(refined: RefineResult): ConformingOuterWallResult {
  const nV = refined.uv.length / 2;
  const remap = seamColumnRemap(refined.uv);
  // Compact surviving vertices (those that map to themselves) to new indices.
  const oldToNew = new Int32Array(nV).fill(-1);
  let newCount = 0;
  for (let i = 0; i < nV; i++) {
    if (remap[i] === i) oldToNew[i] = newCount++;
  }
  const finalIndexOf = (i: number): number => oldToNew[remap[i]];

  const vertices = new Float32Array(newCount * 3);
  for (let i = 0; i < nV; i++) {
    if (remap[i] !== i) continue;
    const ni = oldToNew[i];
    const u = refined.uv[2 * i];
    vertices[3 * ni] = ((u % 1) + 1) % 1;
    vertices[3 * ni + 1] = refined.uv[2 * i + 1];
    vertices[3 * ni + 2] = 0;
  }
  const nF = refined.tris.length / 3;
  const indices = new Uint32Array(nF * 3);
  for (let k = 0; k < nF * 3; k++) indices[k] = finalIndexOf(refined.tris[k]);
  const seamTriangles = new Uint8Array(nF);
  for (let f = 0; f < nF; f++) {
    const ua = vertices[3 * indices[3 * f]];
    const ub = vertices[3 * indices[3 * f + 1]];
    const uc = vertices[3 * indices[3 * f + 2]];
    const span = Math.max(ua, ub, uc) - Math.min(ua, ub, uc);
    if (span > 0.5) seamTriangles[f] = 1;
  }
  const ringOf = (t: number): number[] => {
    const ring: number[] = [];
    for (let i = 0; i < nV; i++) {
      if (remap[i] !== i) continue;
      if (Math.abs(refined.uv[2 * i + 1] - t) < 1e-9) ring.push(oldToNew[i]);
    }
    ring.sort((a, b) => vertices[3 * a] - vertices[3 * b]);
    return ring;
  };
  return {
    vertices,
    indices,
    seamTriangles,
    gridVertexCount: newCount,
    bottomRing: ringOf(0),
    topRing: ringOf(1),
  };
}

/**
 * Dev-only lever, mirroring the `__pfConforming*` convention: unset/false in
 * production, set to `true` only by research probes once Tier-C is wired.
 */
export function isPerfectMesherEnabled(): boolean {
  const g = globalThis as unknown as { __pfPerfectMesher?: boolean };
  return g.__pfPerfectMesher === true;
}

/**
 * SUB-FLAG for the C2 analytic-surface lever (T3.4), mirroring
 * {@link isPerfectMesherEnabled}: unset/false in production. The analytic
 * refine (score/place against the EXACT continuous surface instead of the 512²
 * sampler grid — the mechanism that reaches LITERAL 0 outliers ≤0.01mm on
 * Gothic/GeoStar, C2-full-patch-verdict.md) fires ONLY when BOTH this AND
 * `__pfPerfectMesher` are on AND an `analyticRA` closure was supplied by the
 * caller. Off ⇒ the sampler branch runs, byte-identical to today.
 */
export function isTierCAnalyticSurfaceEnabled(): boolean {
  const g = globalThis as unknown as { __pfTierCAnalyticSurface?: boolean };
  return g.__pfTierCAnalyticSurface === true;
}

/**
 * {@link buildTierCOuterWall} options: the base conforming options plus the
 * optional analytic-surface inputs the C2 lever consumes. The analytic fields
 * are IGNORED unless BOTH flags ({@link isPerfectMesherEnabled} +
 * {@link isTierCAnalyticSurfaceEnabled}) are on and the style is count-unstable;
 * passing the closure is byte-identical flag-off (it is only INVOKED in the
 * flag-on analytic branch, never constructed here).
 */
export interface TierCOuterWallOptions extends ConformingOuterWallOptions {
  /**
   * Exact analytic radius r(theta, z) for the style being meshed (built by
   * `src/geometry/analyticRadius.ts#buildAnalyticRadiusFn` at the call site).
   * Enables the C2 analytic-surface refine when `__pfTierCAnalyticSurface` is
   * also on. Absent ⇒ the sampler branch (byte-identical).
   */
  analyticRA?: (theta: number, z: number) => number;
  /** Optional analytic wall height (mm); default = measured off the sampler. */
  analyticH?: number;
  /**
   * RIM-PIN target ring count (PROD-TIERC assembly-share, flag-on only). When set,
   * the flag-on refine reconciles the t=0/t=1 boundary rows to exactly this many
   * evenly-spaced ascending-U stations (see {@link RefineOptions.rimPin}), so the
   * emitted `bottomRing`/`topRing` are length `nRing` and
   * {@link WatertightAssembly.assembleWatertight}'s shared rim/base caps adopt this
   * wall UNCHANGED. Must equal the inner wall's ring count the assembler pairs
   * against. Absent ⇒ emergent CDT rim counts (byte-identical to the pre-share
   * build; the assembler must not adopt an un-pinned wall).
   */
  nRing?: number;
}

/**
 * Drop-in for {@link buildConformingOuterWall}: identical result contract.
 * Flag off → pure delegation (byte-identical, regardless of `styleId`). Flag on
 * → the Tier-C perfect-mesher path, but ONLY for the count-unstable styles the
 * dispatch predicate allow-lists (Gothic/GeoStar); every other style still
 * delegates byte-identical.
 *
 * @param styleId The style being meshed — the dispatch signal (an explicit
 *   allow-list, E-2026-07-09-DISPATCH-PREDICATE; see countUnstable.ts for why
 *   no graph signal separates cleanly). Omit / pass undefined ⇒ never routed to
 *   Tier-C (safe fallback); flag-off ignores it entirely.
 */
export function buildTierCOuterWall(
  sampler: SurfaceSampler,
  opts: TierCOuterWallOptions,
  styleId?: StyleId,
): ConformingOuterWallResult {
  if (!isPerfectMesherEnabled()) {
    return buildConformingOuterWall(sampler, opts);
  }
  // Flag ON (dev-only): Tier-C fires only for count-unstable feature
  // networks (allow-listed); Tier-A/B styles take the production path
  // unchanged. The graph is not needed for the dispatch decision (the
  // count-instability signal that would derive it is refuted — allow-list),
  // so build it only when we DO dispatch, for the protected complex below.
  if (!isCountUnstableStyle(styleId ?? '', { nodes: [], edges: [] })) {
    return buildConformingOuterWall(sampler, opts);
  }
  const graph = detectFeatures(sampler, TIER_C_DETECT_OPTS);
  // The perfect-mesher pipeline: protected complex → no-bridge locked CDT →
  // whole-mesh honest-brute refine to literal 0 interior outliers. PROVEN at
  // patch scale (Gothic/GeoStar, VALIDATION 7); the full-wall domain below is
  // integration scope validated by the Task-6 re-baseline gate — the flag
  // stays default-OFF until that gate and the sliver question resolve.
  // Lock the periodic u=0≡u=1 wrap as a single shared seam column (T3.2): two
  // locked columns with identical t-stations that toOuterWallResult dedupes
  // into one index column (watertight seam). Flag-on-only path.
  const complex = buildProtectedComplex(sampler, '', graph, undefined, undefined, {
    uLo: 0,
    uHi: 1,
    tLo: 0,
    tHi: 1,
  });
  // C2 analytic-surface lever (T3.4): the refine scores + places against the
  // EXACT analytic surface (opts.analyticRA) instead of the sampler grid, the
  // mechanism proven to reach LITERAL 0 outliers ≤0.01 (Gothic 18045/0, GeoStar
  // 5071/0 — C2-full-patch-verdict.md). Fires ONLY when BOTH flags are on AND
  // the caller supplied analyticRA; otherwise the sampler branch runs and the
  // options object is byte-identical to the pre-T3.4 build.
  // NOTE: refineToZeroOutliersParallel remains sampler-only — parallelizing the
  // analytic refine is a separate perf task (documented follow-up, out of scope).
  const useAnalytic =
    isTierCAnalyticSurfaceEnabled() && opts.analyticRA !== undefined;
  const refineOpts: RefineOptions = {
    tolMm: 0.01,
    maxPass: 16,
    bulkPasses7pt: 4,
    bgArcMm: 0.35,
    ruler: DEFAULT_RULER,
    // Seam-share (PROD-TIERC): reconcile the periodic u=0/u=1 boundary columns
    // to a t-station bijection post-refine so toOuterWallResult's seamColumnRemap
    // welds them into ONE shared locked index column (watertight periodic seam).
    // Matches the SeamLockSpec {uLo:0,uHi:1} locked into `complex` above.
    seamSymmetry: { uLo: 0, uHi: 1 },
    // Rim-share (PROD-TIERC assembly): pin the t=0/t=1 rim rows to nRing ascending-U
    // stations so assembleWatertight adopts this wall's rings unchanged. Only when
    // the caller supplied the assembly's ring count; absent ⇒ emergent rim counts.
    ...(opts.nRing ? { rimPin: { nRing: opts.nRing } } : {}),
    ...(useAnalytic
      ? {
          surfaceSource: 'analytic',
          analyticRA: opts.analyticRA,
          analyticH: opts.analyticH,
        }
      : {}),
  };
  const refined = refineToZeroOutliers(
    sampler,
    complex,
    { uLo: 0, uHi: 1, tLo: 0, tHi: 1 },
    refineOpts,
  );
  if (refined.capped) {
    // Honest failure — never emit a mesh the guard rejected.
    throw new Error(
      'tierC: refine pass budget exhausted with interior outliers remaining',
    );
  }
  // Universal slicer-safety post-pass (VALIDATION 6: holds fidelity +
  // watertightness while welding UV-collinear zero-area faces to 0).
  const clean = collapseDegenerateFaces(sampler, refined);
  return toOuterWallResult({ ...refined, uv: clean.uv, tris: clean.tris });
}

// ════════════════════════════════════════════════════════════════════════════
// D-2 REGION-LAYER DISPATCH — route sliver-heavy styles to the M=g/h² kernel
// ════════════════════════════════════════════════════════════════════════════

/**
 * The styles the PROD-TIERC region layer routes to the CERTIFIED M=g/h² region kernel
 * ({@link buildMetricOuterWall}) instead of the structured Tier-A/B/K2 path — the sliver-heavy surfaces the
 * accelerator was validated on (DragonScales 3.1% / GeometricStar 0.6% slivers <20° @ tol0.01, nonMan 0). Kept a
 * deliberately small explicit allow-list (mirrors {@link COUNT_UNSTABLE_STYLES}); no measured graph signal isolates
 * them from relief noise with a defensible margin (see countUnstable.ts).
 */
export const REGION_LAYER_STYLES: ReadonlySet<StyleId> = new Set<StyleId>([
  'DragonScales',
  'GeometricStar',
]);

/** True iff `styleId` is a region-layer style (empty/unknown ⇒ false — safe fallback to the non-region path). */
export function isRegionLayerStyle(styleId: string | undefined): boolean {
  return styleId !== undefined && REGION_LAYER_STYLES.has(styleId as StyleId);
}

/** Inputs for {@link buildRegionOuterWall} — the exact analytic surface + the assembly's shared ring count. */
export interface RegionOuterWallParams {
  /** Exact analytic radius r(theta, z) (built by `buildAnalyticRadiusFn` at the call site). */
  analyticRA: AnalyticRadiusFn;
  /** Wall height (mm). */
  H: number;
  /** Assembly ring count — the emitted rims are rim-pinned to exactly this (see {@link MetricOuterWallOpts.nRing}). */
  nRing: number;
  /** Chord tolerance (mm) driving the M=g/h² sizing field. */
  tolMm: number;
  /** Lower / upper clamp on the target 3D edge length (mm). */
  hMin: number;
  hMax: number;
  /** Optional kernel knobs (metric-grid res, seed density, vertex budget, chord-sag guard). */
  sizeRes?: number;
  seedN?: number;
  maxPoints?: number;
  chordTolMm?: number;
  /**
   * DragonScales only: dense seam-rail t-samples on the (mirrored) u=0≡u=1 seam column (see
   * {@link buildDragonScalesConformingGraph}). The rim-pin weld locks the seam columns, so a rail resolves the
   * wrap-triangle chord that would otherwise spike true-3D error at the seam. Absent ⇒ the DS default (512).
   */
  seamRailSamples?: number;
  /**
   * DragonScales only, MEASUREMENT knobs for the §V11l riser-edge family (E-2026-07-19-DS-RISER-CLOSE). Only consulted
   * when the {@link isDsRiserEdgesEnabled} sub-flag is on (which is what turns risers on at all); absent ⇒ the riser
   * generator's own defaults (128 u-stations, 0.005mm half-height). Let a research probe sweep the tread strip
   * without a rebuild. No effect on the default export path (the flag is off in production).
   */
  riserSamplesPerRing?: number;
  riserHalfMm?: number;
  /**
   * DragonScales only, CONVERGE-A structured ring-strip circumferential column count (nU). Only consulted when the
   * {@link isDsRingStripsEnabled} sub-flag is on. A multiple of 2*scalesPerRow (=32 at defaults) lands the columns on
   * the theta-valley u-lattice. Absent => the {@link DS_RING_STRIP_DEFAULT_NU} default. No effect on the default
   * export path (the flag is off in production).
   */
  ringStripNU?: number;
}

/** Default CONVERGE-A ring-strip circumferential column count (512 = 16*32, valley-aligned at the default DS lattice). */
export const DS_RING_STRIP_DEFAULT_NU = 512;

/** Default DS-CONEFAN-PROD circumferential column count (4096 — the whole-body ≤0.01 verified nU; a multiple of
 *  2*scalesPerRow=32 lands columns on the scale-tip u-lattice so every fan apex is an exact grid vertex). */
export const DS_CONE_FAN_DEFAULT_NU = 4096;

/**
 * D-2 region dispatch: when the region layer is ENABLED ({@link isRegionLayerEnabled}) AND `styleId` is a region
 * style ({@link isRegionLayerStyle}), build the outer wall via the CERTIFIED M=g/h² region kernel, rim-pinned to
 * `nRing` so {@link WatertightAssembly.assembleWatertight}'s existing `tierCOuterWall` adopt hook consumes it
 * UNCHANGED. Returns `undefined` otherwise (flag-off OR a non-region style) ⇒ the caller keeps its existing outer-wall
 * path, byte-identical. Adoption downstream still requires {@link isPerfectMesherEnabled} (the unchanged assembly
 * hook) — a full region run sets BOTH `__pfRegionLayer` and `__pfPerfectMesher`; `__pfRegionLayer` alone is inert.
 */
export function buildRegionOuterWall(
  params: RegionOuterWallParams,
  styleId?: StyleId,
): ConformingOuterWallResult | undefined {
  if (!isRegionLayerEnabled() || !isRegionLayerStyle(styleId)) return undefined;
  const kernelOpts: MetricOuterWallOpts = {
    tolMm: params.tolMm,
    hMin: params.hMin,
    hMax: params.hMax,
    nRing: params.nRing,
    sizeRes: params.sizeRes,
    seedN: params.seedN,
    maxPoints: params.maxPoints,
    chordTolMm: params.chordTolMm,
  };
  // DragonScales feature-conforming path (E-2026-07-13-DS-INTERIOR-CLOSE): embed the per-scale C1 creases (θ-valley
  // ∪ flank-toe) as constraint edges + sub-cell curvature sizing so the body closes to the LITERAL 0.01mm true-3D
  // standard (proven: witness body p99 ~0.009 ≤ 0.01, nonMan 0, vs baseline OFF 0.0147). The graph is analytic from
  // the DS lattice and made SEAM-SYMMETRIC (buildDragonScalesConformingGraph → seamSymmetrizeGraph + a dense seam
  // rail) so the seam-column scales are conformed WITHOUT breaking the rim-pin u=1→u=0 weld bijection — the seam-clip
  // predecessor left them un-conformed and spiked true-3D error ~1.87mm at the seam. Every other region style
  // (GeometricStar) takes the plain region wall UNCHANGED (no graph ⇒ kernel injection blocks inert ⇒ byte-identical).
  // The graph assumes the DEFAULT DS lattice (8/16/0.5) — the validated recipe + captured production artifact both use
  // defaults; non-default dsScaleRows/dsScalesPerRow would need the lattice plumbed through RegionOuterWallParams (follow-up).
  if (styleId === 'DragonScales') {
    // SCALE-TIP CONE-FAN (E-2026-07-21-DS-CONEFAN-PROD — the tournament winner; FIRST whole-body ≤0.01mm true-3D DS
    // mesh) fires ONLY under the narrow default-off `__pfDsConeFan` sub-flag. When on it emits the DS wall as the
    // crest-anchored structured grid with a per-apex graded polar cone-fan at each scale tip (welded by index,
    // watertight by construction) — closing the scale-tip C1 cone apex the uniform grid AND the region kernel both
    // floored at ~0.04mm. Off ⇒ this branch never runs (byte-identical). Checked BEFORE the ring-strip branch since
    // the cone-fan grid already carries the CONVERGE-A ring tread pairs + flank ladders (a superset).
    if (isDsConeFanEnabled()) {
      const wall = buildDsConeFanWallGeometric(
        params.analyticRA,
        params.H,
        params.ringStripNU ?? DS_CONE_FAN_DEFAULT_NU,
      );
      return dsRingStripWallToOuterWall(wall);
    }
    // CONVERGE-A structured ring-strip emitter (E-2026-07-19-DS-CONVERGE-A) fires ONLY under the narrow default-off
    // `__pfDsRingStrips` sub-flag (a THIRD gate under __pfRegionLayer + __pfPerfectMesher). When on it BYPASSES the
    // free-Delaunay region kernel entirely and emits the DS wall as a structured cylinder grid (along-ring rows +
    // across-ring columns + double-valued tread pairs) — watertight by construction, closing BOTH the tread C0 and
    // the near-ring flank the two free-Delaunay levers (S2 risers, B aniso) each REFUTED. Off => this branch never
    // runs and the DS region graph path below is byte-identical to the pre-CONVERGE-A build.
    if (isDsRingStripsEnabled()) {
      const wall = buildDsRingStripWallGeometric(
        params.analyticRA,
        params.H,
        params.ringStripNU ?? DS_RING_STRIP_DEFAULT_NU,
      );
      return dsRingStripWallToOuterWall(wall);
    }
    // §V11l riser edges (E-2026-07-19-DS-RISER-CLOSE) fire ONLY under the narrow default-off `__pfDsRiserEdges`
    // sub-flag: the doubled u-running tread rings at t=k/8 close the interior C0 ring risers (baseline chords the
    // ~1mm step ⇒ ring composite MAX ≈ 0.25mm). Off ⇒ graphOpts omits riserEdges ⇒ byte-identical to the pre-riser
    // DS region graph (the current wired flag-on behavior).
    const graphOpts: DsConformingGraphOpts = {};
    if (params.seamRailSamples !== undefined) graphOpts.seamRailSamples = params.seamRailSamples;
    if (isDsRiserEdgesEnabled()) {
      graphOpts.riserEdges = true;
      if (params.riserSamplesPerRing !== undefined) graphOpts.riserSamplesPerRing = params.riserSamplesPerRing;
      if (params.riserHalfMm !== undefined) graphOpts.riserHalfMm = params.riserHalfMm;
    }
    const graph = buildDragonScalesConformingGraph(params.H, graphOpts);
    kernelOpts.injectedPoints = graph.pts;
    kernelOpts.constraintEdges = graph.edges;
    kernelOpts.pinInjected = true;
    kernelOpts.recoverySubdivideCollinear = true;
    kernelOpts.curvatureFineStep = DS_CURVATURE_FINE_STEP;
    kernelOpts.curvatureSubsamples = DS_CURVATURE_SUBSAMPLES;
  }
  return buildMetricOuterWall(params.analyticRA, { H: params.H }, kernelOpts);
}

// ════════════════════════════════════════════════════════════════════════════
// SMOOTH-GRID DISPATCH — route the C∞ smooth styles to the certifiable uniform grid
// ════════════════════════════════════════════════════════════════════════════

/**
 * The six C∞ SMOOTH styles the certifiable-production-mesh campaign closes on a UNIFORM structured (u,t) grid
 * ({@link buildSmoothGridOuterWall}) — whole-mesh true-3D ≤0.01mm AND judge-certifiable by the exact-dyadic partition
 * (power-of-two columns snap exactly), where the free-Delaunay conforming mesher carries non-dyadic float stations and
 * cannot be. Measured closers (research/lab/2026-07-22-certifiable-production-mesh-campaign.md): SFB 65k · SE 261k ·
 * FB/HR/WI 1.04M · SR ~4M tris. A deliberately small explicit allow-list (mirrors {@link REGION_LAYER_STYLES}) — DISJOINT
 * from the region + count-unstable allow-lists so exactly one emitter claims each style.
 */
export const SMOOTH_GRID_STYLES: ReadonlySet<StyleId> = new Set<StyleId>([
  'HarmonicRipple',
  'SuperellipseMorph',
  'FourierBloom',
  'SpiralRidges',
  'SuperformulaBlossom',
  'WaveInterference',
]);

/** True iff `styleId` is a smooth-grid style (empty/unknown ⇒ false — safe fallback to the non-smooth path). */
export function isSmoothGridStyle(styleId: string | undefined): boolean {
  return styleId !== undefined && SMOOTH_GRID_STYLES.has(styleId as StyleId);
}

/**
 * FACET-ALIGNED structured-grid styles: routed to the SAME uniform (u,t) grid emitter as the C∞ smooth styles, but
 * with facet-aligned column snapping ({@link SmoothGridDensityOpts.alignNU}) instead of pow2, so grid columns LAND on
 * the style's static facet edges (its sharp vertical C0 seams) rather than STRADDLING them. Kept DISJOINT from
 * {@link SMOOTH_GRID_STYLES} (those are genuinely C∞) — the map value is the per-style alignment period. LowPolyFacet:
 * 12 facets tile 2π ⇒ edges at u=odd/24 AND centers at u=even/24 ⇒ alignNU=24 lands columns on BOTH (a multiple of 12
 * that is NOT 24 is the WORST case — it hits centers but the 12 edges fall mid-gap; scorecard mult12/252 body 0.207).
 */
export const FACET_GRID_ALIGN_NU: ReadonlyMap<StyleId, number> = new Map<StyleId, number>([
  ['LowPolyFacet', 24],
]);

/** The facet-alignment period for `styleId`, or undefined if it is not a facet-aligned grid style. */
export function facetGridAlignNU(styleId: string | undefined): number | undefined {
  return styleId === undefined ? undefined : FACET_GRID_ALIGN_NU.get(styleId as StyleId);
}

/**
 * True iff `styleId` routes through the structured-grid emitter — a C∞ smooth style ({@link isSmoothGridStyle}) OR a
 * facet-aligned grid style ({@link facetGridAlignNU}). The dispatch predicate the production caller gates on;
 * empty/unknown ⇒ false (safe fallback to the existing outer-wall path).
 */
export function isStructuredGridStyle(styleId: string | undefined): boolean {
  return isSmoothGridStyle(styleId) || facetGridAlignNU(styleId) !== undefined;
}

/**
 * Smooth-grid dispatch: when the smooth-grid emitter is ENABLED ({@link isSmoothGridEnabled}) AND `styleId` is a
 * structured-grid style ({@link isStructuredGridStyle} — a C∞ smooth style OR a facet-aligned style), build the outer
 * wall via the certifiable uniform (u,t) grid ({@link buildSmoothGridOuterWall}) at the sag-derived density. A
 * FACET-aligned style ({@link facetGridAlignNU}) carries its `alignNU` period into the density opts so grid columns
 * land on its static facet edges (else pow2 straddles them); the C∞ smooth styles carry none (pow2, byte-identical).
 * The grid's rims are EMERGENT (nU columns); the assembly pins the inner wall to `outer.bottomRing.length`
 * (WatertightAssembly.ts) so it adopts this wall UNCHANGED, exactly as for the DS cone-fan — no `nRing` needed.
 * Returns `undefined` otherwise (flag-off OR a non-structured style) ⇒ the caller keeps its existing outer-wall path,
 * byte-identical. Adoption downstream still requires {@link isPerfectMesherEnabled} (the unchanged assembly hook), so
 * a run needs BOTH `__pfSmoothGrid` and `__pfPerfectMesher`; `__pfSmoothGrid` alone is inert.
 */
export function buildSmoothGridDispatchWall(
  params: SmoothGridOuterWallParams,
  styleId?: StyleId,
): ConformingOuterWallResult | undefined {
  if (!isSmoothGridEnabled() || !isStructuredGridStyle(styleId)) return undefined;
  // A facet-aligned style carries an alignNU period so columns land on its static facet edges; the C∞ smooth styles
  // carry none (density.alignNU undefined ⇒ pow2 ⇒ byte-identical to the pre-facet build).
  const alignNU = facetGridAlignNU(styleId);
  const p =
    alignNU === undefined ? params : { ...params, density: { ...params.density, alignNU } };
  return buildSmoothGridOuterWall(p);
}

// ════════════════════════════════════════════════════════════════════════════
// BAMBOO-SEGMENTS DISPATCH — route the layered Bamboo style to the ring-strip emitter
// ════════════════════════════════════════════════════════════════════════════

/**
 * The LAYERED style the BAMBOO-SCHED campaign closes on the CONVERGE-A structured ring-strip
 * ({@link buildBambooRingStripWallGeometric}) — whole-mesh true-3D ≤0.01mm watertight BY CONSTRUCTION AND
 * judge-certifiable via the cut-at-gap exact-dyadic partition, where the free-Delaunay conforming mesher floors on the
 * interior asymVar C0 steps. A deliberately small explicit allow-list (mirrors {@link SMOOTH_GRID_STYLES}) — DISJOINT
 * from the region + smooth + count-unstable allow-lists so exactly one emitter claims each style.
 */
export const BAMBOO_STYLES: ReadonlySet<StyleId> = new Set<StyleId>(['BambooSegments']);

/** True iff `styleId` is the Bamboo dispatch style (empty/unknown ⇒ false — safe fallback to the non-Bamboo path). */
export function isBambooStyle(styleId: string | undefined): boolean {
  return styleId !== undefined && BAMBOO_STYLES.has(styleId as StyleId);
}

/**
 * Default Bamboo ring-strip circumferential column count (1408 — the proven whole-mesh ≤0.01 close, ~2.6M tris at the
 * production H120/Rb45/Rt70 geometry). The residual after close is u-chord ∝ 1/nU (the θ-dependent asymVar tread walls
 * the strip columns chord), so nU is the fidelity lever; ≥1280 closes. Judge cert uses a representative power-of-two nU
 * (the exact-dyadic partition is a property of the STRUCTURE, invariant to column count — the smoothGridCert / DS
 * cut-at-gap precedent), so the production nU need not itself be a power of two.
 */
export const BAMBOO_RING_STRIP_DEFAULT_NU = 1408;

/** Inputs for {@link buildBambooDispatchWall} — the exact analytic surface + the export chord tolerance + node count. */
export interface BambooOuterWallParams {
  /** Exact analytic radius r(theta, z) (built by `buildAnalyticRadiusFn` at the call site; carries the rim-floor() fix). */
  analyticRA: AnalyticRadiusFn;
  /** Wall height (mm). */
  H: number;
  /** Export chord tolerance (mm) — drives the sag-law body density (schedule `sagTolMm`). */
  tolMm: number;
  /** Segment count (registry bsNodeCount) — the interior tread pairs sit at t=k/nodeCount. Default 5. */
  nodeCount?: number;
  /** Circumferential column count (nU). Default {@link BAMBOO_RING_STRIP_DEFAULT_NU}. */
  ringStripNU?: number;
}

/**
 * Bamboo dispatch: when the Bamboo emitter is ENABLED ({@link isBambooEnabled}) AND `styleId` is a Bamboo style
 * ({@link isBambooStyle}), build the outer wall via the CONVERGE-A ring-strip ({@link buildBambooRingStripWallGeometric}
 * — interior segment-boundary tread pairs + sag-law body) packed with the shared {@link dsRingStripWallToOuterWall}.
 * The grid's rims are EMERGENT (nU columns); the assembly pins the inner wall to `outer.bottomRing.length`
 * (WatertightAssembly.ts) so it adopts this wall UNCHANGED, exactly as for the smooth grid + DS cone-fan — no `nRing`
 * needed. Returns `undefined` otherwise (flag-off OR a non-Bamboo style) ⇒ the caller keeps its existing outer-wall
 * path, byte-identical. Adoption downstream still requires {@link isPerfectMesherEnabled} (the unchanged assembly
 * hook), so a Bamboo run needs BOTH `__pfBamboo` and `__pfPerfectMesher`; `__pfBamboo` alone is inert.
 */
export function buildBambooDispatchWall(
  params: BambooOuterWallParams,
  styleId?: StyleId,
): ConformingOuterWallResult | undefined {
  if (!isBambooEnabled() || !isBambooStyle(styleId)) return undefined;
  const wall = buildBambooRingStripWallGeometric(
    params.analyticRA,
    params.H,
    params.ringStripNU ?? BAMBOO_RING_STRIP_DEFAULT_NU,
    {
      sagTolMm: params.tolMm,
      ...(params.nodeCount !== undefined ? { nodeCount: params.nodeCount } : {}),
    },
  );
  return dsRingStripWallToOuterWall(wall);
}
