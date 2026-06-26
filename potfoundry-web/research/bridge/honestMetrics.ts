// honestMetrics.ts — the HONEST quality + fidelity gate for a (u,t) mesh.
//
// This session (2026-06-26) found the project's default metrics MISLEAD on tangled/relief styles:
//   - chord-P99 is BLIND to under-tessellation — a mesh that mushes the relief has the SAME p99 as a crisp
//     one (both dominated by the shared near-C0 lattice/weave creases). The fidelity gap lives in the MEAN/RMS.
//   - %<20° DILUTES under refinement — a denser slivered mesh shows a LOWER %<20° as well-shaped interior
//     triangles swamp a fixed transition-fan sliver count. The honest sliver signal is the MIN ANGLE
//     (depth-invariant: ours ~2° vs SOTA 14–20° regardless of triangle count).
//
// So: score fidelity by RMS chord, slivers by minAngle. (p99 / %<20° are reported for context only.)
// See [[meshing-research]] (honest gates) + [[tessellation-knowledge]] (UV-metric blind spots).
import { perpendicular3DDeviation, type AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import { triangleQualityDistribution } from '../../src/fidelity/metrics';
import { liftUtToRadial } from './measure';

export interface HonestGate {
  triCount: number;
  /** Mean/RMS facet→surface chord (mm) — THE fidelity signal (captures under-tessellation; p99 does not). */
  rmsFidelityMm: number;
  /** Worst min-interior-angle (deg) — THE sliver signal (depth-invariant; %<20° dilutes under density). */
  minAngleDeg: number;
  /** Context only — p99 chord is blind to under-tessellation. */
  p99Mm: number;
  /** Context only — %<20° dilutes under refinement. */
  pctBelow20: number;
}

/** Lift a flat 2-stride (u,t) mesh to the radial surface and score it with the honest gates. */
export function honestGate(
  ut2: ArrayLike<number>,
  tris: ArrayLike<number>,
  rA: AnalyticRadiusFn,
  H: number,
  opts: { tolMm?: number; seamExclU?: number; denseN?: number } = {},
): HonestGate {
  const lifted = liftUtToRadial(Array.from(ut2 as ArrayLike<number>), rA, H);
  const indices = Uint32Array.from(tris as ArrayLike<number>);
  const dev = perpendicular3DDeviation({ vertices: lifted.vertices, indices }, lifted.utFlat, rA, {
    H, tolMm: opts.tolMm ?? 0.1, seamExclU: opts.seamExclU ?? 0, denseN: opts.denseN ?? 8,
  });
  const q = triangleQualityDistribution({ vertices: lifted.vertices, indices });
  return {
    triCount: indices.length / 3,
    rmsFidelityMm: dev.rmsDevMm,
    minAngleDeg: q.minAngleDeg,
    p99Mm: dev.p99DevMm,
    pctBelow20: q.pctBelow20,
  };
}
