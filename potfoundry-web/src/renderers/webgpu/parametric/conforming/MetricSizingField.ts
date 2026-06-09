/**
 * MetricSizingField.ts — Curvature-driven target edge-length field over the
 * outer-wall parameter domain.
 *
 * At each node of a `resU × resT` grid the field computes a target physical
 * edge length `h_iso` from the local principal curvature via the sagitta law
 * (so chord error stays under `maxSagMm`), clamps it to `[minEdge, maxEdge]`,
 * then applies a Lipschitz grading pass so neighbouring targets never differ by
 * more than `gradeRatio` (smooth element-size transitions, no abrupt jumps).
 * `edgeLength(u,t)` reads the graded grid by bilinear interpolation (u
 * periodic, t clamped).
 *
 * @module conforming/MetricSizingField
 */

import type { SurfaceSampler } from './SurfaceSampler';
import { principalCurvatureMax, metricStepsForSampler } from './SurfaceMetricTensor';

/** Configuration for the sizing field. */
export interface SizingOptions {
  /** Maximum allowed chord sagitta (mm). Smaller → finer mesh. */
  maxSagMm: number;
  /** Lower clamp on target edge length (mm). */
  minEdgeMm: number;
  /** Upper clamp on target edge length (mm). */
  maxEdgeMm: number;
  /** Max ratio between adjacent targets (Lipschitz grading; ≥ 1). */
  gradeRatio: number;
  /** Grid resolution in u (number of nodes). */
  resU: number;
  /** Grid resolution in t (number of nodes). */
  resT: number;
  /**
   * Global multiplier on the curvature-derived target edge length, applied
   * BEFORE the min/max clamp. >1 coarsens uniformly (fewer triangles); the
   * `maxEdgeMm`/`minEdgeMm` clamps still bound the result, so the sag floor
   * (`maxSagMm` via the sagitta law, clamped at `minEdgeMm`) is never violated.
   * Defaults to 1 (no scaling). Used by the triangle-budget search (Task 2).
   */
  targetScale?: number;
  /**
   * Optional ANALYTIC curvature LOWER BOUND `κ_floor(u,t)` (mm⁻¹). When provided,
   * `κ = max(κ_sampler, κ_floor)` before the sagitta law — so a style that knows
   * its true curvature analytically (e.g. SuperformulaBlossom's steep petal
   * flanks, which the band-limited 256² sampler under-estimates) refines
   * correctly without a finer GPU sampler. Omit for the pure sampler estimate
   * (byte-identical). Smooth regions where the floor ≤ the sampler are unaffected.
   */
  curvatureFloor?: (u: number, t: number) => number;
  /**
   * Optional UPPER bound on κ (mm⁻¹). Caps the sagitta refinement so an
   * unbounded-curvature CUSP (e.g. the n1<1 Gielis tip) cannot force minEdge and
   * waste the triangle budget on an irreducible point. Omit for no cap.
   */
  maxKappa?: number;
}

/**
 * Precompute `h_iso` on a `resU × resT` grid (physical mm), Lipschitz-graded,
 * then sample by (u,t).
 */
export class MetricSizingField {
  private readonly grid: Float64Array;
  private readonly resU: number;
  private readonly resT: number;

  constructor(s: SurfaceSampler, opts: SizingOptions) {
    this.resU = opts.resU;
    this.resT = opts.resT;
    this.grid = this.buildGrid(s, opts);
  }

  /** Index into the row-major grid (i = u node, j = t node). */
  private idx(i: number, j: number): number {
    return j * this.resU + i;
  }

  /** Compute raw sagitta-law targets, then grade to a Lipschitz fixpoint. */
  private buildGrid(s: SurfaceSampler, opts: SizingOptions): Float64Array {
    const { resU, resT } = opts;
    const grid = new Float64Array(resU * resT);

    // De-noised curvature: size the finite-difference steps to ~one grid cell of
    // the (possibly discrete) sampler, not a fixed sub-quantization gap.
    const { hu, ht } = metricStepsForSampler(s);
    const scale = opts.targetScale && opts.targetScale > 0 ? opts.targetScale : 1;

    // Raw targets from curvature (sagitta law) + optional global scale + clamp.
    for (let j = 0; j < resT; j++) {
      const t = resT > 1 ? j / (resT - 1) : 0;
      for (let i = 0; i < resU; i++) {
        const u = i / resU; // u is periodic: node resU coincides with node 0
        let kappa = Math.max(principalCurvatureMax(s, u, t, hu, ht), 1e-6);
        // Analytic curvature lower bound (the sampler κ is band-limited on steep
        // flanks). max() so smooth regions are unchanged.
        if (opts.curvatureFloor) kappa = Math.max(kappa, opts.curvatureFloor(u, t));
        // Cap κ so an unbounded-curvature cusp (n1<1 tip) can't force minEdge.
        if (opts.maxKappa && opts.maxKappa > 0) kappa = Math.min(kappa, opts.maxKappa);
        // sagitta: sag ≈ h^2·κ/8 ⇒ h = sqrt(8·maxSag/κ)
        let h = Math.sqrt((8 * opts.maxSagMm) / kappa);
        // Budget scale coarsens uniformly; the clamp below still enforces the
        // sag floor (minEdgeMm) so a large scale can never violate sag.
        h *= scale;
        h = Math.min(opts.maxEdgeMm, Math.max(opts.minEdgeMm, h));
        grid[this.idx(i, j)] = h;
      }
    }

    this.gradeLipschitz(grid, opts);
    return grid;
  }

  /**
   * Iterate `h[i] = min(h[i], gradeRatio · h[neighbour])` over all 4-neighbour
   * edges (u periodic, t clamped) until no node changes — the Lipschitz
   * grading fixpoint. Monotonically decreasing and bounded below by minEdge, so
   * it always terminates.
   */
  private gradeLipschitz(grid: Float64Array, opts: SizingOptions): void {
    const { resU, resT, gradeRatio } = opts;
    const maxIters = (resU + resT) * 4 + 8;
    for (let iter = 0; iter < maxIters; iter++) {
      let changed = false;
      for (let j = 0; j < resT; j++) {
        for (let i = 0; i < resU; i++) {
          const here = this.idx(i, j);
          let h = grid[here];
          // u neighbours (periodic wrap).
          const iL = (i - 1 + resU) % resU;
          const iR = (i + 1) % resU;
          h = Math.min(h, gradeRatio * grid[this.idx(iL, j)]);
          h = Math.min(h, gradeRatio * grid[this.idx(iR, j)]);
          // t neighbours (clamped — no wrap).
          if (j > 0) h = Math.min(h, gradeRatio * grid[this.idx(i, j - 1)]);
          if (j < resT - 1) h = Math.min(h, gradeRatio * grid[this.idx(i, j + 1)]);
          if (h < grid[here] - 1e-12) {
            grid[here] = h;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
  }

  /** Target physical edge length (mm) at (u,t). Bilinear, u periodic, t clamped. */
  edgeLength(u: number, t: number): number {
    const { resU, resT } = this;
    // u wraps into [0,1).
    let uw = u - Math.floor(u);
    if (uw === 1) uw = 0;
    const tc = Math.min(1, Math.max(0, t));

    const fu = uw * resU; // node spacing in u is 1/resU (periodic)
    const i0 = Math.floor(fu) % resU;
    const i1 = (i0 + 1) % resU;
    const au = fu - Math.floor(fu);

    const ft = resT > 1 ? tc * (resT - 1) : 0;
    let j0 = Math.floor(ft);
    if (j0 >= resT - 1) j0 = Math.max(0, resT - 2);
    const j1 = Math.min(resT - 1, j0 + 1);
    const at = resT > 1 ? ft - j0 : 0;

    const h00 = this.grid[this.idx(i0, j0)];
    const h10 = this.grid[this.idx(i1, j0)];
    const h01 = this.grid[this.idx(i0, j1)];
    const h11 = this.grid[this.idx(i1, j1)];
    const top = h00 * (1 - au) + h10 * au;
    const bot = h01 * (1 - au) + h11 * au;
    return top * (1 - at) + bot * at;
  }

  /** Test-only accessor: the graded grid (row-major, length resU·resT). */
  debugGrid(): Float64Array {
    return this.grid;
  }
}
