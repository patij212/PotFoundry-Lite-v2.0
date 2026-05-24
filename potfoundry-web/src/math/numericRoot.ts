/**
 * numericRoot.ts — Generic numerical extremum solver.
 *
 * Finds a local maximum or minimum of a scalar 1D function via Newton iteration
 * on the central-difference gradient. Uses a 4th-order central-difference
 * stencil for the gradient and a 4th-order stencil for the Hessian:
 *
 *   ∂f/∂u   ≈ (−f(u+2h) + 8f(u+h) − 8f(u−h) + f(u−2h)) / (12h)
 *   ∂²f/∂u² ≈ (−f(u+2h) + 16f(u+h) − 30f(u) + 16f(u−h) − f(u−2h)) / (12h²)
 *
 * Each Newton step is u ← u − f'(u) / f''(u). The step is:
 *   1. Sign-flipped if the local concavity disagrees with the requested kind
 *      (e.g. seeking 'max' on an upward-curving region — fall back to gradient
 *      ascent in that case).
 *   2. Clipped so |u − seed| ≤ searchHalfWidth (prevents migrating to a
 *      neighbouring extremum).
 *   3. Rejected if it causes gradient magnitude to grow by 10× (divergence
 *      guard — bail with last known good).
 *
 * Convergence: |∂f/∂u| < tolerance OR maxIter exhausted.
 *
 * Intended for placing chain vertices on analytic feature ridges (peaks =
 * radius maxima, valleys = radius minima). The convergence target of 1e-12
 * is well below f64 epsilon for typical pottery dimensions.
 */

export interface NewtonOptions {
    /** 'max' to find a local maximum, 'min' to find a local minimum. */
    kind: 'max' | 'min';
    /** Convergence threshold on |∂f/∂u|. Default 1e-12. */
    tolerance?: number;
    /** Max Newton iterations. Default 50. */
    maxIter?: number;
    /** Hard cap on |u − seed|. Newton steps that exceed this are clipped. Default 0.05. */
    searchHalfWidth?: number;
    /** Central-difference step in U. Default 1e-7 (good balance for f64). */
    fdStep?: number;
}

export interface NewtonResult {
    /** Final U where the search terminated. */
    u: number;
    /** f(u) at the final U. */
    fValue: number;
    /** |∂f/∂u| at the final U (the residual). */
    gradAbs: number;
    /** Iterations used (0..maxIter). */
    iterations: number;
    /** True if gradAbs ≤ tolerance at termination. */
    converged: boolean;
}

export function findExtremumNewton(
    f: (u: number) => number,
    seed: number,
    opts: NewtonOptions,
): NewtonResult {
    const tol = opts.tolerance ?? 1e-12;
    const maxIter = opts.maxIter ?? 50;
    const halfWidth = opts.searchHalfWidth ?? 0.05;
    const h = opts.fdStep ?? 1e-7;
    const wantMax = opts.kind === 'max';

    let u = seed;
    let lastGrad = Infinity;

    // Helper: 4th-order central-difference gradient and Hessian at u.
    // Returns [grad, hess, fCenter]. Caller is responsible for clamping u to
    // a domain where f is smooth.
    const stencil = (uu: number): [number, number, number] => {
        const fc = f(uu);
        const fp = f(uu + h);
        const fm = f(uu - h);
        const fpp = f(uu + 2 * h);
        const fmm = f(uu - 2 * h);
        const grad = (-fpp + 8 * fp - 8 * fm + fmm) / (12 * h);
        const hess = (-fpp + 16 * fp - 30 * fc + 16 * fm - fmm) / (12 * h * h);
        return [grad, hess, fc];
    };

    let iter = 0;
    for (; iter < maxIter; iter++) {
        const [grad, hess, fc] = stencil(u);
        lastGrad = Math.abs(grad);

        if (lastGrad <= tol) {
            return { u, fValue: fc, gradAbs: lastGrad, iterations: iter, converged: true };
        }

        // Newton step: solve hess * du = -grad
        let step: number;
        const wrongConcavity = (wantMax && hess > 0) || (!wantMax && hess < 0);
        const hessTooFlat = Math.abs(hess) < 1e-18;

        if (wrongConcavity || hessTooFlat) {
            // Fallback: small gradient-direction step toward the requested extremum.
            // ascent for 'max', descent for 'min'.
            const direction = wantMax ? +1 : -1;
            const magnitude = Math.min(halfWidth * 0.1, Math.abs(grad) * 0.01);
            step = direction * Math.sign(grad) * magnitude;
        } else {
            step = -grad / hess;
        }

        // Clip to search half-width
        let uNext = u + step;
        const dist = uNext - seed;
        if (dist > halfWidth) uNext = seed + halfWidth;
        else if (dist < -halfWidth) uNext = seed - halfWidth;

        // Divergence guard — if the next gradient is much larger, bail
        const gNext = stencil(uNext)[0];
        if (Math.abs(gNext) > Math.abs(grad) * 10) {
            return { u, fValue: fc, gradAbs: lastGrad, iterations: iter, converged: false };
        }

        u = uNext;
    }
    // Final residual check at termination
    const [gradFinal, , fcFinal] = stencil(u);
    return {
        u,
        fValue: fcFinal,
        gradAbs: Math.abs(gradFinal),
        iterations: iter,
        converged: Math.abs(gradFinal) <= tol,
    };
}
