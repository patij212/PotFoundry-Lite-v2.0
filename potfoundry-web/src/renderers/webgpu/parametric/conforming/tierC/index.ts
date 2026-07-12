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
  s0.sort((a, b) => uv[2 * a + 1] - uv[2 * b + 1]);
  const s0t = s0.map((i) => uv[2 * i + 1]);
  const usedS0 = new Set<number>();
  const pending: Array<[number, number]> = [];
  for (const i of s1) {
    const t = uv[2 * i + 1];
    let lo = 0;
    let hi = s0t.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (s0t[m] < t) lo = m + 1;
      else hi = m;
    }
    let best = lo;
    if (lo > 0 && Math.abs(s0t[lo - 1] - t) <= Math.abs(s0t[best] - t)) best = lo - 1;
    const target = s0[best];
    // Unmatched (no coincident twin) or a collision (two u=1 onto one u=0) ⇒
    // NOT a clean bijection ⇒ abandon the whole merge (safe identity no-op).
    if (Math.abs(s0t[best] - t) >= SEAM_T_EPS || usedS0.has(target)) return remap;
    usedS0.add(target);
    pending.push([i, target]);
  }
  for (const [i, j] of pending) remap[i] = j;
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
