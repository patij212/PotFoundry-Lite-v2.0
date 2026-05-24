/**
 * AnalyticRidgeSolver.ts — Style-aware analytic ridge placement.
 *
 * Given (styleId, opts, t, seedU, kind), returns the U where ∂r/∂u = 0 to
 * machine precision (limited by FD noise floor, ~1e-8 mm/U for typical
 * pottery dimensions). Replaces the sample-and-parabolic-refine pattern
 * used by the production pipeline's R46 + Bug #1 re-snap.
 *
 *   peak    → local maximum of r(u, t) at fixed t
 *   valley  → local minimum of r(u, t) at fixed t
 *
 * Architecture: thin wrapper over findExtremumNewton + getStyleFunction.
 * The CPU style functions in src/geometry/styles.ts are the source of truth
 * for ridge geometry. CPU↔WGSL parity is verified separately (Phase 0.2 of
 * the analytic-ridge-placement plan).
 */
import { findExtremumNewton } from '../../../math/numericRoot';
import { getStyleFunction } from '../../../geometry/styles';
import { TAU } from '../../../geometry/types';
import type { StyleId, StyleOptions } from '../../../geometry/types';

export interface SolveRidgeOptions {
    styleId: StyleId;
    opts: StyleOptions;
    /** Base radius at the relevant height (mm). */
    r0: number;
    /** Total pot height (mm). */
    H: number;
    /** Height of the row (mm). */
    t: number;
    /** Initial U guess (typically from coarse sampling or row probing). */
    seedU: number;
    kind: 'peak' | 'valley';
    /** Half-width of search window in U. Default 0.015 (matches Bug A regular re-snap cap). */
    searchHalfWidth?: number;
    /** Newton convergence tolerance on |∂r/∂u| (mm/U). Default 1e-9. */
    tolerance?: number;
    /** Max Newton iterations. Default 50. */
    maxIter?: number;
}

export interface SolveRidgeResult {
    /** Final U coordinate, wrapped to [0, 1). */
    u: number;
    /** |∂r/∂u| at the final U (the residual). */
    gradAbs: number;
    /** Newton iterations used. */
    iterations: number;
    /** True if Newton's |grad| tolerance was met. */
    converged: boolean;
}

/** Solve a single ridge placement. */
export function solveRidge(args: SolveRidgeOptions): SolveRidgeResult {
    const fn = getStyleFunction(args.styleId);
    // Closure over (t, r0, H, opts) — only u varies. Wrap u into [0, 1) and
    // convert to theta = u * TAU for the style function.
    const f = (u: number) => {
        const uW = ((u % 1) + 1) % 1;
        return fn(uW * TAU, args.t, args.r0, args.H, args.opts);
    };
    const r = findExtremumNewton(f, args.seedU, {
        kind: args.kind === 'peak' ? 'max' : 'min',
        tolerance: args.tolerance ?? 1e-9,
        maxIter: args.maxIter ?? 50,
        searchHalfWidth: args.searchHalfWidth ?? 0.015,
    });
    const uWrapped = ((r.u % 1) + 1) % 1;
    return {
        u: uWrapped,
        gradAbs: r.gradAbs,
        iterations: r.iterations,
        converged: r.converged,
    };
}

export interface BatchEntry {
    t: number;
    seedU: number;
    kind: 'peak' | 'valley';
    searchHalfWidth?: number;
    tolerance?: number;
}

/** Solve a batch of ridge placements (all for the same style). */
export function solveRidgesBatch(args: {
    styleId: StyleId;
    opts: StyleOptions;
    r0: number;
    H: number;
    entries: BatchEntry[];
}): SolveRidgeResult[] {
    return args.entries.map(e =>
        solveRidge({
            styleId: args.styleId,
            opts: args.opts,
            r0: args.r0,
            H: args.H,
            t: e.t,
            seedU: e.seedU,
            kind: e.kind,
            searchHalfWidth: e.searchHalfWidth,
            tolerance: e.tolerance,
        }),
    );
}
