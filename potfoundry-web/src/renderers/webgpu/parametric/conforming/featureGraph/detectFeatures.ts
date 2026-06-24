/**
 * detectFeatures.ts - Two-scale detectFeatures orchestrator.
 *
 * Wires together the five pieces built in Tasks 1-5:
 *   1. sampleFeatureFields  (Task 2)
 *   2. detectCurvatureRidge (Task 3)
 *   3. detectNormalDiscontinuity (Task 4)
 *   4. detectComponentBoundary  (Task 5)
 *   5. unifyToGraph (Task 5)
 *
 * Two-scale algorithm:
 *   a) Sample fields at coarseRes via sampleFeatureFields.
 *   b) Run all three detectors on the coarse fields.
 *      Component boundary (if reliefIndicator is supplied) runs globally in
 *      both the coarse and fine passes -- not per-sub-region -- because its
 *      zero-contour is a global entity that typically falls on a cell boundary.
 *   c) Identify (u,t) sub-regions (coarse grid cells) where ridge or crease
 *      detectors fired.
 *   d) For each fired sub-region: re-sample ONLY that sub-region at fineRes
 *      and re-detect ridge and crease detectors there (finer placement).
 *   e) Run component boundary at fineRes globally (all t rows, all u columns).
 *   f) Unify all fine segments: ridge + crease from sub-regions, boundary global.
 *
 * @module conforming/featureGraph/detectFeatures
 */

import type { SurfaceSampler } from '../SurfaceSampler';
import type { FeatureGraph, RawSegments, RawSegment } from './types';
import { sampleFeatureFields } from './sampleFields';
import { detectCurvatureRidge } from './curvatureRidge';
import { detectNormalDiscontinuity } from './normalDiscontinuity';
import { detectComponentBoundary } from './componentBoundary';
import { unifyToGraph } from './unify';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Options for {@link detectFeatures}. */
export interface DetectFeaturesOptions {
  /** Resolution for the initial coarse sampling pass. Must be >= 2. */
  coarseRes: number;
  /**
   * Resolution used to re-sample fired sub-regions in the fine pass.
   * When equal to coarseRes, the fine pass produces the same result as the
   * coarse pass (no placement improvement). Set fineRes > coarseRes to get
   * sub-cell accuracy for ridge and crease placement.
   */
  fineRes: number;
  /**
   * Minimum normalized SALIENCY (multiple-of-detector-threshold) for an edge
   * to appear in the final graph. Edges whose merged saliency is below this
   * are dropped by the unifier.
   */
  minStrength: number;
  /**
   * Minimum normal-angle jump (degrees) for the normal-discontinuity detector.
   */
  minAngleDeg: number;
  /**
   * Optional relief indicator for the component-boundary detector.
   * When provided, detectComponentBoundary runs in 'zero' mode using this
   * function as the scalar field. The function is evaluated globally (in full
   * [0,1)x[0,1] parameter space) at fineRes resolution.
   * When omitted, the component-boundary detector is skipped.
   */
  reliefIndicator?: (u: number, t: number) => number;

  /**
   * u→mm scale factor: how many millimetres span the full u∈[0,1) parameter
   * range (i.e. the circumference of the pot).
   * When omitted, derived automatically from the sampler by measuring the 3D
   * chord length of a ring at t=0.5.
   */
  uToMm?: number;

  /**
   * t→mm scale factor: how many millimetres span the full t∈[0,1] parameter
   * range (i.e. the height of the pot).
   * When omitted, derived automatically from the sampler by measuring the 3D
   * chord length of a column at u=0.
   */
  tToMm?: number;

  /**
   * Minimum curvature (mm⁻¹) for the ridge detector.
   * When omitted, derived as RIDGE_KAPPA_FACTOR / Rchar where Rchar is the
   * characteristic radius estimated from the u-circumference measurement, making
   * the floor scale-invariant (fires on ridges sharper than the smooth pot wall).
   */
  kappaFloor?: number;
}

// ---------------------------------------------------------------------------
// Scale-measurement helpers
// ---------------------------------------------------------------------------

/**
 * Number of sample points used when measuring u-circumference and t-height.
 * 128 points is more than sufficient for any smooth parametric surface.
 */
const MEASURE_N = 128;

/**
 * Dimensionless scale factor for the curvature floor.
 *
 * kappaFloor = RIDGE_KAPPA_FACTOR / Rchar
 *
 * With Rchar = uCircumference / (2π), a factor of 2 means: fire on any ridge
 * whose curvature exceeds twice the smooth-wall hoop curvature (κ_hoop = 1/R).
 * This is conservative enough to suppress the pot body on large pots (R=200,
 * κ_hoop=0.005, floor=0.01) while still firing on shallow decorative ridges
 * on small pots (R=10, κ_hoop=0.1, floor=0.2 — well below typical 0.5+).
 */
const RIDGE_KAPPA_FACTOR = 2;

/**
 * Measure the 3D chord length of the u-ring at t=0.5.
 * Returns the total circumference in mm (u traverses one full period).
 */
function measureUCircumference(sampler: SurfaceSampler): number {
  let total = 0;
  const [px0, py0, pz0] = sampler.position(0, 0.5);
  let prevX = px0, prevY = py0, prevZ = pz0;
  for (let i = 1; i <= MEASURE_N; i++) {
    const u = i / MEASURE_N; // at i===MEASURE_N this wraps back to u=0 (periodic close)
    const [cx, cy, cz] = sampler.position(u % 1, 0.5);
    const dx = cx - prevX, dy = cy - prevY, dz = cz - prevZ;
    total += Math.sqrt(dx * dx + dy * dy + dz * dz);
    prevX = cx; prevY = cy; prevZ = cz;
  }
  return total;
}

/**
 * Measure the 3D chord length of the t-column at u=0.
 * Returns the total height in mm (t traverses [0,1]).
 */
function measureTHeight(sampler: SurfaceSampler): number {
  let total = 0;
  const [px0, py0, pz0] = sampler.position(0, 0);
  let prevX = px0, prevY = py0, prevZ = pz0;
  for (let i = 1; i <= MEASURE_N; i++) {
    const t = i / MEASURE_N;
    const [cx, cy, cz] = sampler.position(0, t);
    const dx = cx - prevX, dy = cy - prevY, dz = cz - prevZ;
    total += Math.sqrt(dx * dx + dy * dy + dz * dz);
    prevX = cx; prevY = cy; prevZ = cz;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Public result type
// ---------------------------------------------------------------------------

/** Return value of {@link detectFeatures} extended with diagnostic statistics. */
export interface DetectFeaturesResult extends FeatureGraph {
  /** Number of coarse grid cells that fired in the two-scale pass. */
  firedCellCount: number;
  /** Total number of coarse grid cells (coarseRes²). */
  totalCellCount: number;
}

/**
 * Detect all geometric features on a parametric surface and return them as a
 * topology-rich feature graph.
 *
 * @param sampler  The surface sampler (analytic or GPU-backed).
 * @param opts     Two-scale and detector options.
 */
export function detectFeatures(
  sampler: SurfaceSampler,
  opts: DetectFeaturesOptions,
): DetectFeaturesResult {
  const { coarseRes, fineRes, minStrength, minAngleDeg, reliefIndicator } = opts;

  // -------------------------------------------------------------------------
  // Derive scale constants from the sampler when not explicitly provided.
  // -------------------------------------------------------------------------

  const uCircumference = measureUCircumference(sampler);
  const tHeight = measureTHeight(sampler);

  // u/t → mm scale factors for the unifier weld step.
  const U_TO_MM = opts.uToMm ?? uCircumference;
  const T_TO_MM = opts.tToMm ?? tHeight;

  // Characteristic radius from the ring measurement, then scale-invariant floor.
  const Rchar = uCircumference / (2 * Math.PI);
  const KAPPA_FLOOR = opts.kappaFloor ?? (RIDGE_KAPPA_FACTOR / Rchar);

  // -------------------------------------------------------------------------
  // Step 1 - coarse-pass field sampling + ridge/crease detection
  // -------------------------------------------------------------------------

  const coarseFields = sampleFeatureFields(sampler, {
    resU: coarseRes,
    resT: coarseRes,
  });

  const coarseRidge = detectCurvatureRidge(coarseFields, {
    minStrength: KAPPA_FLOOR,
  });

  const coarseCrease = detectNormalDiscontinuity(coarseFields, { minAngleDeg });

  // -------------------------------------------------------------------------
  // Step 2 - identify fired sub-regions (ridge + crease only; boundary is global)
  // -------------------------------------------------------------------------

  const firedCells = new Set<string>();
  for (const det of [coarseRidge, coarseCrease]) {
    for (const seg of det.segs) {
      markCell(seg.a.u, seg.a.t, coarseRes, firedCells);
      markCell(seg.b.u, seg.b.t, coarseRes, firedCells);
    }
  }

  // -------------------------------------------------------------------------
  // Step 3 - fine pass: re-sample + re-detect ridge+crease inside fired cells
  // -------------------------------------------------------------------------

  const sortedCells = [...firedCells].sort();

  const finalRidgeSegs: RawSegment[] = [];
  const finalCreaseSegs: RawSegment[] = [];

  for (const cellKey of sortedCells) {
    const [ci, cj] = cellKey.split(':').map(Number);

    // Sub-region u/t bounds for this coarse cell.
    const uLo = ci / coarseRes;
    const uHi = (ci + 1) / coarseRes;
    const tLo = cj / (coarseRes - 1);
    const tHi = Math.min((cj + 1) / (coarseRes - 1), 1);

    // Build a sub-sampler for [uLo,uHi) x [tLo,tHi].
    const subSampler = makeSubSampler(sampler, uLo, uHi, tLo, tHi);

    // Sample the sub-region at fineRes x fineRes.
    const fineFields = sampleFeatureFields(subSampler, {
      resU: fineRes,
      resT: fineRes,
    });

    // Ridge detector on sub-region.
    const fineRidge = detectCurvatureRidge(fineFields, {
      minStrength: KAPPA_FLOOR,
    });
    const remappedRidge = remapSegs(fineRidge, uLo, uHi, tLo, tHi);
    for (const s of remappedRidge.segs) finalRidgeSegs.push(s);

    // Crease detector on sub-region.
    const fineCrease = detectNormalDiscontinuity(fineFields, { minAngleDeg });
    const remappedCrease = remapSegs(fineCrease, uLo, uHi, tLo, tHi);
    for (const s of remappedCrease.segs) finalCreaseSegs.push(s);
  }

  // -------------------------------------------------------------------------
  // Step 4 - component boundary: run GLOBALLY at fineRes (not per-sub-region)
  // The zero-contour is a global entity; restricting to a sub-region would miss
  // it when it falls exactly on a coarse cell boundary.
  // -------------------------------------------------------------------------

  let finalBoundarySegs: RawSegment[] = [];

  if (reliefIndicator) {
    const globalBoundary = detectComponentBoundary(reliefIndicator, {
      resU: fineRes,
      resT: fineRes,
      periodicU: true,
      kind: 'zero',
    });
    finalBoundarySegs = globalBoundary.segs;
  }

  // -------------------------------------------------------------------------
  // Step 5 - build the final RawSegments array for unifyToGraph
  // -------------------------------------------------------------------------

  const finalRaw: RawSegments[] = [];

  if (finalRidgeSegs.length > 0) {
    finalRaw.push({ segs: finalRidgeSegs, type: 'curvature-ridge', threshold: KAPPA_FLOOR });
  }
  if (finalCreaseSegs.length > 0) {
    finalRaw.push({ segs: finalCreaseSegs, type: 'normal-discontinuity', threshold: minAngleDeg });
  }
  if (finalBoundarySegs.length > 0) {
    finalRaw.push({ segs: finalBoundarySegs, type: 'component-boundary', threshold: 1 });
  }

  // -------------------------------------------------------------------------
  // Step 6 - unify into one topology-rich FeatureGraph
  // -------------------------------------------------------------------------

  const firedCellCount = firedCells.size;
  const totalCellCount = coarseRes * coarseRes;

  if (finalRaw.length === 0) {
    return { nodes: [], edges: [], firedCellCount, totalCellCount };
  }

  const graph = unifyToGraph(finalRaw, {
    weldTol: 1 / fineRes,
    minStrength,
    uToMm: U_TO_MM,
    tToMm: T_TO_MM,
  });

  return { ...graph, firedCellCount, totalCellCount };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Mark the coarse grid cell containing (u,t) as fired.
 * u is periodic; t is clamped to [0,1]; row clamped to [0, coarseRes-2].
 */
function markCell(u: number, t: number, coarseRes: number, fired: Set<string>): void {
  const uMod = ((u % 1) + 1) % 1;
  const ci = Math.min(Math.floor(uMod * coarseRes), coarseRes - 1);
  const cj = Math.min(Math.floor(t * (coarseRes - 1)), coarseRes - 2);
  fired.add(`${ci}:${cj}`);
}

/**
 * A SurfaceSampler that maps a sub-region [uLo,uHi) x [tLo,tHi]
 * to [0,1) x [0,1] by a linear remap, delegating to the parent sampler.
 */
function makeSubSampler(
  parent: SurfaceSampler,
  uLo: number,
  uHi: number,
  tLo: number,
  tHi: number,
) {
  const uRange = uHi - uLo;
  const tRange = tHi - tLo;
  return {
    position(u: number, t: number): readonly [number, number, number] {
      return parent.position(uLo + u * uRange, tLo + t * tRange);
    },
  };
}

/**
 * Remap segment (u,t) from sub-sampler space [0,1)x[0,1] back to global
 * parameter space [uLo,uHi) x [tLo,tHi].
 */
function remapSegs(
  raw: RawSegments,
  uLo: number,
  uHi: number,
  tLo: number,
  tHi: number,
): RawSegments {
  const uRange = uHi - uLo;
  const tRange = tHi - tLo;
  const segs: RawSegment[] = raw.segs.map((s) => ({
    a: { u: uLo + s.a.u * uRange, t: tLo + s.a.t * tRange },
    b: { u: uLo + s.b.u * uRange, t: tLo + s.b.t * tRange },
    strength: s.strength,
  }));
  return { segs, type: raw.type, threshold: raw.threshold };
}