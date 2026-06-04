/**
 * Dev/test-gated window hook for the SP0 fidelity harness. Registered from
 * StatusFooter behind import.meta.env.DEV (or ?fidelity=1). NEVER ships active
 * in production. Contains no pipeline logic: it drives the existing
 * generateMesh, reads pipeline chain-debug accounting, and runs pure metrics
 * in-page so only ~12 numbers cross the CDP bridge.
 */
import type { MeshData } from '../geometry/types';
import { STYLE_REGISTRY } from '../styles/registry';
import { getLastChainDebugData } from '../renderers/webgpu/ParametricExportComputer';
import {
  computeFidelityMetrics,
  topologyDiagnostics,
  triangleQualityDiagnostics,
  type TopologyDiagnostics,
  type TriangleQualityDiagnostics,
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
}

export interface FidelityTopologyDiagnostics extends TopologyDiagnostics {
  styleId: string;
}

export interface FidelityQualityDiagnostics extends TriangleQualityDiagnostics {
  styleId: string;
}

export interface FidelityHookDeps {
  setStyle: (name: string) => void;
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
  measure(opts: FidelityMeasureOptions): Promise<FidelityMetrics>;
  diagnoseTopology(opts?: FidelityTopologyDiagnosticOptions): Promise<FidelityTopologyDiagnostics>;
  diagnoseQuality(opts?: FidelityQualityDiagnosticOptions): Promise<FidelityQualityDiagnostics>;
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

      const chain = getLastChainDebugData();
      const expected = chain?.chainCount ?? 0;
      const present = chain?.lineCount ?? 0;

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
    async diagnoseQuality(opts: FidelityQualityDiagnosticOptions = {}): Promise<FidelityQualityDiagnostics> {
      const styleId = currentStyleId();
      const mesh = await deps.generateMesh(opts.targetTriangles);
      if (!mesh) throw new Error('Fidelity: under-test generateMesh returned null');
      return {
        styleId,
        ...triangleQualityDiagnostics(
          { vertices: mesh.vertices, indices: mesh.indices },
          opts.sampleLimit ?? 16,
        ),
      };
    },
  };
}

function currentStyleId(): string {
  return (window as unknown as { __pfCurrentStyle?: string }).__pfCurrentStyle ?? 'unknown';
}
