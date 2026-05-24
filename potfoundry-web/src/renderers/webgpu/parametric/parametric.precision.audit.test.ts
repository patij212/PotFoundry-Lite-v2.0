/**
 * parametric.precision.audit.test.ts — Ridge precision audit (TDD red phase)
 *
 * Measurement instrument for the analytic-ridge-placement work
 * (docs/superpowers/plans/2026-05-24-analytic-ridge-placement.md).
 *
 * Each chain vertex placed by the parametric pipeline should lie exactly on a
 * feature ridge — equivalently, |∂r/∂u| at the vertex should be zero. The
 * existing pipeline uses sample-and-parabolic-refine (R46 + Bug #1), which
 * lands within sample-grid precision (~1/4096 U) but is NOT analytically zero.
 * Phantom anchors at column crossings are additionally placed by linear UV
 * interpolation, drifting further off-ridge for curved features.
 *
 * These two tests pin the two failure modes directly:
 *
 *   Test 1: Sample-based ridge finding (mimics what GPU re-snap does)
 *           leaves nonzero |∂r/∂u| at the ridge vertex.
 *
 *   Test 2: Linear interpolation between two adjacent-row ridge vertices
 *           lands the midpoint off-ridge (the phantom-anchor failure).
 *
 * Both tests assert |∂r/∂u| < 1e-9. Both are RED today; both turn GREEN once
 * the analytic Newton solver replaces sample-based placement.
 *
 * Run with:
 *   npx vitest run src/renderers/webgpu/parametric/parametric.precision.audit.test.ts --reporter=default
 *
 * Lives in a pure Vitest unit context — no GPU, no jsdom React tree. The
 * CPU style functions in src/geometry/styles.ts ARE the analytic surface;
 * CPU↔WGSL parity is a separate audit (see plan Phase 0.2).
 */
import { describe, it, expect } from 'vitest';
import {
    rOuterHarmonicRipple,
    rOuterSpiralRidges,
    rOuterWaveInterference,
} from '../../../geometry/styles';
import { TAU } from '../../../geometry/types';
import type { StyleOptions } from '../../../geometry/types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Target ridge precision: |∂r/∂u| in mm/U. After Newton placement, every
 *  chain vertex should be at or below this threshold. */
const RIDGE_PRECISION_THRESHOLD = 1e-9;

/** Central-difference step for the gradient evaluator (U-space). */
const FD_H = 1e-7;

/** Production probe-sample resolution (ROW_PROBE_SAMPLES in ParametricExportComputer). */
const ROW_PROBE_SAMPLES = 4096;

const R0 = 40;       // typical pot base radius (mm)
const H = 100;       // typical pot height (mm)

// Style evaluators we audit. Defaults are used (opts = {}).
type StyleEval = (theta: number, z: number, r0: number, H: number, opts: StyleOptions) => number;

interface Fixture {
    name: string;
    eval: StyleEval;
    /** Whether the dominant feature is a peak (true) or valley (false). For
     *  HarmonicRipple/SpiralRidges/WaveInterference the dominant ridge is a peak. */
    findPeak: boolean;
}

const FIXTURES: Fixture[] = [
    { name: 'HarmonicRipple', eval: rOuterHarmonicRipple, findPeak: true },
    { name: 'SpiralRidges', eval: rOuterSpiralRidges, findPeak: true },
    { name: 'WaveInterference', eval: rOuterWaveInterference, findPeak: true },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Evaluate r(u, t) using a CPU style function. */
function evalR(fn: StyleEval, u: number, t: number, opts: StyleOptions = {}): number {
    // Parametric pipeline U ∈ [0, 1] maps to theta = u * TAU. Wrap for safety.
    const uWrap = ((u % 1) + 1) % 1;
    return fn(uWrap * TAU, t, R0, H, opts);
}

/** Central-difference |∂r/∂u| at (u, t). */
function gradAbs(fn: StyleEval, u: number, t: number, opts: StyleOptions = {}): number {
    const rPlus = evalR(fn, u + FD_H, t, opts);
    const rMinus = evalR(fn, u - FD_H, t, opts);
    return Math.abs((rPlus - rMinus) / (2 * FD_H));
}

/**
 * Production-style ridge finder: dense sample of U at fixed t, pick the U
 * with maximum (or minimum) r. This mimics what the GPU row-probe + R46
 * re-snap does — finds the sample-grid point closest to the ridge.
 *
 * Returns the production-precision ridge U.
 */
function findRidgeBySampling(
    fn: StyleEval, t: number, findPeak: boolean, opts: StyleOptions = {},
    nSamples = ROW_PROBE_SAMPLES,
): number {
    let bestU = 0;
    let bestR = findPeak ? -Infinity : +Infinity;
    for (let i = 0; i < nSamples; i++) {
        const u = i / nSamples;
        const r = evalR(fn, u, t, opts);
        if (findPeak ? r > bestR : r < bestR) {
            bestR = r;
            bestU = u;
        }
    }
    // Parabolic sub-sample refinement (mimics Bug #1 / R46 final step)
    const du = 1 / nSamples;
    const rL = evalR(fn, bestU - du, t, opts);
    const rC = bestR;
    const rR = evalR(fn, bestU + du, t, opts);
    const denom = rL - 2 * rC + rR;
    let delta = 0;
    if (Math.abs(denom) > 1e-18) {
        delta = 0.5 * (rL - rR) / denom;
        delta = Math.max(-0.5, Math.min(0.5, delta));
    }
    return bestU + delta * du;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1 — Sample-based ridge finding leaves nonzero |∂r/∂u|
// ─────────────────────────────────────────────────────────────────────────────

describe('Failure mode 1: sample-based row-boundary ridge finding', () => {
    for (const f of FIXTURES) {
        it(`${f.name}: ridge found at t=50 via 4096-sample probe has |∂r/∂u| < ${RIDGE_PRECISION_THRESHOLD}`, () => {
            const t = 50;
            const uRidge = findRidgeBySampling(f.eval, t, f.findPeak);
            const g = gradAbs(f.eval, uRidge, t);
            console.log(
                `[precision-audit] ${f.name} row-boundary: ridge U=${uRidge.toFixed(8)} at t=${t}, ` +
                `|∂r/∂u|=${g.toExponential(3)} mm/U`,
            );
            expect(g).toBeLessThan(RIDGE_PRECISION_THRESHOLD);
        });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2 — Linear interpolation between two row-boundary ridge vertices
//          (the production phantom-anchor placement) is off-ridge at the midpoint
// ─────────────────────────────────────────────────────────────────────────────

describe('Failure mode 2: phantom anchor via linear interpolation between adjacent rows', () => {
    for (const f of FIXTURES) {
        it(`${f.name}: phantom anchor at t=(T1+T2)/2 has |∂r/∂u| < ${RIDGE_PRECISION_THRESHOLD}`, () => {
            // Pick two adjacent rows from a typical 64-row grid. Curvature
            // styles like HarmonicRipple have ripple in T; the ridge curves
            // through (u, t) space, so the linear midpoint between two
            // row-boundary ridge vertices is NOT on the ridge at t_mid.
            const NUM_T = 64;
            const rowStep = H / (NUM_T - 1);
            const t1 = 30;
            const t2 = t1 + rowStep;
            const tMid = (t1 + t2) / 2;

            // Find ridge at each row via sampling (production-precision)
            const u1 = findRidgeBySampling(f.eval, t1, f.findPeak);
            const u2 = findRidgeBySampling(f.eval, t2, f.findPeak);

            // Production phantom anchor: linear interpolation in U at t_mid.
            // (For multi-column crossings, this is exactly what
            // OuterWallTessellator.ts:1883-1884 computes: u_cross = u0 + alpha*(u1-u0).)
            const uPhantom = (u1 + u2) / 2;

            const g = gradAbs(f.eval, uPhantom, tMid);
            console.log(
                `[precision-audit] ${f.name} phantom anchor: ` +
                `t1=${t1} u1=${u1.toFixed(6)}, t2=${t2.toFixed(3)} u2=${u2.toFixed(6)} ` +
                `→ u_phantom=${uPhantom.toFixed(6)} at t_mid=${tMid.toFixed(3)}, ` +
                `|∂r/∂u|=${g.toExponential(3)} mm/U`,
            );
            expect(g).toBeLessThan(RIDGE_PRECISION_THRESHOLD);
        });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// Distribution summary across many (u, t) crossings — diagnostic only
// ─────────────────────────────────────────────────────────────────────────────

describe('Distribution: chain-column crossings across the (u, t) sheet', () => {
    for (const f of FIXTURES) {
        it(`${f.name}: scan max/p99 |∂r/∂u| across 1000 phantom-anchor positions`, () => {
            const NUM_T = 64;
            const rowStep = H / (NUM_T - 1);
            const grads: number[] = [];

            for (let row = 5; row < NUM_T - 5; row++) {
                const t1 = row * rowStep;
                const t2 = (row + 1) * rowStep;
                const u1 = findRidgeBySampling(f.eval, t1, f.findPeak);
                const u2 = findRidgeBySampling(f.eval, t2, f.findPeak);
                // Sample several crossings across this row band
                for (let k = 1; k <= 16; k++) {
                    const alpha = k / 17;
                    const tCross = t1 + alpha * (t2 - t1);
                    const uPhantom = u1 + alpha * (u2 - u1);
                    grads.push(gradAbs(f.eval, uPhantom, tCross));
                }
            }
            grads.sort((a, b) => a - b);
            const max = grads[grads.length - 1];
            const p99 = grads[Math.floor(grads.length * 0.99)];
            const p50 = grads[Math.floor(grads.length * 0.5)];
            const overThreshold = grads.filter(g => g >= RIDGE_PRECISION_THRESHOLD).length;

            console.log(
                `[precision-audit-dist] ${f.name}: n=${grads.length} phantom positions, ` +
                `max=${max.toExponential(3)}, p99=${p99.toExponential(3)}, p50=${p50.toExponential(3)}, ` +
                `over-threshold=${overThreshold}/${grads.length} (${(100 * overThreshold / grads.length).toFixed(1)}%)`,
            );
            // Pin the max — this fails today and confirms the magnitude of drift
            expect(max).toBeLessThan(RIDGE_PRECISION_THRESHOLD);
        });
    }
});
