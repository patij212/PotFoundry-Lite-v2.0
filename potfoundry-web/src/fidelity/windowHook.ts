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
  getLastConformingFeatureResult,
  getLastConformingOuterGrid,
  getLastConformingOuterReferenceGrid,
  getLastConformingOuterWallMask,
} from '../renderers/webgpu/ParametricExportComputer';
import type { FeatureResolutionResult } from '../renderers/webgpu/parametric/conforming';
import { GpuSurfaceSampler } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { classifySurfaceShear, type ShearSummary } from '../renderers/webgpu/parametric/conforming/FShearDiagnostics';
import {
  computeFidelityMetrics,
  extractOuterWallSubmesh,
  topologyDiagnostics,
  triangleQualityDiagnostics,
  wallChordError,
  wallDeviation,
  type TopologyDiagnostics,
  type TriangleQualityDiagnostics,
  type WallChordResult,
  type WallDeviationResult,
} from './metrics';
import { WELD_TOL_MM, type FidelityMetrics } from './types';

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
  /** TEMP debug (revert): the OUTER-wall sub-mesh for off-DOM wireframe rendering. */
  _debugOuterMesh(targetTriangles?: number): Promise<{ vertices: Float32Array; indices: Uint32Array } | null>;
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
      const sampler = new GpuSurfaceSampler(refGrid.positions, refGrid.resU, refGrid.resT);
      const w = wallChordError(sub, sampler, { newtonIters: opts.newtonIters });
      return { styleId, triangleCount: Math.floor(sub.indices.length / 3), ...w, referenceRes: refGrid.resU };
    },
    async _debugOuterMesh(targetTriangles?: number) {
      const mesh = await deps.generateMesh(targetTriangles);
      if (!mesh) return null;
      const mask = getLastConformingOuterWallMask();
      if (!mask) return { vertices: mesh.vertices, indices: mesh.indices };
      return extractOuterWallSubmesh(mesh.vertices, mesh.indices, mask);
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
