/**
 * conforming/index.ts — Barrel re-exports for the conforming outer-wall mesher.
 *
 * The conforming mesher builds a watertight-by-construction, metric-correct,
 * periodic-seam-closed outer-wall mesh for feature-free surfaces. It works in
 * metric-warped (u,t) parameter space and depends only on an injected
 * {@link SurfaceSampler} so correctness is unit-testable without WebGPU.
 *
 * Pipeline: sampler → metric tensor → sizing field → periodic balanced
 * quadtree → transition-template triangulation → ConformingOuterWall.
 *
 * See docs/superpowers/plans/2026-06-07-conforming-mesher-foundation.md and
 * docs/superpowers/specs/2026-06-07-cad-grade-parametric-export-design.md.
 *
 * @module conforming
 */

export type { SurfaceSampler, Vec3 } from './SurfaceSampler';
export { SyntheticCylinderSampler } from './SurfaceSampler';
export type { MetricTensor } from './SurfaceMetricTensor';
export { firstFundamentalForm, principalCurvatureMax } from './SurfaceMetricTensor';
export type { SizingOptions } from './MetricSizingField';
export { MetricSizingField } from './MetricSizingField';
export type { QuadLeaf, QuadSide } from './PeriodicBalancedQuadtree';
export { PeriodicBalancedQuadtree } from './PeriodicBalancedQuadtree';
export type { QuadtreeLike, QuadtreeMesh } from './QuadtreeTriangulator';
export { triangulateQuadtree } from './QuadtreeTriangulator';
export type {
  ConformingOuterWallOptions,
  ConformingOuterWallResult,
} from './ConformingOuterWall';
export { buildConformingOuterWall } from './ConformingOuterWall';
