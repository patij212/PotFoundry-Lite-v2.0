/**
 * Dev/test-gated window hook for the SP0 fidelity harness. Registered from
 * StatusFooter behind import.meta.env.DEV (or ?fidelity=1). NEVER ships active
 * in production. Contains no pipeline logic: it drives the existing
 * generateMesh, reads pipeline chain-debug accounting, and runs pure metrics
 * in-page so only ~12 numbers cross the CDP bridge.
 */
import type { MeshData } from '../geometry/types';
import { STYLE_REGISTRY } from '../styles/registry';
import {
  getLastChainDebugData,
  getLastConformingAssemblyUT,
  getLastConformingBudgetReport,
  getLastConformingCdtStats,
  getLastConformingDecimationReport,
  getLastConformingFeatureResult,
  getLastConformingHelixWarp,
  getLastConformingOuterGrid,
  getLastConformingOuterReferenceGrid,
  getLastConformingOuterWallMask,
  getLastConformingTriangleSource,
} from '../renderers/webgpu/ParametricExportComputer';
import type { ExportBudgetReport } from '../renderers/webgpu/parametric/types';
import type { DecimationAttempt } from '../renderers/webgpu/parametric/conforming';
import { applyHelixWarp, type FeatureResolutionResult } from '../renderers/webgpu/parametric/conforming';
import type { CdtCellIncident } from '../renderers/webgpu/parametric/conforming/ConstrainedCellTriangulator';
import { GpuSurfaceSampler } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { BicubicSurfaceSampler } from '../renderers/webgpu/parametric/conforming/BicubicSurfaceSampler';
import {
  classifyCellCeiling,
  classifySurfaceShear,
  type CellCeilingSummary,
  type ShearSummary,
} from '../renderers/webgpu/parametric/conforming/FShearDiagnostics';
import {
  computeFidelityMetrics,
  crestBandTriangleQuality,
  extractOuterWallSubmesh,
  meshHash,
  sampleTrueRadius,
  seamBandTriangleQuality,
  topologyDiagnostics,
  topologyMetric,
  triangleQuality3D,
  triangleQualityDiagnostics,
  triangleQualityDistribution,
  triMinAngleAndAspect,
  wallChordError,
  wallDeviation,
  type CrestBandQualityResult,
  type SeamBandQualityResult,
  type TopologyDiagnostics,
  type TriangleQualityDiagnostics,
  type TriangleQualityDistribution,
  type WallChordResult,
  type WallDeviationResult,
} from './metrics';
import {
  crestLateralDeviation,
  ridgeFromParamBranches,
  sfClosedFormParamRidge,
  solveParamRidgeByBisection,
  type CrestLateralDeviationResult,
  type ParamRidge,
} from './crestLateralDeviation';
import { buildStyleParamPayload } from '../utils/styleParams';
import { getStyleFunction } from '../geometry/styles';
import { baseRadius } from '../geometry/profile';
import { sfRf } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import {
  radialAnalyticDeviation,
  artDecoRiserTBands,
  type AnalyticRadiusFn,
  type AnalyticDevResult,
} from './analyticSurfaceGate';
import { TAU } from '../geometry/types';
import type { StyleId, StyleOptions } from '../geometry/types';
import { ASPECT_MAX, WELD_TOL_MM, type FidelityMetrics } from './types';

/**
 * Reference-parity epsilon (mm) for the B5 surface-fidelity gate. Production
 * GPU-evaluates every outer-wall vertex EXACTLY at its (u,t), so a faithful CPU
 * reference reads vertexMax ≈ the f32 floor (measured ≤ 0.0011mm on the 11
 * parity-clean styles). The drifted styles read ≥ 0.67mm (Gyroid/Basket/Hex land
 * EXACTLY on their full relief default). This threshold sits in that gap, so it
 * cleanly separates a trustworthy reference from a `styles.ts`↔WGSL parity gap.
 */
export const REFERENCE_PARITY_EPS_MM = 0.05;

export interface FidelityMeasureOptions {
  targetTriangles: number;
  referenceTriangles: number;
  sagSampleOrder?: number;
  sagTriangleSampleLimit?: number;
  qualityTriangleSampleLimit?: number;
  nearestReferenceTriangleSampleLimit?: number;
}

export interface FidelityTopologyDiagnosticOptions {
  targetTriangles?: number;
  weldToleranceMm?: number;
  sampleLimit?: number;
}

export interface FidelityQualityDiagnosticOptions {
  targetTriangles?: number;
  sampleLimit?: number;
  triangleStart?: number;
  triangleEnd?: number;
}

export interface FidelityTopologyDiagnostics extends TopologyDiagnostics {
  styleId: string;
}

export interface FidelityQualityDiagnostics extends TriangleQualityDiagnostics {
  styleId: string;
}

export interface FidelityTopoQualitySummary {
  styleId: string;
  orientationMismatches: number;
  boundaryEdges: number;
  nonManifoldEdges: number;
  sliverCount: number;
  maxAspect3D: number;
  minAngleDeg: number;
  triangleCount: number;
}

export interface FidelityTriangleQualitySummary extends TriangleQualityDistribution {
  styleId: string;
}

export interface FidelityHookDeps {
  setStyle: (name: string) => void;
  /** Patch the store's geometry params (H, top_od, bottom_od, r_drain, expn, …). */
  setDimensions: (params: Record<string, number>) => void;
  /** Patch the store's STYLE opts (sf_strength, sf_n1, …) for fidelity sweeps. */
  setStyleParams: (params: Record<string, number>) => void;
  /** Parametric pipeline (the path under test) is ready for the current style. */
  isAvailable: () => boolean;
  /** GPU uniform-grid pipeline (the dense reference source) is ready. */
  isReferenceAvailable: () => boolean;
  /** Generate the under-test mesh via the parametric pipeline at a triangle budget. */
  generateMesh: (targetTriangles?: number) => Promise<MeshData | null>;
  /**
   * Generate the dense R_true reference via the fast GPU uniform grid. The grid
   * resolution is driven by the store's export_n_theta/export_n_z, which the
   * mount sets to a dense value under ?fidelity. The parametric pipeline is far
   * too CPU-bound to build a dense reference across all ~20 styles.
   */
  generateReference: () => Promise<MeshData | null>;
  /**
   * Live style + geometry state for analytic true-ridge construction
   * (diagnoseCrestLateralDeviation): the current style's raw opts (snake_case
   * registry keys, packed via buildStyleParamPayload exactly like production)
   * plus pot height, a representative base radius for the f64 CPU radius
   * mirror, and the production spin/twist params (spinTurns/spinPhaseDeg/
   * spinCurveExp — useExport.buildStyleOptions injects these into the style
   * functions, so the diagnostic must REFUSE to measure when they are
   * non-zero rather than emit confident wrong numbers). Optional, and may
   * return null when the state is unavailable — the diagnostic then returns
   * null per its contract. NEVER substitute a fabricated default state (an
   * all-zeros "pot" reads as a perfect result, inverting the null contract).
   */
  getStyleState?: () => {
    opts: Record<string, number>;
    H: number;
    r0: number;
    spinTurns: number;
    spinPhaseDeg: number;
    spinCurveExp: number;
    /** Per-t base-profile inputs for the B5 absolute surface-fidelity gate
     *  (diagnoseSurfaceFidelity). r0(t)=baseRadius(t·H,H,Rb,Rt,expn,bell): the
     *  scalar `r0` mean reads a cylinder on a tapered pot, so the gate needs the
     *  taper (Rt/Rb/expn) and the multiplicative bell to reconstruct the EXPORT's
     *  true outer base radius. Optional so older mounts still satisfy the type;
     *  diagnoseSurfaceFidelity returns null when they are absent. */
    Rt?: number;
    Rb?: number;
    expn?: number;
    bellAmp?: number;
    bellCenter?: number;
    bellWidth?: number;
  } | null;
}

export interface PfFidelityApi {
  listStyles(): string[];
  isReady(): boolean;
  setStyle(styleId: string): Promise<void>;
  /**
   * Patch the pot geometry params (for dimension-space robustness sweeps), then
   * settle so the next generate reads them. The style/pipeline is unchanged, so
   * no GPU rebuild — the conforming branch rebuilds its uniform + sampler buffers
   * from the current store on each generate.
   */
  setDimensions(params: Record<string, number>): Promise<void>;
  /**
   * Patch the current style's opts (e.g. `{ sf_strength: 1 }`) for fidelity
   * sweeps over style strength, then settle. No GPU rebuild (opts are read at
   * generate time); call AFTER setStyle (which resets opts to defaults).
   */
  setStyleParams(params: Record<string, number>): Promise<void>;
  measure(opts: FidelityMeasureOptions): Promise<FidelityMetrics>;
  diagnoseTopology(opts?: FidelityTopologyDiagnosticOptions): Promise<FidelityTopologyDiagnostics>;
  diagnoseQuality(opts?: FidelityQualityDiagnosticOptions): Promise<FidelityQualityDiagnostics>;
  /** Fast combined check: generates the mesh ONCE, returns topology + quality summary. */
  diagnoseTopoQuality(opts?: FidelityTopologyDiagnosticOptions): Promise<FidelityTopoQualitySummary>;
  /**
   * Generate the conforming mesh once, then return the min-angle DISTRIBUTION
   * (the triangle-quality instrument the aspect>ASPECT_MAX sliver gate lacks):
   * percent of triangles below 10/20/30°, plus p5/median/min. Drives the
   * clean-CAD triangle-quality work (the ≥20° bar).
   */
  diagnoseTriangleQuality(opts?: FidelityTopologyDiagnosticOptions): Promise<FidelityTriangleQualitySummary>;
  /**
   * Generate the conforming mesh once, then return the per-feature-line
   * resolution breakdown (label, kind, coverage, resolved). Null on the
   * legacy/parametric path (no analytic feature accounting there).
   */
  diagnoseFeatures(opts?: FidelityFeatureDiagnosticOptions): Promise<FidelityFeatureDiagnostics | null>;
  /**
   * Generate the conforming mesh once, then classify the sliver MECHANISM on the
   * REAL outer-wall surface (anisotropy vs area-collapse shear — see
   * conforming/FShearDiagnostics). Null on the legacy/parametric path (no
   * conforming sampler stash). Drives the GAP-1 fix-direction decision.
   */
  diagnoseFShear(opts?: FidelityFShearDiagnosticOptions): Promise<FidelityFShearDiagnostics | null>;
  /**
   * STAGE 0 — the F-inclusive, WARP-COMPOSED per-cell corner-angle CEILING map.
   * A quadtree cell sheared (in the surface metric) to a parallelogram with
   * acute corner θ admits NO triangulation with min angle > θ — interior Steiner
   * points and diagonal choice share this analytic cap (cosθ = |F|/√(EG)). The
   * relevant metric is the one the EMITTED cells live in: the helix shear
   * (SpiralRidges) is applied to (u,t) AFTER triangulation, so the stashed warp
   * is composed with the outer sampler, (u,t) ↦ P(applyHelixWarp(warp,u,t), t).
   * Decides the spec's Stage 5 (no-op / lattice alignment / certified floor).
   * Null on the legacy/parametric path (no conforming sampler stash).
   */
  diagnoseCellCeiling(opts?: FidelityCellCeilingDiagnosticOptions): Promise<FidelityCellCeilingDiagnostics | null>;
  /**
   * Faithful CAD-fidelity: the WALL-restricted radial deviation of the export
   * mesh from the dense true surface (max/p99/rms mm). Unlike `measure`'s mixed
   * sag (drowned by the drain/cap artifact), this isolates the model-truth signal
   * — ≈ the sag floor for a plain pot, rising sharply with ridge serration.
   */
  diagnoseWallFidelity(opts?: FidelityWallDiagnosticOptions): Promise<FidelityWallDiagnostics>;
  /**
   * B5 — the ABSOLUTE surface-fidelity gate. Measures the REAL exported 3D mesh
   * (x,y,z) against the TRUE ANALYTIC surface with NO GPU-grid reference (which
   * is band-limited + bin-quantized + GPU-vs-GPU). For the RADIAL outer wall
   * (surfaceId 0) it maps each 3D point back exactly (twist=0) — theta=atan2(y,x),
   * z direct, t=z/H, r0(t)=baseRadius(...) — and reports the radial deviation
   * |hypot(x,y) − rAnalytic(theta,z)| in two channels: a VERTEX channel (exact
   * placement, the "mesh lies on the true surface" number) and a CHORD channel
   * (dense flat-triangle samples, what a slicer sees). The truth is CONFIG-AWARE:
   * SFB via the packed sfRf + sf_strength mix (the BLOCKING-2 fix — at the default
   * sf_strength=0 the export is smooth and the gate reads ≈ 0, not full petals);
   * every other style via STYLE_FUNCTIONS with snake+camel opts and the tapered
   * r0(t) (NOT the scalar-mean cylinder). The u-seam cliff and ArtDeco riser
   * t-bands are EXCLUDED (accepted feature faces, tracked separately, never
   * failed). Null on the legacy/parametric path (no assembly-UT stash); when the
   * mount provided no style-state getter or it lacks Rt/Rb/expn (absence is
   * forwarded HONESTLY); when the pot height is non-finite or ≤ 0; when spin/twist
   * is active (spinTurns ≠ 0 or spinPhaseDeg ≠ 0 — atan2 recovers the TWISTED
   * azimuth, not the style theta, so a spun pot is refused rather than measured
   * wrong); or when a downstream pass broke the assembly-UT↔mesh parallelism.
   * This is an in-memory (GPU-f32) metric — the round-tripped binary-STL re-welds
   * and f32-quantizes, so it is necessary-but-not-sufficient for the shipped bytes.
   */
  diagnoseSurfaceFidelity(opts?: FidelitySurfaceFidelityDiagnosticOptions): Promise<FidelitySurfaceFidelityDiagnostics | null>;
  /**
   * STAGE 0 — the faithful crest-band serration metric. Restricts to the OUTER
   * wall (via the stashed surfaceId mask) and measures its RADIAL deviation from
   * the conforming OUTER sampler (the surface the mesher itself sees), inside the
   * crest band where serration concentrates. Reads ~0 on a plain pot and rises
   * monotonically with ridge serration; headline `serrationScore =
   * crestBandRmsMm / 0.1mm` (<1 within CAD tolerance, ≥1 serrated). Null on the
   * legacy/parametric path (no conforming outer-wall stash).
   */
  diagnoseSerration(opts?: FidelitySerrationDiagnosticOptions): Promise<FidelitySerrationDiagnostics | null>;
  /**
   * STAGE 0 — the faithful REFERENCE-FREE crest-band triangle-quality gate. Unlike
   * `diagnoseSerration` (chord error vs a sampler reference, which was
   * reference-dominated at sharp cusps), this measures the 3D MIN INTERIOR ANGLE of
   * each OUTER-wall triangle — a pure function of the GPU-evaluated vertices, so the
   * reference cannot fool it — and reports the sub-15° fraction WITHIN the crest band
   * (the diagonal/helical-crest sliver field), separated from the clean bulk. Reads
   * ~0 on a plain pot and lights up along a ridge crest; the headline gate for the
   * crest fix. The result surfaces the ABSOLUTE counts (`belowCount`,
   * `bandBelowCount`) and worst-case angles (`worstMinAngleDeg`,
   * `bandWorstMinAngleDeg`) alongside the percents: percent dilutes as density
   * rises, so gates use absolute counts + worst-case (QW4). Null on the
   * legacy/parametric path (no conforming outer-wall stash).
   */
  diagnoseCrestQuality(opts?: FidelityCrestQualityDiagnosticOptions): Promise<FidelityCrestQualityDiagnostics | null>;
  /**
   * STAGE 2a — the FAITHFUL crest lateral-deviation instrument (blueprint
   * faithfulMetricSpec 1–3): serration amplitude in MILLIMETERS versus the
   * ANALYTIC ridge, density-independent by construction. Unlike
   * `diagnoseCrestQuality` (triangle SHAPE) this slices the OUTER-wall submesh
   * by z-planes and measures the mesh crest apex's lateral offset
   * d = r·wrapPi(θ_mesh − θ_true)/√(1+(r·dθ_true/dz)²) from the analytic ridge:
   * SuperformulaBlossom uses the CLOSED-FORM loci u*(t) = (2j−1)/(2m(t))
   * (seam-aware, refErrBound ≈ 0); every other style takes the generic path —
   * bisection roots of ∂r/∂u = 0 on the f64 CPU radius mirror
   * (geometry/styles.ts) chained by continuation, with fold-point births
   * solved exactly. Every number carries `refErrBoundMm` (root tolerance +
   * polyline interpolation + sampler-grid chord bound) — an amplitude without
   * its reference-error bound is meaningless. Reported per crest as MAX and
   * RMS (absolute mm, worst-case; crests and valleys separate channels; NO
   * percent anywhere), plus slice/sample counts for coverage gating. Honors
   * the `__pfReferenceDenseRes`/`__pfReferenceBicubic` reference levers (same
   * selection as diagnoseSerration). Null on the legacy/parametric path (no
   * conforming outer-wall stash); when the mount provided no style-state
   * getter or it returned null (absence is forwarded HONESTLY — never a
   * fabricated all-zeros state); when the pot height is non-finite or ≤ 0;
   * or when spin/twist is active (spinTurns ≠ 0 or spinPhaseDeg ≠ 0) — the
   * analytic ridge is solved spin-free (the f64 mirror omits the
   * spinTurns/spinPhaseDeg/spinCurveExp composition production
   * buildStyleOptions injects), so a spun pot would yield confident WRONG
   * numbers and is refused instead. NaN/Inf mesh vertices never silently
   * understate: rejected slice points are counted in `nonFiniteCount`
   * (any nonzero value ⇒ do not gate on the result). Run at high AND ultra:
   * a staircase HALVES when density doubles, a true crest defect does not —
   * the density-independence discriminator.
   */
  diagnoseCrestLateralDeviation(opts?: FidelityCrestLateralDiagnosticOptions): Promise<FidelityCrestLateralDiagnostics | null>;
  /**
   * STAGE 0 — the constrained-CDT masking-channel readout. The per-cell CDT
   * normalization silently FLIPPED inverted triangles (masking constraint
   * fold-overs — the suspected non-manifold mechanism) and DROPPED zero-(u,t)-area
   * triangles ((u,t)-collinear ≠ 3D-collinear ⇒ potential hole); both channels are
   * now counted per build. Generates the mesh once, then reports the totals and
   * the incident cells (with replay dumps under `__pfConformingCellDumps`). Null
   * on the legacy/parametric path and on feature-free conforming builds (no CDT
   * cells). Counting only — the mesh itself is byte-identical.
   */
  diagnoseCdtHealth(opts?: FidelityCdtHealthDiagnosticOptions): Promise<FidelityCdtHealthDiagnostics | null>;
  /**
   * STAGE 0 — per-triangle sliver ATTRIBUTION over the emission-provenance
   * channel. The conforming mesher tags every triangle with the template class
   * that emitted it (TRI_SOURCE: plain-quad split / transition fan / ear-clip /
   * FCT plain / FCT fan / feature-cell CDT / ring-or-cap / FCT ear-clip); this
   * generates the
   * mesh once, computes each triangle's 3D min interior angle + aspect, and
   * buckets the counts per tag — so a sliver field is attributable to its
   * emitting code path. Null on the legacy/parametric path (no provenance
   * stash) and when a downstream pass changed the triangle count (channel no
   * longer parallel). Metadata readout only — the mesh is byte-identical.
   */
  diagnoseSliverAttribution(opts?: FidelitySliverAttributionOptions): Promise<FidelitySliverAttributionDiagnostics | null>;
  /**
   * STAGE 0 — seam/cap-band triangle-quality split (the user-raised periodicity
   * concern, measured rather than argued). The conforming mesher's pre-warp
   * assembly (u,t,surfaceId) copy is parallel to the returned mesh's vertices,
   * so wall triangles are bucketed by the registry's topological u-seam
   * (pre-warp u=0/1, including u-span wrap) and the cap-adjacent pinned rings
   * (t≈0 / t≈1), each scored by 3D min interior angle vs the bulk. Null on the
   * legacy/parametric path (no assembly stash) and when a downstream pass
   * changed the vertex count (copy no longer parallel). Metadata readout only —
   * the mesh is byte-identical.
   */
  diagnoseSeamBands(opts?: FidelitySeamBandDiagnosticOptions): Promise<FidelitySeamBandDiagnostics | null>;
  /**
   * Budget honesty + delivered-mesh quality in ONE generation: builds at the
   * requested targetTriangles, then measures topology/quality DIRECTLY on the
   * returned (delivered) mesh and reads the budget + feature stashes from the
   * SAME build — one build per probe row instead of three independent
   * generateMesh calls measuring meshes that are only same-by-assumption.
   * Null when the conforming branch did not run.
   */
  diagnoseBudget(opts?: FidelityBudgetDiagnosticOptions): Promise<FidelityBudgetDiagnostics | null>;
  /** TEMP debug (revert): the OUTER-wall sub-mesh for off-DOM wireframe rendering. */
  _debugOuterMesh(targetTriangles?: number): Promise<{ vertices: Float32Array; indices: Uint32Array } | null>;
  /**
   * STAGE 0 — the byte-identity tripwire. Generates the mesh once and returns its
   * FNV-1a dual-lane fingerprint (see metrics.meshHash). Same-machine/driver
   * comparisons only — GPU-evaluated floats are not portable across hardware.
   */
  _debugMeshHash(targetTriangles?: number): Promise<{
    styleId: string; vertexCount: number; triangleCount: number;
    vertexHash: string; indexHash: string;
  } | null>;
}

export interface FidelityCrestQualityDiagnosticOptions {
  targetTriangles?: number;
  /** Min interior angle (deg) bar below which a triangle is "bad" (default 15). */
  angleBarDeg?: number;
  /** Crest-band half-width as a fraction of the inter-crest angular spacing. */
  crestHalfWidthFrac?: number;
}

export interface FidelityCrestQualityDiagnostics extends CrestBandQualityResult {
  styleId: string;
}

export interface FidelityCrestLateralDiagnosticOptions {
  targetTriangles?: number;
  /** Z-slice spacing (mm). Default 0.25 (spec: min(0.25, local cell t-extent);
   *  the cell extent is not cheaply available here — override when known). */
  sliceSpacingMm?: number;
}

export interface FidelityCrestLateralDiagnostics extends CrestLateralDeviationResult {
  styleId: string;
  /** Outer-wall submesh triangles sliced. */
  triangleCount: number;
  /** True-ridge construction path: SFB closed form vs generic f64 bisection. */
  ridgeMethod: 'closed-form' | 'bisection';
  /** Resolution of the sampler grid used to map the ridge into 3D. */
  referenceRes: number;
  /** Whether that sampler was C1 bicubic (`__pfReferenceBicubic`). */
  referenceBicubic: boolean;
}

export interface FidelityCdtHealthDiagnosticOptions {
  targetTriangles?: number;
}

export interface FidelityCdtHealthDiagnostics {
  styleId: string;
  /** Total CW→CCW winding flips across both walls (fold-over signal). */
  inversions: number;
  /** Total zero-(u,t)-area drops across both walls (potential holes). */
  drops: number;
  /** Number of CDT cells that fired either masking channel. */
  incidentCells: number;
  /** Top-20 incident cells by (inversions+drops), severity-sorted (inputs attached under `__pfConformingCellDumps`). */
  worstIncidents: CdtCellIncident[];
}

export interface FidelitySliverAttributionOptions {
  targetTriangles?: number;
  /** Min interior angle (deg) bar for the `below` counter (default 15). */
  angleBarDeg?: number;
}

/** Per-TRI_SOURCE-tag triangle-shape bucket. */
export interface SliverAttributionBucket {
  /** Triangles carrying this tag. */
  tris: number;
  /** Triangles with min interior 3D angle < `angleBarDeg`. */
  below: number;
  /** Triangles with aspect > ASPECT_MAX (the standing sliver gate). */
  slivers: number;
}

export interface FidelitySliverAttributionDiagnostics {
  styleId: string;
  angleBarDeg: number;
  /** Buckets keyed by the TRI_SOURCE tag value (stringified). */
  byTag: Record<string, SliverAttributionBucket>;
}

export interface FidelitySeamBandDiagnosticOptions {
  targetTriangles?: number;
}

export interface FidelitySeamBandDiagnostics extends SeamBandQualityResult {
  styleId: string;
}

export interface FidelitySerrationDiagnosticOptions {
  targetTriangles?: number;
  /** (angle,z) → (u,t) inversion iterations per sample (default 6). */
  newtonIters?: number;
}

export interface FidelitySerrationDiagnostics extends WallChordResult {
  styleId: string;
  triangleCount: number;
  /** Resolution of the reference grid the metric measured against — the mesh's
   *  own denseRes, or the decoupled `__pfReferenceDenseRes` when set. */
  referenceRes: number;
  /** Whether the reference was reconstructed with C1 bicubic (`__pfReferenceBicubic`)
   *  rather than C0 bilinear. */
  referenceBicubic: boolean;
}

export interface FidelityWallDiagnosticOptions {
  targetTriangles?: number;
  sampleOrder?: number;
}

export interface FidelityWallDiagnostics extends WallDeviationResult {
  styleId: string;
  triangleCount: number;
}

export interface FidelitySurfaceFidelityDiagnosticOptions {
  targetTriangles?: number;
  /** Tolerance (mm); nAbove counts samples above it (default 0.1). */
  tolMm?: number;
  /** Barycentric sub-samples per edge for the dense chord (default 12). */
  denseN?: number;
  /** Half-width of the excluded u-seam band (default the production seam width). */
  seamExclU?: number;
  /** Half-width of the ArtDeco riser t-band exclusion (default 1.6e-3). */
  tBandHalf?: number;
  /**
   * Which truth to compare against:
   *  - `'analytic'` (or `'sfb-packed'` for SFB): the CPU formula — EXACT where
   *    `styles.ts` matches the WGSL shader, WRONG where it has drifted.
   *  - `'gpu'`: the decoupled GPU outer-wall grid (the shader's own eval) — faithful
   *    for ANY style, but band-limited at sharp features. Requires the
   *    `__pfReferenceDenseRes` lever (else the grid is null and this is a no-op).
   *  - `'auto'` (DEFAULT): use the analytic reference, but FALL BACK to the GPU grid
   *    when the analytic reference is untrusted (vertexMax > eps) AND a grid is
   *    available — keeps the exact reference where it is best, GPU-truth elsewhere.
   */
  referenceSource?: 'analytic' | 'gpu' | 'auto';
  /** Newton iterations for the GPU-grid (θ,z)→radius inversion (default 6). */
  newtonIters?: number;
}

export interface FidelitySurfaceFidelityDiagnostics extends AnalyticDevResult {
  styleId: string;
  /** Outer-wall triangles whose 3 corners are all surfaceId 0 (the measured set). */
  triangleCount: number;
  /**
   * Echo of the truth source used for THIS result: 'sfb-packed' honors sf_strength;
   * 'analytic' = STYLE_FUNCTIONS; 'gpu-grid' = the decoupled GPU outer-wall grid
   * (the shader's own eval, used as the fallback when the analytic ref drifted).
   */
  referenceMode: 'sfb-packed' | 'analytic' | 'gpu-grid';
  /** Grid resolution when referenceMode==='gpu-grid' (band-limit caveat); else undefined. */
  referenceRes?: number;
  /**
   * Self-check that the chosen reference RESOLVES the GPU shader that PLACED the
   * vertices. Production GPU-evaluates every outer-wall vertex EXACTLY at its
   * (u,t), so a reference that tracks the true surface reads vertexMax ≈ the f32
   * floor (≤ ~0.001mm). A `vertexMaxMm` above {@link REFERENCE_PARITY_EPS_MM} means
   * the reference does NOT track it — either the CPU analytic (`styles.ts`) has
   * DRIFTED from the WGSL shader (a relief-amplitude/mask mismatch — measured on
   * Gyroid/Basket/Hex where vertexMax == the full relief default), or the
   * band-limited 'gpu-grid' under-resolves a sharp feature (raise
   * `__pfReferenceDenseRes`). In both cases the mesh is still GPU-faithful (it
   * renders correctly) but the `chord`/`dev` numbers are not yet trustworthy. The
   * headline "mesh lies on the true surface" claim holds only when this is true.
   */
  referenceTrusted: boolean;
}

export interface FidelityFShearDiagnosticOptions {
  targetTriangles?: number;
  resU?: number;
  resT?: number;
}

export interface FidelityFShearDiagnostics extends ShearSummary {
  styleId: string;
}

export interface FidelityCellCeilingDiagnosticOptions {
  targetTriangles?: number;
  resU?: number;
  resT?: number;
}

export interface FidelityCellCeilingDiagnostics extends CellCeilingSummary {
  styleId: string;
  /** True when a non-identity helix warp was composed with the sampler (the
   *  ceiling then describes the as-emitted, sheared cells — SpiralRidges). */
  warped: boolean;
}

export interface FidelityFeatureDiagnosticOptions {
  targetTriangles?: number;
}

export interface FidelityFeatureDiagnostics extends FeatureResolutionResult {
  styleId: string;
}

export interface FidelityBudgetDiagnosticOptions {
  targetTriangles?: number;
}

/** Single-build budget-honesty row: verdict + delivered-mesh topo/quality/featDrop. */
export interface FidelityBudgetDiagnostics {
  styleId: string;
  budget: ExportBudgetReport;
  topo: { boundaryEdges: number; nonManifoldEdges: number; orientationMismatches: number };
  quality: { sliverCount: number; maxAspect3D: number };
  /** null = feature accounting unavailable on this build. */
  featDrop: number | null;
  /** Per-attempt ladder telemetry (which gate stage rejected each rung), or
   *  null when the decimation branch did not run. Pure numbers — small. */
  decimationAttempts: DecimationAttempt[] | null;
}

declare global {
  interface Window {
    __pfFidelity?: PfFidelityApi;
  }
}

export function shouldEnableFidelityHook(): boolean {
  try {
    if (import.meta.env?.DEV) return true;
  } catch {
    /* import.meta may be undefined in some bundling contexts */
  }
  if (typeof location !== 'undefined') {
    return new URLSearchParams(location.search).has('fidelity');
  }
  return false;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createFidelityApi(deps: FidelityHookDeps): PfFidelityApi {
  return {
    listStyles() {
      return Object.keys(STYLE_REGISTRY);
    },
    isReady() {
      // Both pipelines must be live: parametric (under test) AND GPU grid (reference).
      return deps.isAvailable() && deps.isReferenceAvailable();
    },
    async setStyle(styleId: string) {
      deps.setStyle(styleId);
      // The store write above triggers a React re-render whose [style.name]
      // effects tear down and rebuild BOTH GPU pipelines, flipping isAvailable /
      // isReferenceAvailable false at the top of each effect. That happens on a
      // later tick, so we must NOT poll immediately — otherwise we'd observe the
      // PREVIOUS style's still-true flags and return before the rebuild even
      // starts (the stale-availability race). Settle first to let React commit
      // the re-render and run the effects, then poll for the NEW style's
      // pipelines to come back up.
      await sleep(500);
      // GPU pipeline (re)compilation can be slow on some styles/drivers (Dawn
      // shader compile observed up to ~8s), and both pipelines rebuild in
      // sequence, so budget generously.
      const deadline = Date.now() + 45000;
      while (Date.now() < deadline) {
        if (deps.isAvailable() && deps.isReferenceAvailable()) return;
        await sleep(100);
      }
      throw new Error(`Fidelity: GPU did not become ready for style ${styleId}`);
    },
    async setDimensions(params: Record<string, number>) {
      deps.setDimensions(params);
      // Let React commit the store write; no pipeline teardown (style unchanged),
      // so a short settle is enough before the next generate reads the new dims.
      await sleep(300);
    },
    async setStyleParams(params: Record<string, number>) {
      deps.setStyleParams(params);
      // Opts are read at generate time; no pipeline rebuild (style.name unchanged).
      await sleep(300);
    },
    async measure(opts: FidelityMeasureOptions): Promise<FidelityMetrics> {
      const styleId = currentStyleId();

      // Dense R_true reference via the fast GPU uniform grid (referenceTriangles
      // is advisory only; the grid resolution comes from the store, set dense by
      // the mount under ?fidelity).
      const tRef0 = Date.now();
      const dense = await deps.generateReference();
      if (!dense) throw new Error('Fidelity: GPU-grid reference generateReference returned null');
      // Copy before the next generate reuses buffers. Indices feed the
      // nearest-surface index for non-vertical (base/drain/rim + sloped foot) sag.
      const denseVertices = dense.vertices.slice();
      const denseIndices = dense.indices.slice();
      const refMs = Date.now() - tRef0;

      // Under-test mesh via the parametric pipeline at the requested budget.
      const tTest0 = Date.now();
      const mesh = await deps.generateMesh(opts.targetTriangles);
      if (!mesh) throw new Error('Fidelity: under-test generateMesh returned null');
      const testMs = Date.now() - tTest0;

      // Feature accounting. The conforming whole-mesh branch reports meaningful
      // analytic feature-line resolution (see conforming/FeatureLineGraph); prefer
      // it when present. The legacy/parametric path falls back to chain-debug
      // chain/line counts.
      const conformingFeatures = getLastConformingFeatureResult();
      const chain = getLastChainDebugData();
      const expected = conformingFeatures?.expected ?? chain?.chainCount ?? 0;
      const present = conformingFeatures?.present ?? chain?.lineCount ?? 0;

      try {
        if (import.meta.env?.DEV) {
          // eslint-disable-next-line no-console
          console.log(
            `[fidelity] ${styleId}: refTris=${dense.triangleCount} (${refMs}ms) ` +
              `testTris=${mesh.triangleCount} (${testMs}ms)`,
          );
        }
      } catch {
        /* import.meta may be undefined in some bundling contexts */
      }

      return computeFidelityMetrics({
        styleId,
        mesh: { vertices: mesh.vertices, indices: mesh.indices },
        denseVertices,
        denseIndices,
        features: { expected, present },
        weldToleranceMm: WELD_TOL_MM,
        sagSampleOrder: opts.sagSampleOrder,
        sagTriangleSampleLimit: opts.sagTriangleSampleLimit,
        qualityTriangleSampleLimit: opts.qualityTriangleSampleLimit,
        nearestReferenceTriangleSampleLimit: opts.nearestReferenceTriangleSampleLimit,
        referenceTriangleCount: dense.triangleCount,
      });
    },
    async diagnoseTopology(opts: FidelityTopologyDiagnosticOptions = {}): Promise<FidelityTopologyDiagnostics> {
      const styleId = currentStyleId();
      const mesh = await deps.generateMesh(opts.targetTriangles);
      if (!mesh) throw new Error('Fidelity: under-test generateMesh returned null');
      return {
        styleId,
        ...topologyDiagnostics(
          { vertices: mesh.vertices, indices: mesh.indices },
          opts.weldToleranceMm ?? WELD_TOL_MM,
          opts.sampleLimit ?? 16,
        ),
      };
    },
    async diagnoseTopoQuality(opts: FidelityTopologyDiagnosticOptions = {}): Promise<FidelityTopoQualitySummary> {
      const styleId = currentStyleId();
      const mesh = await deps.generateMesh(opts.targetTriangles);
      if (!mesh) throw new Error('Fidelity: under-test generateMesh returned null');
      const view = { vertices: mesh.vertices, indices: mesh.indices };
      const topo = topologyDiagnostics(view, opts.weldToleranceMm ?? WELD_TOL_MM, 0);
      const qual = triangleQualityDiagnostics(view, 0);
      return {
        styleId,
        orientationMismatches: topo.orientationMismatches,
        boundaryEdges: topo.boundaryEdges,
        nonManifoldEdges: topo.nonManifoldEdges,
        sliverCount: qual.sliverCount,
        maxAspect3D: qual.maxAspect3D,
        minAngleDeg: qual.minAngleDeg,
        triangleCount: Math.floor(mesh.indices.length / 3),
      };
    },
    async diagnoseTriangleQuality(opts: FidelityTopologyDiagnosticOptions = {}): Promise<FidelityTriangleQualitySummary> {
      const styleId = currentStyleId();
      const mesh = await deps.generateMesh(opts.targetTriangles);
      if (!mesh) throw new Error('Fidelity: under-test generateMesh returned null');
      const dist = triangleQualityDistribution({ vertices: mesh.vertices, indices: mesh.indices });
      return { styleId, ...dist };
    },
    async diagnoseFeatures(opts: FidelityFeatureDiagnosticOptions = {}): Promise<FidelityFeatureDiagnostics | null> {
      const styleId = currentStyleId();
      // Generating the mesh repopulates LAST_CONFORMING_FEATURE_RESULT (conforming
      // branch only). Discard the mesh; we only need the stashed feature result.
      const mesh = await deps.generateMesh(opts.targetTriangles);
      if (!mesh) throw new Error('Fidelity: under-test generateMesh returned null');
      const result = getLastConformingFeatureResult();
      if (!result) return null;
      return { styleId, ...result };
    },
    async diagnoseFShear(opts: FidelityFShearDiagnosticOptions = {}): Promise<FidelityFShearDiagnostics | null> {
      const styleId = currentStyleId();
      // Generating the mesh repopulates the stashed outer sampler grid
      // (conforming branch only). Discard the mesh; classify the real surface.
      const mesh = await deps.generateMesh(opts.targetTriangles);
      if (!mesh) throw new Error('Fidelity: under-test generateMesh returned null');
      const grid = getLastConformingOuterGrid();
      if (!grid) return null;
      const sampler = new GpuSurfaceSampler(grid.positions, grid.resU, grid.resT);
      const summary = classifySurfaceShear(sampler, { resU: opts.resU, resT: opts.resT });
      return { styleId, ...summary };
    },
    async diagnoseCellCeiling(opts: FidelityCellCeilingDiagnosticOptions = {}): Promise<FidelityCellCeilingDiagnostics | null> {
      const styleId = currentStyleId();
      // Generating the mesh repopulates the stashed outer sampler grid AND the
      // helix-warp stash (conforming branch only). Discard the mesh; measure the
      // analytic corner-angle ceiling on the WARP-COMPOSED map — the metric the
      // as-emitted cells actually live in (the shear is applied after
      // triangulation, so the bare sampler alone would understate it).
      const mesh = await deps.generateMesh(opts.targetTriangles);
      if (!mesh) throw new Error('Fidelity: under-test generateMesh returned null');
      const grid = getLastConformingOuterGrid();
      if (!grid) return null;
      const sampler = new GpuSurfaceSampler(grid.positions, grid.resU, grid.resT);
      const helix = getLastConformingHelixWarp();
      const warp = helix && !helix.isIdentity
        ? (u: number, t: number) => applyHelixWarp(helix, u, t)
        : null;
      const summary = classifyCellCeiling(sampler, warp, { resU: opts.resU, resT: opts.resT });
      return { styleId, warped: warp !== null, ...summary };
    },
    async diagnoseWallFidelity(opts: FidelityWallDiagnosticOptions = {}): Promise<FidelityWallDiagnostics> {
      const styleId = currentStyleId();
      // Dense true-surface reference (whole pot) → 3D nearest-surface index.
      const dense = await deps.generateReference();
      if (!dense) throw new Error('Fidelity: GPU-grid reference returned null');
      const denseVertices = dense.vertices.slice();
      // Under-test export mesh.
      const mesh = await deps.generateMesh(opts.targetTriangles);
      if (!mesh) throw new Error('Fidelity: under-test generateMesh returned null');
      const w = wallDeviation(
        { vertices: mesh.vertices, indices: mesh.indices },
        denseVertices,
        opts.sampleOrder ?? 4,
      );
      return { styleId, ...w, triangleCount: Math.floor(mesh.indices.length / 3) };
    },
    async diagnoseSurfaceFidelity(
      opts: FidelitySurfaceFidelityDiagnosticOptions = {},
    ): Promise<FidelitySurfaceFidelityDiagnostics | null> {
      const styleId = currentStyleId();
      // Generating the mesh repopulates the PRE-WARP assembly (u,t,surfaceId) copy
      // (conforming branch only), PARALLEL to the returned mesh's vertices.
      const mesh = await deps.generateMesh(opts.targetTriangles);
      if (!mesh) throw new Error('Fidelity: under-test generateMesh returned null');
      const ut = getLastConformingAssemblyUT();
      const style = deps.getStyleState?.() ?? null;
      // HONEST-NULL: legacy/parametric path (no stash), or no config getter.
      if (!ut || !style) return null;
      // The stash must stay parallel to the returned mesh (a downstream pass — e.g.
      // decimation — can change the vertex count, breaking the (u,t) lookup).
      if (ut.length !== mesh.vertices.length) return null;
      if (!Number.isFinite(style.H) || style.H <= 0) return null;
      // TWIST: atan2(y,x) recovers the TWISTED azimuth, not the style theta, so the
      // analytic radius would be sampled at a sheared angle — refuse (mirror
      // diagnoseCrestLateralDeviation). (Radius itself is twist-invariant, but the
      // back-mapping is not.) SFB@1 / ArtDeco default configs are spin-zero.
      if (style.spinTurns !== 0 || style.spinPhaseDeg !== 0) return null;
      // CONFIG-TRUTH: the per-t base profile needs the taper, not the scalar mean.
      // Refuse rather than read a cylinder when the mount did not forward them.
      if (style.Rt === undefined || style.Rb === undefined || style.expn === undefined) return null;
      const H = style.H, Rt = style.Rt, Rb = style.Rb, expn = style.expn;
      const bellOpts: StyleOptions = {
        bellAmp: style.bellAmp ?? 0,
        bellCenter: style.bellCenter ?? 0.5,
        bellWidth: style.bellWidth ?? 0.22,
      };
      // r0(t) = the EXPORT's tapered+belled base radius (profile.ts mirrors styles.wgsl r_base).
      const r0Of = (t: number): number => baseRadius(t * H, H, Rb, Rt, expn, bellOpts);

      // Build the config-true analytic radius closure (theta, z) -> mm.
      let rAnalytic: AnalyticRadiusFn;
      let referenceMode: 'sfb-packed' | 'analytic' | 'gpu-grid';
      if (styleId === 'SuperformulaBlossom') {
        // PACKED truth: honor sf_strength at p[0] with the GPU mix (styles.wgsl:102)
        // — STYLE_FUNCTIONS omits strength (always full petals), the BLOCKING-2 trap.
        const [, packed] = buildStyleParamPayload(styleId, style.opts as Record<string, unknown>);
        const p = Float32Array.from(packed);
        const strength = Math.max(0, Math.min(1, p[0]));
        rAnalytic = (theta, z) => {
          const t = z / H;
          const r0 = r0Of(t);
          const sf = r0 * (0.9 + 0.35 * sfRf(((theta / TAU) % 1 + 1) % 1, t, p));
          return r0 + (sf - r0) * strength;
        };
        referenceMode = 'sfb-packed';
      } else {
        // Generic styles: STYLE_FUNCTIONS with snake+camel opts (the production
        // buildStyleOptions convention, windowHook.ts diagnoseCrestLateralDeviation).
        const toCamel = (s: string): string => s.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
        const styleOptions: Record<string, number> = {};
        for (const [key, value] of Object.entries(style.opts)) {
          if (typeof value !== 'number') continue;
          styleOptions[key] = value;
          const camel = toCamel(key);
          if (camel !== key) styleOptions[camel] = value;
        }
        const fn = getStyleFunction(styleId as StyleId);
        rAnalytic = (theta, z) => {
          const r = fn(theta, z, r0Of(z / H), H, styleOptions as StyleOptions);
          return Number.isFinite(r) ? r : r0Of(z / H);
        };
        referenceMode = 'analytic';
      }

      // ArtDeco C0 riser t-bands from the live step count (excluded vertical faces).
      const tBands = styleId === 'ArtDeco'
        ? artDecoRiserTBands(style.opts.ad_step_count ?? style.opts.adStepCount ?? 4)
        : [];

      const measure = (rA: AnalyticRadiusFn): AnalyticDevResult => radialAnalyticDeviation(
        { vertices: mesh.vertices, indices: mesh.indices },
        ut,
        rA,
        {
          H,
          tolMm: opts.tolMm ?? 0.1,
          // Production seam half-width: 1.5 / 2^(featureLevel(7) + uBias(2)) (SFB@1 config).
          seamExclU: opts.seamExclU ?? 1.5 / (1 << (7 + 2)),
          tBands,
          tBandHalf: opts.tBandHalf ?? 1.6e-3,
          denseN: opts.denseN,
        },
      );

      let res = measure(rAnalytic);
      let referenceRes: number | undefined;

      // GPU-TRUTH FALLBACK: the CPU analytic reference (styles.ts STYLE_FUNCTIONS)
      // has DRIFTED from the WGSL shader on ~half the styles (vertexMax >> f32
      // floor — measured: Gyroid/Basket/Hex == full relief default, Crystalline 45mm).
      // When it has (or when 'gpu' is forced), re-measure against the DECOUPLED GPU
      // outer-wall grid — the shader's OWN eval, faithful for ANY style (band-limited
      // at sharp features, so kept ONLY as the fallback; the exact analytic stays
      // primary where it is trusted, which is better on sharp crests). Requires the
      // `__pfReferenceDenseRes` lever; with no grid we keep the analytic result
      // (backward-compatible — default probes are unchanged).
      const source = opts.referenceSource ?? 'auto';
      const wantGpu = source === 'gpu'
        || (source === 'auto' && res.vertexMaxMm > REFERENCE_PARITY_EPS_MM);
      if (wantGpu) {
        const refGrid = getLastConformingOuterReferenceGrid();
        if (refGrid) {
          const useBicubic = (globalThis as unknown as { __pfReferenceBicubic?: boolean }).__pfReferenceBicubic === true;
          const sampler = useBicubic
            ? new BicubicSurfaceSampler(refGrid.positions, refGrid.resU, refGrid.resT)
            : new GpuSurfaceSampler(refGrid.positions, refGrid.resU, refGrid.resT);
          // Outer-wall z extent from the grid (the sampler's own domain — seeds the
          // (θ,z)→(u,t) Newton inversion).
          let zMin = Infinity, zMax = -Infinity;
          for (let i = 2; i < refGrid.positions.length; i += 3) {
            const z = refGrid.positions[i];
            if (z < zMin) zMin = z;
            if (z > zMax) zMax = z;
          }
          const iters = opts.newtonIters ?? 6;
          const gpuRAnalytic: AnalyticRadiusFn = (theta, z) =>
            sampleTrueRadius(sampler, theta, z, zMin, zMax, { newtonIters: iters });
          res = measure(gpuRAnalytic);
          referenceMode = 'gpu-grid';
          referenceRes = refGrid.resU;
        }
      }

      // PARITY / RESOLUTION SELF-CHECK: vertices are GPU-placed-exact, so a reference
      // that tracks the true surface reads vertexMax ≈ f32 floor. Above the eps ⇒ the
      // chosen reference does NOT track it (analytic drift, OR a band-limited gpu-grid
      // under-resolving a sharp feature) — mesh still GPU-faithful, but the numbers
      // are not yet trustworthy.
      const referenceTrusted = res.vertexMaxMm <= REFERENCE_PARITY_EPS_MM;
      return {
        styleId,
        triangleCount: res.wallTriangles,
        referenceMode,
        referenceRes,
        referenceTrusted,
        ...res,
      };
    },
    async diagnoseSerration(opts: FidelitySerrationDiagnosticOptions = {}): Promise<FidelitySerrationDiagnostics | null> {
      const styleId = currentStyleId();
      // Generating the mesh repopulates the stashed outer sampler grid + the
      // outer-wall vertex mask (conforming branch only). mesh.vertices is the
      // conforming pos3D in the same order as the mask (generateMesh returns
      // result.mesh unwelded), so the mask restricts cleanly to the outer wall.
      const mesh = await deps.generateMesh(opts.targetTriangles);
      if (!mesh) throw new Error('Fidelity: under-test generateMesh returned null');
      const grid = getLastConformingOuterGrid();
      const mask = getLastConformingOuterWallMask();
      if (!grid || !mask) return null;
      const sub = extractOuterWallSubmesh(mesh.vertices, mesh.indices, mask);
      // Prefer the DECOUPLED high-res reference grid (faithful R_true, set via
      // `__pfReferenceDenseRes`) — it measures true mesh chord error instead of the
      // mesh grid's own bilinear cusp-smoothing. Null unless overridden ⇒ the mesh
      // grid (current behaviour, so default diagnostics are unchanged).
      const refGrid = getLastConformingOuterReferenceGrid() ?? grid;
      // Reconstruct the reference with C1 BICUBIC (`__pfReferenceBicubic`) instead of
      // C0 bilinear: bilinear's cell-boundary derivative jumps make the Newton
      // (angle,z)→(u,t) inversion noisy near a sharp cusp (the non-monotonic crestRms
      // at high reference res); bicubic de-noises it AND tracks the surface O(h^4) vs
      // O(h^2) between nodes. Default false ⇒ bilinear (unchanged).
      const bicubic = (globalThis as unknown as { __pfReferenceBicubic?: boolean }).__pfReferenceBicubic === true;
      const sampler = bicubic
        ? new BicubicSurfaceSampler(refGrid.positions, refGrid.resU, refGrid.resT)
        : new GpuSurfaceSampler(refGrid.positions, refGrid.resU, refGrid.resT);
      const w = wallChordError(sub, sampler, { newtonIters: opts.newtonIters });
      return {
        styleId,
        triangleCount: Math.floor(sub.indices.length / 3),
        ...w,
        referenceRes: refGrid.resU,
        referenceBicubic: bicubic,
      };
    },
    async diagnoseCrestQuality(opts: FidelityCrestQualityDiagnosticOptions = {}): Promise<FidelityCrestQualityDiagnostics | null> {
      const styleId = currentStyleId();
      // Generating the mesh repopulates the stashed outer sampler grid + the
      // outer-wall vertex mask (conforming branch only). mesh.vertices is the
      // conforming pos3D in the same order as the mask, so the mask restricts to
      // the outer wall, and the metric measures REFERENCE-FREE 3D min angles.
      const mesh = await deps.generateMesh(opts.targetTriangles);
      if (!mesh) throw new Error('Fidelity: under-test generateMesh returned null');
      const grid = getLastConformingOuterGrid();
      const mask = getLastConformingOuterWallMask();
      if (!grid || !mask) return null;
      const sub = extractOuterWallSubmesh(mesh.vertices, mesh.indices, mask);
      const sampler = new GpuSurfaceSampler(grid.positions, grid.resU, grid.resT);
      const result = crestBandTriangleQuality(sub, sampler, {
        angleBarDeg: opts.angleBarDeg,
        crestHalfWidthFrac: opts.crestHalfWidthFrac,
      });
      return { styleId, ...result };
    },
    async diagnoseCrestLateralDeviation(opts: FidelityCrestLateralDiagnosticOptions = {}): Promise<FidelityCrestLateralDiagnostics | null> {
      const styleId = currentStyleId();
      // Generating the mesh repopulates the stashed outer sampler grid + the
      // outer-wall vertex mask (conforming branch only); the mask restricts the
      // slicer to the outer wall exactly as diagnoseCrestQuality does.
      const mesh = await deps.generateMesh(opts.targetTriangles);
      if (!mesh) throw new Error('Fidelity: under-test generateMesh returned null');
      const grid = getLastConformingOuterGrid();
      const mask = getLastConformingOuterWallMask();
      const style = deps.getStyleState?.() ?? null;
      if (!grid || !mask || !style) return null;
      // HONEST-NULL GUARDS — no fabricated state, no silently-wrong numbers:
      //  • a non-finite or non-positive height is not a measurable pot;
      //  • the analytic ridge below is solved with ZERO spin/twist, while
      //    production buildStyleOptions (useExport.ts) injects spinTurns/
      //    spinPhaseDeg/spinCurveExp into the style functions — the f64
      //    mirror call below deliberately omits them, so a spun/phased pot
      //    (profile.spinTwistRadians is non-zero when turns ≠ 0 OR phase ≠ 0)
      //    would read a confidently WRONG ridge. Refuse (null), enforcing the
      //    constraint instead of documenting it.
      if (!Number.isFinite(style.H) || style.H <= 0) return null;
      if (style.spinTurns !== 0 || style.spinPhaseDeg !== 0) return null;
      const sub = extractOuterWallSubmesh(mesh.vertices, mesh.indices, mask);

      // The ridge is SOLVED in the style's NATIVE (u,t) domain — the same
      // domain the stashed PLAIN sampler consumes (the crease/helix warps
      // re-parameterize the triangulation lattice, not the surface), so the
      // mapping needs NO composedWallSampler composition here; composing the
      // stashed helix would DOUBLE-apply the shear to an already-helical
      // locus (see crestLateralDeviation.ts module doc). Reference selection
      // mirrors diagnoseSerration: the decoupled `__pfReferenceDenseRes` grid
      // when set, C1 bicubic under `__pfReferenceBicubic`.
      const refGrid = getLastConformingOuterReferenceGrid() ?? grid;
      const bicubic = (globalThis as unknown as { __pfReferenceBicubic?: boolean }).__pfReferenceBicubic === true;
      const surface = bicubic
        ? new BicubicSurfaceSampler(refGrid.positions, refGrid.resU, refGrid.resT)
        : new GpuSurfaceSampler(refGrid.positions, refGrid.resU, refGrid.resT);

      // TRUE RIDGE: SFB closed form (refErrBound ≈ 0); generic f64-mirror
      // bisection otherwise. Both consume the SAME packed/option state the
      // production pipeline reads (buildStyleParamPayload / store opts).
      let paramRidge: ParamRidge;
      let ridgeMethod: 'closed-form' | 'bisection';
      if (styleId === 'SuperformulaBlossom') {
        const [, packed] = buildStyleParamPayload(styleId, style.opts as Record<string, unknown>);
        paramRidge = sfClosedFormParamRidge(Float32Array.from(packed));
        ridgeMethod = 'closed-form';
      } else {
        // f64 CPU radius mirror in the style's (u,t) domain. The mirrors take
        // camelCase StyleOptions; the store carries snake_case registry keys —
        // copy both spellings (the useExport buildStyleOptions convention).
        // Zero spin/twist (θ = TAU·u + const per t) is ENFORCED by the guard
        // above — a spun pot returns null instead of a wrong ridge.
        const toCamel = (s: string): string => s.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
        const styleOptions: Record<string, number> = {};
        for (const [key, value] of Object.entries(style.opts)) {
          if (typeof value !== 'number') continue;
          styleOptions[key] = value;
          const camel = toCamel(key);
          if (camel !== key) styleOptions[camel] = value;
        }
        const fn = getStyleFunction(styleId as StyleId);
        paramRidge = solveParamRidgeByBisection(
          {
            value: (u: number, t: number): number =>
              fn(TAU * u, t * style.H, style.r0, style.H, styleOptions as StyleOptions),
            periodicU: true,
          },
          { minProminence: 0.05 },
        );
        ridgeMethod = 'bisection';
      }

      // Bilinear sampler chord-vs-arc bound (rad ≈ (TAU/resU)²/8, ×r → mm) —
      // the grid sampler's own contribution to the reference error. A genuine
      // UPPER bound needs the MAX radius anywhere on the wall (on a tapered
      // pot the max r can be ~2× a single mid-height probe, which would
      // UNDERSTATE the bound): scan the reference grid's own positions, which
      // cover the full outer surface.
      let rMax = 0;
      const gpos = refGrid.positions;
      for (let i = 0; i + 1 < gpos.length; i += 3) {
        const rr = Math.hypot(gpos[i], gpos[i + 1]);
        if (rr > rMax) rMax = rr;
      }
      const gridBoundMm = (rMax * Math.pow(TAU / refGrid.resU, 2)) / 8;
      const ridge = ridgeFromParamBranches(paramRidge, surface, { extraRefErrMm: gridBoundMm });

      const result = crestLateralDeviation(sub, ridge, { sliceSpacingMm: opts.sliceSpacingMm });
      return {
        styleId,
        triangleCount: Math.floor(sub.indices.length / 3),
        ridgeMethod,
        referenceRes: refGrid.resU,
        referenceBicubic: bicubic,
        ...result,
      };
    },
    async diagnoseCdtHealth(opts: FidelityCdtHealthDiagnosticOptions = {}): Promise<FidelityCdtHealthDiagnostics | null> {
      const styleId = currentStyleId();
      // Generating the mesh repopulates the stashed per-wall CDT masking-channel
      // counters (conforming branch only). Discard the mesh; read the stash.
      const mesh = await deps.generateMesh(opts.targetTriangles);
      if (!mesh) throw new Error('Fidelity: under-test generateMesh returned null');
      const stats = getLastConformingCdtStats();
      if (!stats) return null;
      const empty = { inversions: 0, drops: 0, incidents: [] as CdtCellIncident[] };
      const o = stats.outer ?? empty;
      const i = stats.inner ?? empty;
      return {
        styleId,
        inversions: o.inversions + i.inversions,
        drops: o.drops + i.drops,
        incidentCells: o.incidents.length + i.incidents.length,
        worstIncidents: [...o.incidents, ...i.incidents]
          .sort((a, b) => (b.inversions + b.drops) - (a.inversions + a.drops))
          .slice(0, 20),
      };
    },
    async diagnoseSliverAttribution(opts: FidelitySliverAttributionOptions = {}): Promise<FidelitySliverAttributionDiagnostics | null> {
      const styleId = currentStyleId();
      const bar = opts.angleBarDeg ?? 15;
      // Generating the mesh repopulates the stashed provenance channel
      // (conforming branch only). The channel is parallel to the RETURNED
      // mesh's triangles — bail (null) if a downstream pass (e.g. decimation)
      // changed the count so attribution can never silently misalign.
      const mesh = await deps.generateMesh(opts.targetTriangles);
      if (!mesh) throw new Error('Fidelity: under-test generateMesh returned null');
      const src = getLastConformingTriangleSource();
      if (!src || src.length !== Math.floor(mesh.indices.length / 3)) return null;
      const byTag: Record<string, SliverAttributionBucket> = {};
      for (let t = 0; t < mesh.indices.length; t += 3) {
        const tag = String(src[t / 3]);
        const b = (byTag[tag] ??= { tris: 0, below: 0, slivers: 0 });
        b.tris++;
        const q = triMinAngleAndAspect(
          mesh.vertices, mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2],
        );
        if (q.minAngleDeg < bar) b.below++;
        if (q.aspect > ASPECT_MAX) b.slivers++;
      }
      return { styleId, angleBarDeg: bar, byTag };
    },
    async diagnoseSeamBands(opts: FidelitySeamBandDiagnosticOptions = {}): Promise<FidelitySeamBandDiagnostics | null> {
      const styleId = currentStyleId();
      // Generating the mesh repopulates the stashed PRE-WARP assembly
      // (u,t,surfaceId) copy (conforming branch only). The copy is parallel to
      // the RETURNED mesh's vertices — bail (null) if a downstream pass changed
      // the vertex count so the band bucketing can never silently misalign.
      const mesh = await deps.generateMesh(opts.targetTriangles);
      if (!mesh) throw new Error('Fidelity: under-test generateMesh returned null');
      const ut = getLastConformingAssemblyUT();
      if (!ut || ut.length !== mesh.vertices.length) return null;
      return { styleId, ...seamBandTriangleQuality({ vertices: mesh.vertices, indices: mesh.indices }, ut) };
    },
    async diagnoseBudget(opts: FidelityBudgetDiagnosticOptions = {}): Promise<FidelityBudgetDiagnostics | null> {
      const styleId = currentStyleId();
      // ONE generation: the budget verdict, the feature stash, AND the
      // topology/quality measurements all describe this same delivered mesh.
      const mesh = await deps.generateMesh(opts.targetTriangles);
      if (!mesh) throw new Error('Fidelity: under-test generateMesh returned null');
      const budget = getLastConformingBudgetReport();
      if (!budget) return null;
      const view = { vertices: mesh.vertices, indices: mesh.indices };
      const topo = topologyMetric(view, WELD_TOL_MM);
      const q = triangleQuality3D(view);
      return {
        styleId,
        budget,
        topo: {
          boundaryEdges: topo.boundaryEdges,
          nonManifoldEdges: topo.nonManifoldEdges,
          orientationMismatches: topo.orientationMismatches,
        },
        quality: { sliverCount: q.sliverCount, maxAspect3D: q.maxAspect3D },
        featDrop: getLastConformingFeatureResult()?.dropped ?? null,
        decimationAttempts: getLastConformingDecimationReport()?.attempts ?? null,
      };
    },
    async _debugOuterMesh(targetTriangles?: number) {
      const mesh = await deps.generateMesh(targetTriangles);
      if (!mesh) return null;
      const mask = getLastConformingOuterWallMask();
      if (!mask) return { vertices: mesh.vertices, indices: mesh.indices };
      return extractOuterWallSubmesh(mesh.vertices, mesh.indices, mask);
    },
    async _debugMeshHash(targetTriangles?: number) {
      const styleId = currentStyleId();
      const mesh = await deps.generateMesh(targetTriangles);
      if (!mesh) return null;
      const h = meshHash(mesh.vertices, mesh.indices);
      return {
        styleId,
        vertexCount: Math.floor(mesh.vertices.length / 3),
        triangleCount: Math.floor(mesh.indices.length / 3),
        vertexHash: h.vertexHash,
        indexHash: h.indexHash,
      };
    },
    async diagnoseQuality(opts: FidelityQualityDiagnosticOptions = {}): Promise<FidelityQualityDiagnostics> {
      const styleId = currentStyleId();
      const mesh = await deps.generateMesh(opts.targetTriangles);
      if (!mesh) throw new Error('Fidelity: under-test generateMesh returned null');
      const triangleCount = Math.floor(mesh.indices.length / 3);
      const triangleStart = Math.min(triangleCount, Math.max(0, Math.floor(opts.triangleStart ?? 0)));
      const triangleEnd = Math.min(
        triangleCount,
        Math.max(triangleStart, Math.floor(opts.triangleEnd ?? triangleCount)),
      );
      const diagnostics = triangleQualityDiagnostics(
        {
          vertices: mesh.vertices,
          indices: mesh.indices.subarray(triangleStart * 3, triangleEnd * 3),
        },
        opts.sampleLimit ?? 16,
      );
      return {
        styleId,
        ...diagnostics,
        worst: diagnostics.worst.map((sample) => ({
          ...sample,
          triangleIndex: sample.triangleIndex + triangleStart,
        })),
      };
    },
  };
}

function currentStyleId(): string {
  return (window as unknown as { __pfCurrentStyle?: string }).__pfCurrentStyle ?? 'unknown';
}
