/**
 * measureProjectorMax.ts — a LEAN, MAX-first mesh→surface distance ruler.
 *
 * The one-sided Hausdorff (mesh → exact analytic surface) MAX, computed by the
 * GLOBALLY-CORRECT radial projector (buildRadialSurfaceProjector) alone: vertices for the
 * placement channel, triangle centroid + edge midpoints for the flat-facet chord channel.
 * NO per-facet coarse global search — that is the ~3.6ms/triangle cost inside
 * measureRadialFidelity / perpendicular3DDeviation that makes whole-mesh production-scale
 * measurement infeasible (measured: 169s for a 47k-tri wall ⇒ ~9h at 9M tris). This scales
 * to multi-million-triangle export meshes at ~project() throughput.
 *
 * Shape scope = single-valued radial `rA` (same as the projector). The export emitters place
 * vertices exactly on rA (measured vertexMax ≈ f32 floor), so this reads the honest
 * tessellation error as chordMax. Designed cliffs are MEASURED, never excluded
 * (feedback_export_standard). Certify on `maxMm`; AND it with a watertight topology check on
 * the full closed solid for a complete export certificate.
 *
 * Pure CPU. Additive: composes existing exports, changes none of them.
 */
import { buildRadialSurfaceProjector } from './radialSurfaceProjector';
import type { AnalyticRadiusFn } from './analyticSurfaceGate';
import type { MeshView } from './types';

export interface ProjectorMaxOptions {
  /** Wall height (mm). */
  H: number;
  /** Certification tolerance (mm); default 0.01. */
  tolMm?: number;
  /** Global projector grid resolution (default 1024 × 512). */
  nTheta?: number;
  nZ?: number;
  /** Gauss-Newton polish cap per project() (default 8; on-surface vertices converge fast). */
  maxIter?: number;
  zMin?: number;
  zMax?: number;
}

export interface ProjectorMaxReport {
  /** max(vertexMax, chordMax) — THE certification number. */
  maxMm: number;
  /** Worst vertex → surface distance (placement; ≈ f32 floor when on-surface). */
  vertexMaxMm: number;
  /** Worst centroid/edge-midpoint → surface distance (flat-facet tessellation chord). */
  chordMaxMm: number;
  /** 99th-percentile over all samples (EXACT sorted; diagnosis only — never certify on it). */
  p99Mm: number;
  samples: number;
  /** Non-finite samples skipped (>0 ⇒ do not gate; the reference is untrusted here). */
  nonFiniteCount: number;
  tolMm: number;
  /** maxMm ≤ tol AND all samples finite. AND this with a watertight full-solid check. */
  certified: boolean;
}

export function measureProjectorMax(
  mesh: MeshView,
  rA: AnalyticRadiusFn,
  opts: ProjectorMaxOptions,
): ProjectorMaxReport {
  const tolMm = opts.tolMm ?? 0.01;
  const proj = buildRadialSurfaceProjector(rA, {
    H: opts.H,
    zMin: opts.zMin ?? 0,
    zMax: opts.zMax ?? opts.H,
    nTheta: opts.nTheta ?? 1024,
    nZ: opts.nZ ?? 512,
    maxIter: opts.maxIter ?? 8,
  });
  const V = mesh.vertices;
  const I = mesh.indices;
  const nV = V.length / 3;
  const nT = I.length / 3;
  const dists = new Float64Array(nV + 4 * nT);
  let di = 0;
  let vertexMax = 0;
  let chordMax = 0;
  let nonFinite = 0;

  // Placement channel — each unique vertex projected once.
  for (let i = 0; i < nV; i++) {
    const d = proj.project(V[3 * i], V[3 * i + 1], V[3 * i + 2]).dist;
    if (!Number.isFinite(d)) {
      nonFinite++;
      continue;
    }
    if (d > vertexMax) vertexMax = d;
    dists[di++] = d;
  }
  // Chord channel — centroid + 3 edge midpoints (catch off-centroid corner/edge spikes the
  // centroid alone understates near a feature).
  for (let t = 0; t < nT; t++) {
    const a = I[3 * t], b = I[3 * t + 1], c = I[3 * t + 2];
    const ax = V[3 * a], ay = V[3 * a + 1], az = V[3 * a + 2];
    const bx = V[3 * b], by = V[3 * b + 1], bz = V[3 * b + 2];
    const cx = V[3 * c], cy = V[3 * c + 1], cz = V[3 * c + 2];
    const pts: readonly [number, number, number][] = [
      [(ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3],
      [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2],
      [(bx + cx) / 2, (by + cy) / 2, (bz + cz) / 2],
      [(cx + ax) / 2, (cy + ay) / 2, (cz + az) / 2],
    ];
    for (const [x, y, z] of pts) {
      const d = proj.project(x, y, z).dist;
      if (!Number.isFinite(d)) {
        nonFinite++;
        continue;
      }
      if (d > chordMax) chordMax = d;
      dists[di++] = d;
    }
  }

  const sorted = dists.subarray(0, di).slice().sort();
  const p99 = di > 0 ? sorted[Math.min(di - 1, Math.floor(di * 0.99))] : NaN;
  const maxMm = Math.max(vertexMax, chordMax);
  return {
    maxMm,
    vertexMaxMm: vertexMax,
    chordMaxMm: chordMax,
    p99Mm: p99,
    samples: di,
    nonFiniteCount: nonFinite,
    tolMm,
    certified: nonFinite === 0 && maxMm <= tolMm,
  };
}
