/**
 * certifyMeshExport.ts — the FULL export certificate: surface fidelity AND a
 * watertight closed solid, in one verdict.
 *
 * The compendium separates the two measurements because they have different scopes —
 * fidelity is measured on the OUTER WALL (surfaceId 0) against the analytic surface,
 * while watertightness is a property of the WHOLE closed mesh. This composer ANDs
 * them so a fully-certified export requires BOTH: a faithful-but-leaky mesh and a
 * watertight-but-inaccurate mesh both correctly FAIL.
 *
 * Composes the unified {@link measureRadialFidelity} (MAX-first, globally-correct
 * projector by default) with {@link topologyMetric} (the cap-safe, by-index weld/edge
 * ruler). Additive: imports only public APIs; changes nothing.
 *
 * SHAPE SCOPE: single-valued radial `rA` (the fidelity half). Watertightness is fully
 * shape-agnostic (index-based).
 */
import { measureRadialFidelity, type RadialFidelityOptions, type RadialFidelityReport } from './measureRadialFidelity';
import { topologyMetric } from './metrics';
import { WELD_TOL_MM } from './types';
import type { MeshView } from './types';
import type { AnalyticRadiusFn } from './analyticSurfaceGate';

export interface MeshExportCertifyOptions extends RadialFidelityOptions {
  /** Position weld tolerance (mm) for the watertight check. Default WELD_TOL_MM (1e-4). */
  weldToleranceMm?: number;
}

export interface MeshExportCertificate {
  /** The full MAX-first surface-fidelity report (outer wall vs analytic surface). */
  fidelity: RadialFidelityReport;
  /** Undirected edges used by exactly one triangle side (a leak). */
  boundaryEdges: number;
  /** Undirected edges shared by >2 triangle sides (non-manifold). */
  nonManifoldEdges: number;
  /** Manifold edges whose two uses point the same way (inconsistent winding). */
  orientationMismatches: number;
  /** boundaryEdges === 0 && nonManifoldEdges === 0 && orientationMismatches === 0. */
  watertight: boolean;
  /** THE export verdict: surface fidelity certified AND the closed solid is watertight. */
  certified: boolean;
}

/**
 * Certify `mesh` for export: MAX-first surface fidelity on the outer wall against
 * `rA`, ANDed with a watertight closed-solid check on the whole mesh.
 */
export function certifyMeshExport(
  mesh: MeshView,
  ut: ArrayLike<number>,
  rA: AnalyticRadiusFn,
  opts: MeshExportCertifyOptions,
): MeshExportCertificate {
  const fidelity = measureRadialFidelity(mesh, ut, rA, opts);
  const topo = topologyMetric(
    { vertices: mesh.vertices, indices: mesh.indices },
    opts.weldToleranceMm ?? WELD_TOL_MM,
  );
  const watertight =
    topo.boundaryEdges === 0 &&
    topo.nonManifoldEdges === 0 &&
    topo.orientationMismatches === 0;
  return {
    fidelity,
    boundaryEdges: topo.boundaryEdges,
    nonManifoldEdges: topo.nonManifoldEdges,
    orientationMismatches: topo.orientationMismatches,
    watertight,
    certified: fidelity.certified && watertight,
  };
}
