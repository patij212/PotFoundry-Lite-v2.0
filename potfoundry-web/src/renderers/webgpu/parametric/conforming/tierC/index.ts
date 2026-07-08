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
import { refineToZeroOutliers, type RefineResult } from './noBridgeRefine';
import { collapseDegenerateFaces } from './collapseDegenerate';

export { countJunctionNodes, isCountUnstableStyle } from './countUnstable';
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
export {
  ParallelScorerPool,
  scoreWholeMeshParallel,
  samplerGrid,
} from './parallelScorer';
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

/**
 * Map a refined chart mesh onto the ConformingOuterWallResult contract.
 * Seam-wrap flags are derived per-facet (corner u's straddling the wrap);
 * boundary rings are the ordered t=0 / t=1 vertex rows. NOTE (staging
 * honesty): unlike the quadtree path, cdt2d over [0,1] does not SHARE seam
 * vertex indices — full-wall seam closure is Task-6/integration scope and
 * one reason the flag stays default-OFF.
 */
function toOuterWallResult(refined: RefineResult): ConformingOuterWallResult {
  const nV = refined.uv.length / 2;
  const vertices = new Float32Array(nV * 3);
  for (let i = 0; i < nV; i++) {
    const u = refined.uv[2 * i];
    vertices[3 * i] = ((u % 1) + 1) % 1;
    vertices[3 * i + 1] = refined.uv[2 * i + 1];
    vertices[3 * i + 2] = 0;
  }
  const indices = Uint32Array.from(refined.tris);
  const nF = indices.length / 3;
  const seamTriangles = new Uint8Array(nF);
  for (let f = 0; f < nF; f++) {
    const ua = vertices[3 * indices[3 * f]];
    const ub = vertices[3 * indices[3 * f + 1]];
    const uc = vertices[3 * indices[3 * f + 2]];
    const span =
      Math.max(ua, ub, uc) - Math.min(ua, ub, uc);
    if (span > 0.5) seamTriangles[f] = 1;
  }
  const ringOf = (t: number): number[] => {
    const ring: number[] = [];
    for (let i = 0; i < nV; i++) {
      if (Math.abs(refined.uv[2 * i + 1] - t) < 1e-9) ring.push(i);
    }
    ring.sort((a, b) => vertices[3 * a] - vertices[3 * b]);
    return ring;
  };
  return {
    vertices,
    indices,
    seamTriangles,
    gridVertexCount: nV,
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
 * Drop-in for {@link buildConformingOuterWall}: identical signature and
 * result. Flag off → pure delegation (byte-identical). Flag on → the Tier-C
 * perfect-mesher path (not yet wired; throws until plan Task 4).
 */
export function buildTierCOuterWall(
  sampler: SurfaceSampler,
  opts: ConformingOuterWallOptions,
): ConformingOuterWallResult {
  if (!isPerfectMesherEnabled()) {
    return buildConformingOuterWall(sampler, opts);
  }
  // Flag ON (dev-only): Tier-C fires only for count-unstable feature
  // networks; Tier-A/B styles take the production path unchanged.
  const graph = detectFeatures(sampler, TIER_C_DETECT_OPTS);
  if (!isCountUnstableStyle('', graph)) {
    return buildConformingOuterWall(sampler, opts);
  }
  // The perfect-mesher pipeline: protected complex → no-bridge locked CDT →
  // whole-mesh honest-brute refine to literal 0 interior outliers. PROVEN at
  // patch scale (Gothic/GeoStar, VALIDATION 7); the full-wall domain below is
  // integration scope validated by the Task-6 re-baseline gate — the flag
  // stays default-OFF until that gate and the sliver question resolve.
  const complex = buildProtectedComplex(sampler, '', graph);
  const refined = refineToZeroOutliers(
    sampler,
    complex,
    { uLo: 0, uHi: 1, tLo: 0, tHi: 1 },
    {
      tolMm: 0.01,
      maxPass: 16,
      bulkPasses7pt: 4,
      bgArcMm: 0.35,
      ruler: DEFAULT_RULER,
    },
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
