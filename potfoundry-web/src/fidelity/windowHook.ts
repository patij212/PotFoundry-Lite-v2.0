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
  getLastConformingCdtStats,
  getLastConformingFeatureResult,
  getLastConformingHelixWarp,
  getLastConformingOuterGrid,
  getLastConformingOuterReferenceGrid,
  getLastConformingOuterWallMask,
  getLastConformingTriangleSource,
} from '../renderers/webgpu/ParametricExportComputer';
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
  topologyDiagnostics,
  triangleQualityDiagnostics,
  triangleQualityDistribution,
  triMinAngleAndAspect,
  wallChordError,
  wallDeviation,
  type CrestBandQualityResult,
  type TopologyDiagnostics,
  type TriangleQualityDiagnostics,
  type TriangleQualityDistribution,
  type WallChordResult,
  type WallDeviationResult,
} from './metrics';
import { ASPECT_MAX, WELD_TOL_MM, type FidelityMetrics } from './types';

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
   * crest fix. Null on the legacy/parametric path (no conforming outer-wall stash).
   */
  diagnoseCrestQuality(opts?: FidelityCrestQualityDiagnosticOptions): Promise<FidelityCrestQualityDiagnostics | null>;
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
   * FCT plain / FCT fan / feature-cell CDT / ring-or-cap); this generates the
   * mesh once, computes each triangle's 3D min interior angle + aspect, and
   * buckets the counts per tag — so a sliver field is attributable to its
   * emitting code path. Null on the legacy/parametric path (no provenance
   * stash) and when a downstream pass changed the triangle count (channel no
   * longer parallel). Metadata readout only — the mesh is byte-identical.
   */
  diagnoseSliverAttribution(opts?: FidelitySliverAttributionOptions): Promise<FidelitySliverAttributionDiagnostics | null>;
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
