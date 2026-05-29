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
import { computeFidelityMetrics } from './metrics';
import { WELD_TOL_MM, type FidelityMetrics } from './types';

export interface FidelityMeasureOptions {
  targetTriangles: number;
  referenceTriangles: number;
  sagSampleOrder?: number;
}

export interface FidelityHookDeps {
  setStyle: (name: string) => void;
  isAvailable: () => boolean;
  generateMesh: (targetTriangles?: number) => Promise<MeshData | null>;
}

export interface PfFidelityApi {
  listStyles(): string[];
  isReady(): boolean;
  setStyle(styleId: string): Promise<void>;
  measure(opts: FidelityMeasureOptions): Promise<FidelityMetrics>;
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
      return deps.isAvailable();
    },
    async setStyle(styleId: string) {
      deps.setStyle(styleId);
      // Wait for the async GPU re-init (useEffect keyed on style.name) to settle.
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        if (deps.isAvailable()) return;
        await sleep(100);
      }
      throw new Error(`Fidelity: GPU did not become ready for style ${styleId}`);
    },
    async measure(opts: FidelityMeasureOptions): Promise<FidelityMetrics> {
      const styleId = currentStyleId();
      const dense = await deps.generateMesh(opts.referenceTriangles);
      if (!dense) throw new Error('Fidelity: dense reference generateMesh returned null');
      const denseVertices = dense.vertices.slice(); // copy before next generate reuses buffers

      const mesh = await deps.generateMesh(opts.targetTriangles);
      if (!mesh) throw new Error('Fidelity: under-test generateMesh returned null');

      const chain = getLastChainDebugData();
      const expected = chain?.chainCount ?? 0;
      const present = chain?.lineCount ?? 0;

      return computeFidelityMetrics({
        styleId,
        mesh: { vertices: mesh.vertices, indices: mesh.indices },
        denseVertices,
        features: { expected, present },
        weldToleranceMm: WELD_TOL_MM,
        sagSampleOrder: opts.sagSampleOrder,
        referenceTriangleCount: dense.triangleCount,
      });
    },
  };
}

function currentStyleId(): string {
  return (window as unknown as { __pfCurrentStyle?: string }).__pfCurrentStyle ?? 'unknown';
}
