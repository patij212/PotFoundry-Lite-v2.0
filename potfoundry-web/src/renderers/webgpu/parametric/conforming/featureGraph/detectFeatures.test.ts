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
 * E. TWO-SCALE: fine-pass ridge maxDev < coarse-pass maxDev when K=7 (non-aligned).
 * F. FLAT surface -> 0 ridge and 0 discontinuity edges.
 * G. Coarse-only sanity: still >=6 ridge edges.
 * H. minStrength gate drops all edges when threshold > max saliency.
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

  it('E: fired coarse cells are strictly fewer than all cells (fine pass is local not global)', () => {
    // A k=7 ripple has 14 ridges. Each ridge fires a narrow band of columns in
    // the 30×30 coarse grid. Even with column-edge spillover (each ridge can
    // touch 2-3 adjacent columns), ridge-only cells remain well under the total.
    // The invariant: firedCells < totalCells, i.e. the fine pass is NOT running
    // over every coarse cell (which would make it equivalent to a flat fine pass).
    // We assert < 80% to ensure at least 20% of cells are silent (unfired).
    const { firedCellCount, totalCellCount } = twoScaleResult;
    expect(firedCellCount).toBeLessThan(totalCellCount * 0.8);
    // And at least one cell must have fired (ridges were detected).
    expect(firedCellCount).toBeGreaterThan(0);
  });

  it('E: ridge chain count in two-scale run does not balloon vs coarse-only (no spurious detection)', () => {
    // The fine pass re-detects ridges at higher resolution WITHIN each fired
    // sub-region. Sub-region boundary clipping can legitimately split long chains
    // into shorter segments (one per sub-region they span), so the fine run may
    // yield more polyline edges than the coarse run. However, the count should
    // not balloon to many times the coarse count -- that would indicate the fine
    // pass is inventing new features rather than refining existing ones.
    // We assert fine ≤ 3× coarse as the principled upper bound: with fineRes=90
    // and coarseRes=30, a single coarse chain spanning all 30 cells can at most
    // be clipped into 30 sub-region pieces, but welding and chain-joining in the
    // unifier collapses most of those back. A 3× ratio implies severe fragmentation
    // that would not occur for a clean ridge surface.
    const coarseRidgeEdges = coarseResult.edges.filter((e) =>
      (e.types as string[]).includes('curvature-ridge'),
    ).length;
    const fineRidgeEdges = twoScaleResult.edges.filter((e) =>
      (e.types as string[]).includes('curvature-ridge'),
    ).length;
    expect(fineRidgeEdges).toBeGreaterThan(0);
    expect(fineRidgeEdges).toBeLessThanOrEqual(coarseRidgeEdges * 3);
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