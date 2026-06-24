/**
 * detectFeatures.test.ts - TDD tests for the two-scale detectFeatures orchestrator.
 *
 * Synthetic surface combines three feature families:
 * 1. SMOOTH RIPPLE k=6 (curvature ridges in suite A-D)
 * 2. SHARP V-GROOVE in t (normal discontinuity)
 * 3. LABEL SPLIT via reliefIndicator (component boundary)
 *
 * Suite E uses k=7 (does not divide into coarseRes=30) so that ridge positions
 * are NOT at exact coarse-grid column boundaries -- making the two-scale
 * improvement measurable.
 *
 * Assertions:
 * A. >=6 ridge edges (curvature-ridge type).
 * B. >=1 normal-discontinuity edge.
 * C. >=1 component-boundary edge.
 * D. >=1 junction node or multi-type edge (features cross).
 * E. TWO-SCALE (k=7, non-aligned): fine-pass ridge maxDev < coarse-pass maxDev;
 *    the ripple is feature-DENSE (not the sparsity witness); and two-scale ridge
 *    chains stay CONTINUOUS (≈ coarse count, no fine-pass fragmentation).
 * F. FLAT surface -> 0 ridge and 0 discontinuity edges.
 * G. Coarse-only sanity: still >=6 ridge edges.
 * H. minStrength gate drops all edges when threshold > max saliency.
 * I. LOCALIZED-bump surface (sparsity witness): the two-scale pass re-samples only
 *    a small fraction (< 15%) of coarse cells — proving fine-pass re-sampling is
 *    local, which the feature-dense ripple cannot witness.
 *
 * @module conforming/featureGraph/detectFeatures.test
 */

import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from '../SurfaceSampler';
import type { SurfaceSampler } from '../SurfaceSampler';
import type { Vec3 } from '../SurfaceSampler';
import type { FeatureGraph } from './types';
import { detectFeatures } from './detectFeatures';
import type { DetectFeaturesResult } from './detectFeatures';
import { sampleFeatureFields } from './sampleFields';
import { detectCurvatureRidge } from './curvatureRidge';

// ---------------------------------------------------------------------------
// Synthetic samplers
// ---------------------------------------------------------------------------

const R0 = 40;
const H = 120;
const AMP_RIPPLE = 5;
const K = 6;    // k for suites A-D, G (6 crests + 6 valleys = 12 extrema)
const K7 = 7;   // k for suite E (7 does not divide 30, so ridges are NOT grid-aligned)
const DEPTH_V = 12; // V-groove depth at t-crease

/**
 * Combined surface: ripple (ridges) + V-groove in t (discontinuity).
 *   r(u,t) = R0 + ampR*cos(2pi*k*u) + depthV*|t - 0.5|
 */
class CombinedFeatureSampler implements SurfaceSampler {
  constructor(
    private readonly R0: number,
    private readonly H: number,
    private readonly ampR: number,
    private readonly k: number,
    private readonly depthV: number,
  ) {}

  position(u: number, t: number): Vec3 {
    const theta = 2 * Math.PI * u;
    const r =
      this.R0 +
      this.ampR * Math.cos(2 * Math.PI * this.k * u) +
      this.depthV * Math.abs(t - 0.5);
    return [r * Math.cos(theta), r * Math.sin(theta), t * this.H];
  }
}

/** A plain cylinder -- no ridges, no creases. */
class FlatCylinderSampler implements SurfaceSampler {
  constructor(
    private readonly R0: number,
    private readonly H: number,
  ) {}

  position(u: number, t: number): Vec3 {
    const theta = 2 * Math.PI * u;
    return [this.R0 * Math.cos(theta), this.R0 * Math.sin(theta), t * this.H];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count edges that carry the given feature type (possibly among multiple types). */
function edgesOfType(graph: FeatureGraph, type: string): number {
  return graph.edges.filter((e) => (e.types as string[]).includes(type)).length;
}

/**
 * For all ridge edges, compute the max distance of each polyline segment
 * midpoint to the nearest analytic extremum u = m / (2*k).
 * A cosine ripple r(u) = R0 + amp*cos(2pi*k*u) has extrema (crests AND valleys)
 * at u = m/(2k) for m=0..2k-1. The ridge detector fires at ALL extrema.
 * Returns -Infinity if no ridge edges or no polyline segments exist.
 */
function ridgeMaxDevToAnalyticLocus(graph: FeatureGraph, k: number): number {
  const nExtrema = 2 * k;
  const ridgeEdges = graph.edges.filter((e) =>
    (e.types as string[]).includes('curvature-ridge'),
  );
  if (ridgeEdges.length === 0) return -Infinity;

  let maxDev = 0;
  for (const edge of ridgeEdges) {
    const poly = edge.polyline;
    for (let i = 0; i + 1 < poly.length; i++) {
      const midU = (poly[i].u + poly[i + 1].u) / 2;
      let minDist = Infinity;
      for (let m = 0; m < nExtrema; m++) {
        const eu = m / nExtrema;
        const d = Math.min(Math.abs(midU - eu), 1 - Math.abs(midU - eu));
        if (d < minDist) minDist = d;
      }
      if (minDist > maxDev) maxDev = minDist;
    }
  }
  return maxDev;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COARSE_RES = 30;
const FINE_RES = 90;
const MIN_STRENGTH = 1.0;
const MIN_ANGLE_DEG = 5;

// Label-split reliefIndicator: negative west of u=0.5, positive east.
// marchingSquaresZero traces the zero-contour => component boundary at u~0.5.
function labelReliefIndicator(u: number, _t: number): number {
  return u < 0.5 ? -1 : 1;
}

// ---------------------------------------------------------------------------
// Suite A-D: Combined feature surface (k=6)
// ---------------------------------------------------------------------------

describe('detectFeatures -- combined ripple+groove+split surface', () => {
  const sampler = new CombinedFeatureSampler(R0, H, AMP_RIPPLE, K, DEPTH_V);

  const graph = detectFeatures(sampler, {
    coarseRes: COARSE_RES,
    fineRes: FINE_RES,
    minStrength: MIN_STRENGTH,
    minAngleDeg: MIN_ANGLE_DEG,
    reliefIndicator: labelReliefIndicator,
  });

  it('A: graph contains >=6 curvature-ridge edges', () => {
    expect(edgesOfType(graph, 'curvature-ridge')).toBeGreaterThanOrEqual(6);
  });

  it('B: graph contains >=1 normal-discontinuity edge', () => {
    expect(edgesOfType(graph, 'normal-discontinuity')).toBeGreaterThanOrEqual(1);
  });

  it('C: graph contains >=1 component-boundary edge (from reliefIndicator)', () => {
    expect(edgesOfType(graph, 'component-boundary')).toBeGreaterThanOrEqual(1);
  });

  it('D: graph has >=1 junction node or multi-type edge (features cross or coincide)', () => {
    const multiTypeEdges = graph.edges.filter((e) => e.types.length > 1);

    const nodeToTypes = new Map<number, Set<string>>();
    for (const edge of graph.edges) {
      for (const type of edge.types) {
        for (const ep of edge.endpoints) {
          let s = nodeToTypes.get(ep);
          if (!s) { s = new Set(); nodeToTypes.set(ep, s); }
          s.add(type as string);
        }
      }
    }
    const junctionNodes = [...nodeToTypes.values()].filter((s) => s.size > 1);

    expect(multiTypeEdges.length + junctionNodes.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Suite E: Two-scale property (k=7, NOT grid-aligned)
//
// Using k=7 so that extrema at u = m/14 for m=0..13 do NOT align with any
// coarse-grid column (coarseRes=30 -> cols at m/30; gcd(14,30)=2 -> 7 out of
// 14 extrema are NOT on a grid column). The coarse pass therefore places ridge
// midpoints up to ~0.5/30 ~ 0.017 away from the nearest extremum, while the
// fine pass (fineRes=90, sub-cell width = 1/2700) places them within ~0.5/2700.
// ---------------------------------------------------------------------------

describe('detectFeatures -- two-scale ridge placement (E, k=7)', () => {
  const rippleSampler = new SyntheticCylinderSampler(R0, H, AMP_RIPPLE, K7);

  // Coarse-only: fineRes === coarseRes => no sub-cell improvement.
  const coarseResult: DetectFeaturesResult = detectFeatures(rippleSampler, {
    coarseRes: COARSE_RES,
    fineRes: COARSE_RES,
    minStrength: MIN_STRENGTH,
    minAngleDeg: MIN_ANGLE_DEG,
  });

  // Two-scale: fineRes = 90 > coarseRes = 30 => sub-regions sampled at 90 cols.
  const twoScaleResult: DetectFeaturesResult = detectFeatures(rippleSampler, {
    coarseRes: COARSE_RES,
    fineRes: FINE_RES,
    minStrength: MIN_STRENGTH,
    minAngleDeg: MIN_ANGLE_DEG,
  });

  const coarseMaxDev = ridgeMaxDevToAnalyticLocus(coarseResult, K7);
  const fineMaxDev = ridgeMaxDevToAnalyticLocus(twoScaleResult, K7);

  it('E: both passes detected ridges (precondition)', () => {
    expect(coarseMaxDev).toBeGreaterThan(0);
    expect(fineMaxDev).toBeGreaterThan(0);
  });

  it('E: fine-pass maxDev < coarse-pass maxDev (sub-cell accuracy improves placement)', () => {
    // With k=7 and coarseRes=30: coarse quantizes ridges to 1/30-wide cells,
    // giving maxDev ~ 1/60 ~ 0.0167. The fine pass re-samples at 1/90-wide
    // sub-columns inside those cells, giving maxDev ~ 1/180 ~ 0.0056.
    expect(fineMaxDev).toBeLessThan(coarseMaxDev);
  });

  it('E: the k=7 ripple is feature-DENSE (it is NOT the sparsity witness)', () => {
    // The k=7 ripple fires curvature features almost everywhere across u (a
    // global ridge field), so the fired-cell fraction is LARGE — this surface
    // proves the fine-pass placement improvement (maxDev) and the chain
    // continuity, NOT sparse re-sampling. Sparsity is witnessed separately on a
    // localized-bump surface (see the dedicated suite below), where the fired
    // fraction is genuinely small. Here we only assert "ridges fired" — the
    // 80%-cap that USED to live here proved nothing on a feature-dense surface.
    const { firedCellCount, totalCellCount } = twoScaleResult;
    expect(firedCellCount).toBeGreaterThan(0);
    expect(firedCellCount).toBeLessThanOrEqual(totalCellCount);
  });

  it('E: two-scale ridge chains stay CONTINUOUS (≈ coarse count, no fragmentation)', () => {
    // ROOT-CAUSE REGRESSION GUARD. Each k=7 ripple ridge is a single continuous
    // vertical line spanning the full t-range. The defective per-cell fine pass
    // re-sampled each fired coarse cell independently, so each sub-grid had its
    // own sample offset and the shared cell boundary was NOT a shared sample
    // point. Adjacent sub-region segment endpoints landed ~1/fineRes apart in t
    // — at/over the unifier's weldTol (=1/fineRes) — so the seam did NOT weld and
    // each ridge arrived as ~3 broken fragments (count ballooned ~32 → ~57).
    //
    // The connected-component fine pass re-samples each contiguous fired region
    // as ONE sub-grid, so a full-height ridge column is re-detected as a single
    // continuous polyline with no internal seam. The two-scale chain count must
    // therefore stay ≈ the coarse count (here both are 14 = 7 crests + 7 valleys).
    // We assert ≤ 1.5× coarse: a regression that re-fragments (≈4× here) FAILS.
    const coarseRidgeEdges = coarseResult.edges.filter((e) =>
      (e.types as string[]).includes('curvature-ridge'),
    ).length;
    const fineRidgeEdges = twoScaleResult.edges.filter((e) =>
      (e.types as string[]).includes('curvature-ridge'),
    ).length;
    expect(coarseRidgeEdges).toBeGreaterThan(0);
    expect(fineRidgeEdges).toBeGreaterThan(0);
    expect(fineRidgeEdges).toBeLessThanOrEqual(coarseRidgeEdges * 1.5);
  });
});

// ---------------------------------------------------------------------------
// Suite I: Sparsity witness — a LOCALIZED feature surface
//
// Unlike the global k=7 ripple (which fires nearly everywhere), this surface has
// a SINGLE Gaussian bump covering ~10% of the u-range on an otherwise smooth
// cylinder wall. The two-scale pass must re-sample ONLY the cells the bump fires
// — a genuinely small fraction of the coarse grid — proving the fine pass is
// local (re-samples where features are), not a disguised global resample.
// ---------------------------------------------------------------------------

/**
 * Smooth cylinder with ONE localized radial Gaussian bump centred at u=0.5,
 * with σ_u ≈ 0.02 so the bump occupies roughly |u−0.5| < ~0.05 (≈10% of u).
 * Everywhere else the surface is the bare cylinder (no curvature feature).
 */
class LocalizedBumpSampler implements SurfaceSampler {
  constructor(
    private readonly R0: number,
    private readonly H: number,
    private readonly ampBump: number,
    private readonly uCenter: number,
    private readonly sigmaU: number,
  ) {}

  position(u: number, t: number): Vec3 {
    const theta = 2 * Math.PI * u;
    // Periodic distance from the bump centre.
    let du = Math.abs(u - this.uCenter) % 1;
    if (du > 0.5) du = 1 - du;
    const bump = this.ampBump * Math.exp(-(du * du) / (2 * this.sigmaU * this.sigmaU));
    const r = this.R0 + bump;
    return [r * Math.cos(theta), r * Math.sin(theta), t * this.H];
  }
}

describe('detectFeatures -- localized bump => sparse re-sampling (I, sparsity witness)', () => {
  const bumpSampler = new LocalizedBumpSampler(R0, H, AMP_RIPPLE, 0.5, 0.02);

  // minAngleDeg=30 is set ABOVE the smooth cylinder's per-column hoop rotation
  // (360°/COARSE_RES = 12° at res 30) so the bare wall does NOT fire the crease
  // detector. The ONLY feature is then the bump's curvature ridge, making the
  // fired-cell count a faithful measure of how localized the re-sampling is.
  const result: DetectFeaturesResult = detectFeatures(bumpSampler, {
    coarseRes: COARSE_RES,
    fineRes: FINE_RES,
    minStrength: MIN_STRENGTH,
    minAngleDeg: 30,
  });

  it('I: a feature WAS detected (precondition — the bump fires a ridge)', () => {
    expect(edgesOfType(result, 'curvature-ridge')).toBeGreaterThanOrEqual(1);
  });

  it('I: fired coarse cells are a genuinely SMALL fraction (< 15% of all cells)', () => {
    // The bump occupies ~10% of u and the full t-range, so only a narrow band of
    // columns fires (measured 28/900 = 3.1%). A truly localized feature must keep
    // the fired fraction well below the whole grid — this is the assertion the
    // global-ripple test could NOT make (it fires ~68% by design). If the fine
    // pass ever degenerated into a global resample, this fraction would approach
    // 100% and the test would fail.
    const { firedCellCount, totalCellCount } = result;
    expect(firedCellCount).toBeGreaterThan(0);
    expect(firedCellCount).toBeLessThan(totalCellCount * 0.15);
  });
});

// ---------------------------------------------------------------------------
// Suite F: Flat surface => empty graph
// ---------------------------------------------------------------------------

describe('detectFeatures -- flat cylinder (no features) (F)', () => {
  const sampler = new FlatCylinderSampler(R0, H);

  const graph = detectFeatures(sampler, {
    coarseRes: COARSE_RES,
    fineRes: FINE_RES,
    minStrength: MIN_STRENGTH,
    minAngleDeg: 15, // >> smooth-surface hoop rotation (~3 deg)
  });

  it('F: flat surface => 0 curvature-ridge edges', () => {
    expect(edgesOfType(graph, 'curvature-ridge')).toBe(0);
  });

  it('F: flat surface => 0 normal-discontinuity edges', () => {
    expect(edgesOfType(graph, 'normal-discontinuity')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite G: Coarse-only sanity
// ---------------------------------------------------------------------------

describe('detectFeatures -- coarse-only (fineRes=coarseRes) sanity (G)', () => {
  const rippleSampler = new SyntheticCylinderSampler(R0, H, AMP_RIPPLE, K);

  const graph = detectFeatures(rippleSampler, {
    coarseRes: COARSE_RES,
    fineRes: COARSE_RES,
    minStrength: MIN_STRENGTH,
    minAngleDeg: MIN_ANGLE_DEG,
  });

  it('G: coarse-only pass detects >=6 ridge edges at COARSE_RES=30', () => {
    expect(edgesOfType(graph, 'curvature-ridge')).toBeGreaterThanOrEqual(6);
  });
});

// ---------------------------------------------------------------------------
// Suite H: minStrength gate drops everything when threshold > max saliency
// ---------------------------------------------------------------------------

describe('detectFeatures -- minStrength gate drops all edges (H)', () => {
  const rippleSampler = new SyntheticCylinderSampler(R0, H, AMP_RIPPLE, K);

  const coarseFields = sampleFeatureFields(rippleSampler, {
    resU: COARSE_RES,
    resT: COARSE_RES,
  });
  const ridgeResult = detectCurvatureRidge(coarseFields, { minStrength: 0.05 });
  const maxKappa = ridgeResult.segs.reduce((mx, s) => Math.max(mx, s.strength), 0);
  const maxSaliency = maxKappa / 0.05;

  const graph = detectFeatures(rippleSampler, {
    coarseRes: COARSE_RES,
    fineRes: FINE_RES,
    minStrength: maxSaliency * 10,
    minAngleDeg: MIN_ANGLE_DEG,
  });

  it('H: minStrength gate drops all edges when set above max saliency', () => {
    expect(graph.edges.length).toBe(0);
  });
});