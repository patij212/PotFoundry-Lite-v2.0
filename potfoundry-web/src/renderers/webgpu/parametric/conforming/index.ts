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
export { SyntheticCylinderSampler, GpuSurfaceSampler } from './SurfaceSampler';
export type { MetricTensor } from './SurfaceMetricTensor';
export { firstFundamentalForm, principalCurvatureMax } from './SurfaceMetricTensor';
export type { SizingOptions } from './MetricSizingField';
export { MetricSizingField } from './MetricSizingField';
export type { QuadLeaf, QuadSide } from './PeriodicBalancedQuadtree';
export { PeriodicBalancedQuadtree } from './PeriodicBalancedQuadtree';
export type { Efg, QuadtreeLike, QuadtreeMesh } from './QuadtreeTriangulator';
export {
  triangulateQuadtree,
  TRI_SOURCE,
  metricLen2,
  shapedTemplate,
  maxMinAngleTriangulation,
} from './QuadtreeTriangulator';
export type { CdtStats, CdtCellIncident, ConstrainedCellResult } from './ConstrainedCellTriangulator';
export type {
  ConformingOuterWallOptions,
  ConformingOuterWallResult,
} from './ConformingOuterWall';
export { buildConformingOuterWall } from './ConformingOuterWall';
export type {
  ConformingWallOptions,
  ConformingWallResult,
  WallBudgetTelemetry,
} from './ConformingWall';
export { buildConformingWall } from './ConformingWall';
export { annulusStrip, discFan } from './RingStrip';
export type {
  AssemblyDimensions,
  AssemblyWallOptions,
  SurfaceRange,
  WatertightAssemblyResult,
} from './WatertightAssembly';
export { assembleWatertight } from './WatertightAssembly';
export type {
  FeatureLinePoint,
  FeatureLineKind,
  FeatureLine,
  FeatureLineGraph,
  FeatureUTVertex,
  FeatureResolutionOptions,
  FeatureLineResolution,
  FeatureResolutionResult,
  CreaseWarpChoices,
} from './FeatureLineGraph';
export {
  extractAnalyticFeatures,
  measureFeatureResolution,
  buildCreaseRefineLines,
} from './FeatureLineGraph';
export type { UWarp, UWarpAnchor, CreaseGridChoice } from './CreaseUWarp';
export { buildCreaseUWarp, applyUWarp, chooseCreaseGrid } from './CreaseUWarp';
export type { TWarp, TWarpAnchor, CreaseTGridChoice } from './CreaseTWarp';
export { buildCreaseTWarp, applyTWarp, chooseCreaseTGrid } from './CreaseTWarp';
export type { HelixWarp, HelixGridChoice } from './CreaseHelixWarp';
export { chooseHelixGrid, applyHelixWarp } from './CreaseHelixWarp';
export type { WallWarps } from './PullbackMetric';
export { uWarpDerivative, tWarpDerivative, composedWallSampler } from './PullbackMetric';
export type { CellCeilingSummary } from './FShearDiagnostics';
export { classifyCellCeiling } from './FShearDiagnostics';
export type {
  DecimateConformingOptions,
  DecimateConformingResult,
  DecimationReport,
  DecimationAttempt,
  DecimationInputDefects,
} from './decimateConforming';
export { decimateConforming, isConformingDecimationAvailable } from './decimateConforming';
