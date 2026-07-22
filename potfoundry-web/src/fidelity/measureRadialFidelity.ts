/**
 * measureRadialFidelity.ts — the UNIFIED, shape-agnostic (single-valued radial)
 * fidelity ruler. ONE entry that measures a mesh against the EXACT ANALYTIC surface
 * `rA(θ,z)` and returns a MAX-first report you can certify on directly.
 *
 * It composes the project's already-correct pieces into the discipline the
 * measurement compendium prescribes (research/MEASUREMENT-COMPENDIUM.md):
 *   - distance: the honest PERPENDICULAR-3D chord+vertex metric
 *     (perpendicular3DDeviation) driven by the GLOBALLY-CORRECT projector
 *     (buildRadialSurfaceProjector) — so the reported chord MAX is free of the
 *     single-seed wrong-well overstatement (~7× on tangled lattices), and the
 *     percentiles are EXACT (sorted), never histogram-quantized;
 *   - quality: the min-angle distribution (triangleQualityDistribution) — the
 *     depth-INVARIANT sliver signal (minAngleDeg), with %<20° reported as CONTEXT;
 *   - verdict: certified ⇔ MAX ≤ tol AND all samples finite. Certify on MAX, never
 *     p99 (p99 hides the single worst facet / scale-tip cone).
 *
 * WATERTIGHTNESS is intentionally NOT bundled: it is a property of the whole CLOSED
 * solid, while the fidelity distance is measured on the OUTER WALL (surfaceId 0)
 * only. Call `topologyMetric` (metrics.ts — the cap-safe by-index ruler) on the full
 * closed mesh for that gate; a fully-certified export is
 * `report.certified && topoWatertight`.
 *
 * SHAPE SCOPE: single-valued radial `rA` (the same scope as the projector and the
 * perpendicular metric). MULTI-VALUED (over/under weave/braid) walls need a
 * multi-sheet / post-warp reference — out of scope here (see the compendium §3).
 *
 * Pure CPU. Additive: composes existing exports; changes none of them.
 */
import {
  perpendicular3DDeviation,
  type AnalyticDevOpts,
  type AnalyticRadiusFn,
} from './analyticSurfaceGate';
import { buildRadialSurfaceProjector } from './radialSurfaceProjector';
import { triangleQualityDistribution } from './metrics';
import type { MeshView } from './types';

/** Global-correct projector controls (see buildRadialSurfaceProjector). */
export interface GlobalProjectorConfig {
  nTheta?: number;
  nZ?: number;
  seedTopK?: number;
  zMin?: number;
  zMax?: number;
}

export interface RadialFidelityOptions extends AnalyticDevOpts {
  /**
   * Use the globally-correct projector for the chord channel. `true` (DEFAULT) builds
   * a buildRadialSurfaceProjector from `rA` — the honest ruler. `false` falls back to
   * the single-seed projector (kept for A/B against the legacy overstatement). An
   * object passes resolution/seed controls through.
   */
  globalProjector?: boolean | GlobalProjectorConfig;
}

export interface RadialFidelityReport {
  // ── distance (mm), MAX-first ──
  /** max(chordMaxMm, vertexMaxMm) — THE certification number. */
  maxMm: number;
  /** Worst flat-facet interior → surface distance (chord/tessellation error). */
  chordMaxMm: number;
  /** 99th-percentile deviation (EXACT sorted; diagnosis only — never certify on it). */
  chordP99Mm: number;
  /** RMS deviation — the under-tessellation signal. */
  chordRmsMm: number;
  /** Worst vertex → surface distance (placement error; ≈ f32 floor when correct). */
  vertexMaxMm: number;
  // ── quality ──
  /** Worst min interior angle (deg) — the depth-invariant sliver signal. */
  minAngleDeg: number;
  /** % of triangles below 20° — CONTEXT ONLY (dilutes under density). */
  pctBelow20: number;
  // ── accounting ──
  wallTriangles: number;
  samples: number;
  /** Non-finite samples skipped (>0 ⇒ DO NOT gate; the reference is untrusted here). */
  nonFiniteCount: number;
  // ── tracked (not gated) exclusion bands (mm) ──
  seamBandMaxMm: number;
  riserBandMaxMm: number;
  creaseBandMaxMm: number;
  // ── verdict ──
  tolMm: number;
  /** SURFACE-FIDELITY certified: MAX ≤ tol AND all samples finite. AND this with a
   *  watertight topologyMetric on the full closed mesh for a full export certificate. */
  certified: boolean;
}

/**
 * Measure `mesh` (with its parallel pre-warp `ut` = (u,t,surfaceId) stash) against
 * the exact analytic radial surface `rA`, MAX-first. See the module doc for scope.
 */
export function measureRadialFidelity(
  mesh: MeshView,
  ut: ArrayLike<number>,
  rA: AnalyticRadiusFn,
  opts: RadialFidelityOptions,
): RadialFidelityReport {
  const gp = opts.globalProjector ?? true;
  let chordProjector: ((x: number, y: number, z: number) => number) | undefined;
  if (gp) {
    const cfg: GlobalProjectorConfig = typeof gp === 'object' ? gp : {};
    const projector = buildRadialSurfaceProjector(rA, {
      H: opts.H,
      zMin: cfg.zMin ?? 0,
      zMax: cfg.zMax ?? opts.H,
      nTheta: cfg.nTheta,
      nZ: cfg.nZ,
      seedTopK: cfg.seedTopK,
    });
    chordProjector = (x, y, z) => projector.project(x, y, z).dist;
  }

  const dev = perpendicular3DDeviation(mesh, ut, rA, { ...opts, chordProjector });
  const q = triangleQualityDistribution({ vertices: mesh.vertices, indices: mesh.indices });

  const maxMm = Math.max(dev.chordMaxMm, dev.vertexMaxMm);
  // Require that a wall was actually measured: a mesh with zero outer-wall (surfaceId
  // 0) samples reads maxMm=0 and would otherwise certify VACUOUSLY ("faithful" with
  // nothing measured). An absent wall is not a faithful wall.
  const certified = dev.samples > 0 && dev.nonFiniteCount === 0 && maxMm <= opts.tolMm;

  return {
    maxMm,
    chordMaxMm: dev.chordMaxMm,
    chordP99Mm: dev.p99DevMm,
    chordRmsMm: dev.rmsDevMm,
    vertexMaxMm: dev.vertexMaxMm,
    minAngleDeg: q.minAngleDeg,
    pctBelow20: q.pctBelow20,
    wallTriangles: dev.wallTriangles,
    samples: dev.samples,
    nonFiniteCount: dev.nonFiniteCount,
    seamBandMaxMm: dev.seamBandMaxMm,
    riserBandMaxMm: dev.riserBandMaxMm,
    creaseBandMaxMm: dev.creaseBandMaxMm,
    tolMm: opts.tolMm,
    certified,
  };
}
