/**
 * GpuRidgeSolver.ts — Batched Newton iteration on an async surface evaluator.
 *
 * Unlike AnalyticRidgeSolver (which uses CPU style functions for the surface
 * evaluator), this solver is generic over an async evaluator: it accepts a
 * function that maps a flat (u, t, layer) probe array to a flat (x, y, z)
 * position array. In production the evaluator is the WebGPU compute pipeline
 * (`ParametricExportComputer.evaluatePoints`); in tests it can be mocked.
 *
 * Why this exists: when Newton is run against CPU style functions and the CPU
 * surface drifts from the WGSL surface (the actual rendered output), Newton
 * lands at the CPU peak while the chain detector matched the GPU peak. Result:
 * Newton displaces every chain vertex by the parity drift, breaking chain
 * coherence. By using the GPU evaluator directly, we eliminate the parity
 * question entirely — Newton iterates on exactly the surface that's rendered.
 *
 * Algorithm: 4th-order central-difference Newton with concavity-aware
 * fallback, per-vertex half-width clip, and per-vertex convergence tracking.
 *
 *   Per iteration:
 *     1. Build probe array: 5 points per active vertex
 *        (u-2h, u-h, u, u+h, u+2h) × (t, layer)
 *     2. await evaluator(probes)  — single GPU dispatch
 *     3. Extract radii (sqrt(x²+y²)) for each point
 *     4. 4th-order FD gradient and Hessian per vertex
 *     5. Newton step with concavity fallback, clipped to halfWidth
 *     6. Mark converged if |grad| ≤ tolerance
 *
 *   Loop until all converged or maxIter reached.
 *
 * Cost: O(maxIter) GPU dispatches, each evaluating ~5N points. For N=35k
 * vertices and maxIter=10, total ~10 dispatches × 175k points each — under
 * 1s on a modern GPU.
 */

export interface GpuRidgeSeed {
    /** Current U coordinate (will be updated in place if requested). */
    u: number;
    /** T coordinate (held constant during the solve). */
    t: number;
    /** 'peak' = local max radius, 'valley' = local min. */
    kind: 'peak' | 'valley';
    /** Maximum displacement from initial U. Newton steps are clipped here. */
    halfWidth: number;
}

export interface GpuRidgeResult {
    /** Final U coordinate. */
    u: number;
    /** |∂r/∂u| at the final U (FD-estimated; this is the residual). */
    gradAbs: number;
    /** Number of Newton iterations consumed. */
    iterations: number;
    /** True if gradAbs ≤ tolerance at termination. */
    converged: boolean;
}

export interface GpuRidgeOptions {
    /** Convergence threshold on |∂r/∂u| (mm/U). Default 1e-7. */
    tolerance?: number;
    /** Max Newton iterations. Default 15 (each is one GPU dispatch). */
    maxIter?: number;
    /**
     * Central-difference step in U. Default 1e-4 (tuned for f32 GPU eval).
     *
     * Trade-off:
     *   - Smaller h → finer derivative truncation error, but amplifies f32
     *     cancellation noise. With f32 precision (~6e-6 mm at r=50mm) and
     *     style Hessians ~1e6, the Hessian-stencil signal (∝ h²) drops below
     *     noise floor when h < ~2.5e-5.
     *   - Larger h → less FD noise but more truncation error, and h must stay
     *     below the narrowest style feature half-period (~1e-3 for typical
     *     pottery styles).
     *
     * 1e-4 sits at SNR≈1500 for Hessian, with 1% of the narrowest feature
     * half-period in step size.
     */
    fdStep?: number;
    /** Layer index passed in probe verts (3rd float). Default 0 (outer wall). */
    layer?: number;
}

export type AsyncEvaluator = (probeVerts: Float32Array) => Promise<Float32Array>;

/**
 * Solve N ridge placements via batched GPU Newton iteration.
 *
 * @param seeds   Initial guesses, one per vertex
 * @param evaluator Async function mapping (u, t, layer)[] -> (x, y, z)[]
 * @param options
 * @returns       Per-vertex final position + convergence
 */
export async function gpuNewtonRidge(
    seeds: GpuRidgeSeed[],
    evaluator: AsyncEvaluator,
    options: GpuRidgeOptions = {},
): Promise<GpuRidgeResult[]> {
    const tol = options.tolerance ?? 1e-7;
    const maxIter = options.maxIter ?? 15;
    const h = options.fdStep ?? 1e-4;
    const layer = options.layer ?? 0;
    const n = seeds.length;
    if (n === 0) return [];

    // Per-vertex mutable state. Track best-so-far position separately from
    // the current Newton-iterate so a diverging trajectory can be rolled back
    // to its best point instead of returning the divergent terminal one.
    const u = new Float64Array(n);
    const seedU = new Float64Array(n);
    const halfWidth = new Float64Array(n);
    const isPeak = new Uint8Array(n);
    const converged = new Uint8Array(n);
    const gradAbs = new Float64Array(n);
    const iterations = new Uint16Array(n);
    const bestU = new Float64Array(n);
    const bestGrad = new Float64Array(n);
    const stalledIters = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        u[i] = seeds[i].u;
        seedU[i] = seeds[i].u;
        bestU[i] = seeds[i].u;
        bestGrad[i] = Infinity;
        halfWidth[i] = seeds[i].halfWidth;
        isPeak[i] = seeds[i].kind === 'peak' ? 1 : 0;
        gradAbs[i] = Infinity;
    }
    /** Vertex is considered "stuck" if grad doesn't improve for this many iters. */
    const STALL_PATIENCE = 3;

    // Probe buffer reused across iterations: 5 probes per vertex × 3 floats.
    // Even after a vertex converges we keep its slot to preserve indexing —
    // we just skip the update step for it. This keeps the GPU dispatch shape
    // uniform across iterations (cheap to over-evaluate; expensive to repack).
    const probeBuf = new Float32Array(n * 5 * 3);

    const wrap = (uu: number) => ((uu % 1) + 1) % 1;

    for (let iter = 0; iter < maxIter; iter++) {
        // Pack probes: for each vertex, [u-2h, u-h, u, u+h, u+2h]
        for (let i = 0; i < n; i++) {
            const t = seeds[i].t;
            const u0 = u[i];
            for (let k = 0; k < 5; k++) {
                const delta = (k - 2) * h; // k=0 → -2h, k=4 → +2h
                const baseIdx = (i * 5 + k) * 3;
                probeBuf[baseIdx] = wrap(u0 + delta);
                probeBuf[baseIdx + 1] = t;
                probeBuf[baseIdx + 2] = layer;
            }
        }

        const positions = await evaluator(probeBuf);

        // Per-vertex Newton step
        let allConverged = true;
        for (let i = 0; i < n; i++) {
            if (converged[i]) continue;

            // Extract radii for this vertex's 5 probes
            const baseOff = i * 5 * 3;
            const radii = new Array<number>(5);
            for (let k = 0; k < 5; k++) {
                const off = baseOff + k * 3;
                const x = positions[off];
                const y = positions[off + 1];
                radii[k] = Math.sqrt(x * x + y * y);
            }
            const fmm = radii[0];
            const fm = radii[1];
            const fc = radii[2];
            const fp = radii[3];
            const fpp = radii[4];

            // 4th-order central differences
            const grad = (-fpp + 8 * fp - 8 * fm + fmm) / (12 * h);
            const hess = (-fpp + 16 * fp - 30 * fc + 16 * fm - fmm) / (12 * h * h);

            const g = Math.abs(grad);
            gradAbs[i] = g;
            iterations[i] = iter + 1;

            // Track best position seen for this vertex. If Newton diverges
            // we fall back to this on termination.
            if (g < bestGrad[i]) {
                bestGrad[i] = g;
                bestU[i] = u[i];
                stalledIters[i] = 0;
            } else {
                stalledIters[i]++;
            }

            if (g <= tol) {
                converged[i] = 1;
                continue;
            }

            // Bail if Newton has been making no progress for several iterations.
            // The vertex is recorded as non-converged, and the result will use
            // the best position seen rather than the latest oscillation point.
            if (stalledIters[i] >= STALL_PATIENCE) {
                converged[i] = 1; // mark inactive so we skip in future iters
                continue;
            }

            // Newton step with concavity fallback. For peak: want grad=0 with
            // hess<0; if hess>0 we're in a basin → step in ascent direction.
            // For valley: want hess>0; if hess<0 we're on a hill → step in
            // descent direction.
            let step: number;
            const wantHessSign = isPeak[i] ? -1 : +1;
            const hessTooFlat = Math.abs(hess) < 1e-18;
            const wrongConcavity = (wantHessSign === -1 && hess > 0) ||
                                   (wantHessSign === +1 && hess < 0);
            if (hessTooFlat || wrongConcavity) {
                // Fallback: small step in the requested-extremum direction
                const direction = isPeak[i] ? +1 : -1;
                const magnitude = Math.min(halfWidth[i] * 0.1, Math.abs(grad) * 0.001);
                step = direction * Math.sign(grad) * magnitude;
            } else {
                step = -grad / hess;
            }

            // Clip step to halfWidth around seed
            let uNext = u[i] + step;
            const dist = uNext - seedU[i];
            if (dist > halfWidth[i]) uNext = seedU[i] + halfWidth[i];
            else if (dist < -halfWidth[i]) uNext = seedU[i] - halfWidth[i];

            // Apply
            u[i] = uNext;
            allConverged = false;
        }

        if (allConverged) break;
    }

    // Build results array. For vertices that didn't reach `tol`, return the
    // best-so-far position (lowest gradient observed across all iterations)
    // rather than the latest Newton iterate (which may be a divergent point
    // at the half-width boundary). The reported `gradAbs` corresponds to the
    // returned U, so downstream code can apply its own acceptance threshold.
    const out: GpuRidgeResult[] = new Array(n);
    for (let i = 0; i < n; i++) {
        const trulyConverged = gradAbs[i] <= tol;
        const useBest = bestGrad[i] < gradAbs[i];
        out[i] = {
            u: wrap(useBest ? bestU[i] : u[i]),
            gradAbs: useBest ? bestGrad[i] : gradAbs[i],
            iterations: iterations[i],
            converged: trulyConverged,
        };
    }
    return out;
}
