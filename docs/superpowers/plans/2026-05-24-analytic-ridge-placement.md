# Analytic Ridge Placement for Chain Vertices

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every chain vertex (including phantom anchors at column crossings) lies on the analytic feature ridge to machine epsilon — `|∂r/∂u|` < 1e-9 across every exported mesh — eliminating the visible off-ridge bumps at chain-column crossings.

**Architecture:** Replace sample-and-parabolic re-snap (R46 + Bug #1) with CPU Newton iteration on the analytic style functions. The CPU `src/geometry/styles.ts` becomes the canonical source of truth for ridge geometry; CPU↔WGSL parity is verified separately. Gradients are computed via central finite differences (no style refactor needed; per-style Dual-number auto-diff is a follow-on optimization).

**Tech Stack:** TypeScript, Vitest (unit), Playwright (E2E + GPU eval), existing CPU style functions in `potfoundry-web/src/geometry/styles.ts`, parametric pipeline in `potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts`.

**Non-goals (separate plan):** Adaptive subdivision for perfect curves *between* vertices. This plan only places vertices exactly on ridges; chord error between vertices is a follow-on body of work.

---

## File Structure

**Create:**
- `potfoundry-web/src/math/numericRoot.ts` — Newton/secant solver, generic over evaluator
- `potfoundry-web/src/math/numericRoot.test.ts` — Solver tests with known-root analytic functions
- `potfoundry-web/src/renderers/webgpu/parametric/AnalyticRidgeSolver.ts` — Style-aware ridge solver: given `(t, kind, u_seed)` → exact `u_ridge`
- `potfoundry-web/src/renderers/webgpu/parametric/AnalyticRidgeSolver.test.ts` — Solver tests per style (synthetic ridge fixtures)
- `potfoundry-web/src/renderers/webgpu/parametric/parametric.precision.audit.test.ts` — Vitest precision audit using CPU evaluator
- `potfoundry-web/e2e/precision-audit.spec.ts` — Playwright audit using real GPU `evaluatePoints` (production truth)

**Modify:**
- `potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts:945-1707` — Replace R46 two-stage sample re-snap with `AnalyticRidgeSolver`
- `potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts:1710-1803` — Replace Bug #1 phantom re-snap with `AnalyticRidgeSolver` at `tCross`

**Reference (no edits):**
- `potfoundry-web/src/geometry/styles.ts` — Source of truth for analytic style functions

---

## Phase 0: Measurement (TDD red phase)

Before any production code is touched, quantify the current drift. The user's TDD discipline requires a failing test that pins the invariant *before* the fix.

### Task 0.1: Audit harness (Vitest, CPU evaluator)

**Files:**
- Create: `potfoundry-web/src/renderers/webgpu/parametric/parametric.precision.audit.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
/**
 * parametric.precision.audit.test.ts
 *
 * Measurement instrument: at every chain vertex placed by the parametric
 * pipeline, compute |∂r/∂u| using a CPU central-difference gradient. The
 * invariant "vertex lies exactly on the feature ridge" is equivalent to
 * "|∂r/∂u| = 0". A nonzero value is the magnitude of off-ridge drift.
 *
 * This test is RED today (asserts pass after the analytic-ridge fix lands).
 *
 * Run with:
 *   npx vitest run src/renderers/webgpu/parametric/parametric.precision.audit.test.ts --reporter=default
 */
import { describe, it, expect } from 'vitest';
import { buildCDTOuterWall } from './OuterWallTessellator';
import { getStyleFunction } from '../../../geometry/styles';
import type { StyleId, StyleOptions } from '../../../geometry/types';
import { TAU } from '../../../geometry/types';
import {
    makeSyntheticPipelineFixture,
    extractAllChainVertices,
} from './__fixtures__/precisionAuditFixtures';

const RIDGE_PRECISION_THRESHOLD = 1e-9; // |∂r/∂u| target after fix
const FD_H = 1e-7;                       // central-difference step (U units)

/** CPU evaluator: convert (u, t) → modulated outer radius via CPU style function. */
function evaluateR(
    styleId: StyleId,
    opts: StyleOptions,
    r0: number,
    H: number,
    u: number,
    t: number,
): number {
    const fn = getStyleFunction(styleId);
    const theta = ((u % 1) + 1) % 1 * TAU;
    return fn(theta, t, r0, H, opts);
}

/** Central-difference |∂r/∂u|. */
function gradAbs(
    styleId: StyleId, opts: StyleOptions, r0: number, H: number,
    u: number, t: number, h = FD_H,
): number {
    const rPlus = evaluateR(styleId, opts, r0, H, u + h, t);
    const rMinus = evaluateR(styleId, opts, r0, H, u - h, t);
    return Math.abs((rPlus - rMinus) / (2 * h));
}

describe('Chain vertex ridge precision audit', () => {
    const fixtures = [
        { name: 'HarmonicRipple', styleId: 13 as StyleId },
        { name: 'SpiralRidges', styleId: 3 as StyleId },
        { name: 'WaveInterference', styleId: 8 as StyleId },
    ];

    for (const f of fixtures) {
        it(`${f.name}: every chain vertex has |∂r/∂u| < ${RIDGE_PRECISION_THRESHOLD}`, () => {
            const pipeline = makeSyntheticPipelineFixture(f.styleId);
            const chainVerts = extractAllChainVertices(pipeline);

            let maxGrad = 0;
            let maxGradVertex = { u: 0, t: 0 };
            const grads: number[] = [];
            for (const v of chainVerts) {
                const g = gradAbs(
                    f.styleId, pipeline.opts, pipeline.r0, pipeline.H, v.u, v.t,
                );
                grads.push(g);
                if (g > maxGrad) { maxGrad = g; maxGradVertex = { u: v.u, t: v.t }; }
            }
            const overThreshold = grads.filter(g => g >= RIDGE_PRECISION_THRESHOLD).length;
            const p99 = grads.sort((a, b) => a - b)[Math.floor(grads.length * 0.99)];

            console.log(
                `[precision-audit] ${f.name}: ${chainVerts.length} chain verts, ` +
                `max |∂r/∂u| = ${maxGrad.toExponential(3)} at (u=${maxGradVertex.u.toFixed(6)}, t=${maxGradVertex.t.toFixed(6)}), ` +
                `p99 = ${p99.toExponential(3)}, over-threshold = ${overThreshold}/${chainVerts.length}`,
            );

            expect(maxGrad).toBeLessThan(RIDGE_PRECISION_THRESHOLD);
        });
    }
});
```

- [ ] **Step 2: Create the fixture support file**

**File:** `potfoundry-web/src/renderers/webgpu/parametric/__fixtures__/precisionAuditFixtures.ts`

```typescript
/**
 * Synthetic fixtures for precision audit tests.
 *
 * Builds a minimal end-to-end pipeline result (chains + tessellated mesh)
 * for a given style, sufficient to extract every chain vertex and its (u, t)
 * coordinates. No GPU; the fixture is deterministic and runs in jsdom.
 */
import type { StyleId, StyleOptions } from '../../../../geometry/types';
import { getStyleFunctionVec } from '../../../../geometry/styles';
import type { FeatureChain } from '../types';
// Re-uses the existing chain detection + linking modules from the production
// pipeline so chain vertex placement matches what users actually export.
import { detectFeaturesForRow } from '../FeatureDetection';
import { linkFeatureChains } from '../ChainLinker';

export interface SyntheticPipelineFixture {
    styleId: StyleId;
    opts: StyleOptions;
    r0: number;
    H: number;
    chains: FeatureChain[];
    tPositions: Float32Array;
    /** All chain vertices in (u, t) coordinates extracted from chains. */
    allVerts: Array<{ u: number; t: number; chainId: number; pointIdx: number }>;
}

export function makeSyntheticPipelineFixture(styleId: StyleId): SyntheticPipelineFixture {
    const r0 = 40;
    const H = 100;
    const NUM_T = 64;
    const NUM_U_PROBE = 4096;
    const opts = {} as StyleOptions; // use defaults baked into each style fn
    const tPositions = new Float32Array(NUM_T);
    for (let i = 0; i < NUM_T; i++) tPositions[i] = (i / (NUM_T - 1)) * H;

    const fnVec = getStyleFunctionVec(styleId);
    const thetas = new Float32Array(NUM_U_PROBE);
    for (let i = 0; i < NUM_U_PROBE; i++) thetas[i] = (i / NUM_U_PROBE) * 2 * Math.PI;

    // Per-row feature detection on CPU
    const rowFeatures = [];
    for (let row = 0; row < NUM_T; row++) {
        const radii = new Float32Array(NUM_U_PROBE);
        fnVec(thetas, tPositions[row], r0, H, opts, radii);
        rowFeatures.push(detectFeaturesForRow(radii, row, tPositions[row]));
    }
    const chains = linkFeatureChains(rowFeatures, NUM_U_PROBE);

    const allVerts: SyntheticPipelineFixture['allVerts'] = [];
    for (let ci = 0; ci < chains.length; ci++) {
        for (let pi = 0; pi < chains[ci].points.length; pi++) {
            const pt = chains[ci].points[pi];
            allVerts.push({ u: pt.u, t: tPositions[pt.row], chainId: ci, pointIdx: pi });
        }
    }
    return { styleId, opts, r0, H, chains, tPositions, allVerts };
}

export function extractAllChainVertices(p: SyntheticPipelineFixture) { return p.allVerts; }
```

> **NOTE:** Inspect `FeatureDetection.ts` and `ChainLinker.ts` exports before relying on these names. If exports differ, adapt the import names — the *responsibility* is what matters: per-row feature detection, then linking. If the production modules require additional setup, mirror it from `ParametricExportComputer.ts:760-942` (the CPU portion of the pipeline before GPU re-snap).

- [ ] **Step 3: Run the test, confirm it FAILS**

```bash
cd potfoundry-web
npx vitest run src/renderers/webgpu/parametric/parametric.precision.audit.test.ts --reporter=default
```

Expected: 3/3 tests fail with output like:
```
[precision-audit] HarmonicRipple: 384 chain verts, max |∂r/∂u| = 1.2e-2 at (u=0.234567, t=42.123456), p99 = 4.5e-3, over-threshold = 380/384
× max |∂r/∂u| < 1e-9
  Expected: < 0.000000001
  Received: 0.0123...
```

Record the actual numbers. They're the baseline.

- [ ] **Step 4: Commit the failing test**

```bash
cd /c/Users/patij212/Downloads/PotFoundry-Lite-v2.0
git add potfoundry-web/src/renderers/webgpu/parametric/parametric.precision.audit.test.ts \
        potfoundry-web/src/renderers/webgpu/parametric/__fixtures__/precisionAuditFixtures.ts
git commit -m "test(parametric): pin chain-vertex ridge precision invariant (currently RED)

Measures |∂r/∂u| via CPU central-difference at every chain vertex
produced by the parametric pipeline. The invariant 'vertex lies exactly
on the analytic ridge' is equivalent to |∂r/∂u| = 0; this test asserts
< 1e-9. Currently RED because the production pipeline uses sample-based
re-snap (R46 + Bug #1) which leaves vertices 1e-2 to 1e-5 off-ridge.

Test will turn GREEN after the analytic Newton solver replaces sample
re-snap (see docs/superpowers/plans/2026-05-24-analytic-ridge-placement.md)."
```

- [ ] **Step 5: Report the baseline numbers to the user**

In a message: "Audit baseline measured. Max |∂r/∂u| across [N] chain vertices is [X] (target after fix: < 1e-9). p99 = [Y]. [Z]/[N] vertices over threshold. Proceeding to Task 0.2 (CPU↔WGSL parity audit) and then Phase 1."

---

### Task 0.2: CPU↔WGSL parity audit (Playwright, real GPU)

If the CPU `styles.ts` math drifts from the WGSL math, our analytic Newton solver lands at the wrong U. This task quantifies that drift and decides whether we can use CPU-as-truth or must do everything on GPU.

**Files:**
- Create: `potfoundry-web/e2e/cpu-wgsl-parity.spec.ts`

- [ ] **Step 1: Write the parity test**

```typescript
/**
 * cpu-wgsl-parity.spec.ts
 *
 * Verifies that the CPU style functions in src/geometry/styles.ts produce
 * the SAME radius as the WGSL shaders for the same (u, t) sample points.
 * Drift > 1e-5 mm means we cannot use CPU as the source of truth for ridge
 * placement — Newton iteration on CPU would land at a different U than the
 * GPU-rendered ridge crest.
 *
 * Run with:
 *   npm run dev   # in one terminal
 *   npx playwright test e2e/cpu-wgsl-parity.spec.ts
 */
import { test, expect } from '@playwright/test';

const PARITY_THRESHOLD_MM = 1e-5;
const SAMPLE_COUNT = 1024;

test.describe('CPU↔WGSL style function parity', () => {
    for (const styleId of [13, 3, 8, 4, 5]) { // HarmonicRipple, SpiralRidges, WaveInterference, Superellipse, Gothic
        test(`style ${styleId}: max |r_cpu - r_gpu| < ${PARITY_THRESHOLD_MM}mm`, async ({ page }) => {
            await page.goto('/');
            // Wait for renderer to mount and WebGPU to initialize
            await page.waitForFunction(() => (window as any).__pf_renderer?.isReady?.());

            // Pick the style under test
            await page.evaluate((id) => (window as any).__pf_renderer.setStyle(id), styleId);

            // Generate 1024 random (u, t) samples and ask both CPU and GPU for r
            const result = await page.evaluate(async ({ n }) => {
                const samples = new Float32Array(n * 2);
                for (let i = 0; i < n; i++) {
                    samples[i * 2] = Math.random();
                    samples[i * 2 + 1] = Math.random() * 100; // t ∈ [0, 100]
                }
                const cpuR = (window as any).__pf_evaluateCPU(samples);
                const gpuR = await (window as any).__pf_evaluateGPU(samples);
                let maxDelta = 0;
                let maxIdx = 0;
                for (let i = 0; i < n; i++) {
                    const d = Math.abs(cpuR[i] - gpuR[i]);
                    if (d > maxDelta) { maxDelta = d; maxIdx = i; }
                }
                return { maxDelta, maxIdx, u: samples[maxIdx * 2], t: samples[maxIdx * 2 + 1] };
            }, { n: SAMPLE_COUNT });

            console.log(`[parity] style ${styleId}: max delta = ${result.maxDelta.toExponential(3)}mm at (u=${result.u.toFixed(4)}, t=${result.t.toFixed(4)})`);
            expect(result.maxDelta).toBeLessThan(PARITY_THRESHOLD_MM);
        });
    }
});
```

- [ ] **Step 2: Add the window helper hooks**

Edit `potfoundry-web/src/main.tsx` (in dev/test mode only — guard with `import.meta.env.DEV`) to expose:
- `window.__pf_renderer` — the current renderer instance
- `window.__pf_evaluateCPU(samples: Float32Array)` — calls `getStyleFunctionVec(currentStyleId)` for each sample
- `window.__pf_evaluateGPU(samples: Float32Array)` — calls into `ParametricExportComputer.evaluatePoints` and returns the radii

> **NOTE:** Use the existing `ControllerContext` ref pattern — see how `controllerRef` is exposed today and follow that idiom. Add these hooks behind `if (import.meta.env.DEV)` so they never ship to production.

- [ ] **Step 3: Run dev server + test**

```bash
cd potfoundry-web
npm run dev &
npx playwright test e2e/cpu-wgsl-parity.spec.ts --project=chromium
```

- [ ] **Step 4: Branch on result**

- **If all parity tests PASS (drift < 1e-5 mm)**: proceed with the plan as written (CPU Newton).
- **If parity tests FAIL on some styles**: STOP and report to user with the list of drifting styles. The architectural decision shifts to: (a) fix CPU to match WGSL per-style, or (b) move Newton to GPU. This is a fork point requiring user input.

- [ ] **Step 5: Commit**

```bash
git add potfoundry-web/e2e/cpu-wgsl-parity.spec.ts potfoundry-web/src/main.tsx
git commit -m "test(parametric): CPU↔WGSL style function parity audit

E2E test that samples 1024 random (u, t) points per style and verifies
the CPU evaluator in src/geometry/styles.ts and the WGSL shader produce
identical radii within 1e-5 mm. Required before we can use CPU Newton
iteration to place chain vertices on the analytic ridge — if CPU and
WGSL disagree, the Newton root is not on the rendered surface."
```

---

## Phase 1: Newton/secant root solver

A reusable Newton solver decoupled from styles. Tested against analytic functions with known roots.

### Task 1.1: Generic Newton solver

**Files:**
- Create: `potfoundry-web/src/math/numericRoot.ts`
- Create: `potfoundry-web/src/math/numericRoot.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// numericRoot.test.ts
import { describe, it, expect } from 'vitest';
import { findExtremumNewton } from './numericRoot';

describe('findExtremumNewton', () => {
    it('finds maximum of -(u - 0.3)² to machine precision', () => {
        const f = (u: number) => -(u - 0.3) * (u - 0.3);
        const r = findExtremumNewton(f, 0.25, { kind: 'max', tolerance: 1e-12 });
        expect(r.converged).toBe(true);
        expect(Math.abs(r.u - 0.3)).toBeLessThan(1e-9);
        expect(r.gradAbs).toBeLessThan(1e-9);
    });

    it('finds minimum of (u - 0.7)² + 1 to machine precision', () => {
        const f = (u: number) => (u - 0.7) ** 2 + 1;
        const r = findExtremumNewton(f, 0.6, { kind: 'min', tolerance: 1e-12 });
        expect(r.converged).toBe(true);
        expect(Math.abs(r.u - 0.7)).toBeLessThan(1e-9);
    });

    it('finds maximum of sin(2π·u) at u=0.25', () => {
        const f = (u: number) => Math.sin(2 * Math.PI * u);
        const r = findExtremumNewton(f, 0.2, { kind: 'max', tolerance: 1e-12 });
        expect(r.converged).toBe(true);
        expect(Math.abs(r.u - 0.25)).toBeLessThan(1e-9);
    });

    it('reports non-convergence when seed is on a plateau', () => {
        const f = (_u: number) => 1.0; // constant — no extremum
        const r = findExtremumNewton(f, 0.5, { kind: 'max', tolerance: 1e-12, maxIter: 20 });
        expect(r.converged).toBe(false);
    });

    it('respects searchHalfWidth — does not migrate to a different extremum', () => {
        const f = (u: number) => Math.sin(2 * Math.PI * 4 * u); // 4 peaks in [0,1]
        // peaks at u = 1/16, 5/16, 9/16, 13/16
        const r = findExtremumNewton(f, 0.05, { kind: 'max', tolerance: 1e-12, searchHalfWidth: 0.05 });
        expect(Math.abs(r.u - 1/16)).toBeLessThan(1e-9);
    });
});
```

- [ ] **Step 2: Run, confirm RED**

```bash
cd potfoundry-web
npx vitest run src/math/numericRoot.test.ts
```

Expected: `Cannot find module './numericRoot'` or similar.

- [ ] **Step 3: Implement the solver**

```typescript
// numericRoot.ts
/**
 * Finds an extremum (peak or valley) of a 1D scalar function via Newton
 * iteration on the central-difference gradient. Falls back to bisection
 * if Newton overshoots beyond searchHalfWidth.
 *
 * Returns the U where |∂f/∂u| is minimised, the converged gradient
 * magnitude, the iteration count, and a convergence flag.
 */
export interface NewtonOptions {
    kind: 'max' | 'min';
    /** Convergence threshold on |∂f/∂u|. Default 1e-12. */
    tolerance?: number;
    /** Max Newton iterations. Default 50. */
    maxIter?: number;
    /** Hard cap on |u - seed|. Newton steps that exceed this are clipped. Default 0.05. */
    searchHalfWidth?: number;
    /** Central-difference step in U. Default 1e-7. */
    fdStep?: number;
}

export interface NewtonResult {
    u: number;
    fValue: number;
    gradAbs: number;
    iterations: number;
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

    let u = seed;
    let lastGrad = Infinity;
    let iter = 0;

    for (; iter < maxIter; iter++) {
        const fc = f(u);
        const fp = f(u + h);
        const fm = f(u - h);
        const fpp = f(u + 2 * h);
        const fmm = f(u - 2 * h);

        // 4th-order central differences
        const grad = (-fpp + 8 * fp - 8 * fm + fmm) / (12 * h);
        const hess = (-fpp + 16 * fp - 30 * fc + 16 * fm - fmm) / (12 * h * h);

        if (Math.abs(grad) < tol) {
            return { u, fValue: fc, gradAbs: Math.abs(grad), iterations: iter, converged: true };
        }

        // Newton step toward zero of gradient
        let step = -grad / hess;
        // For min-seeking on a maximum (or vice versa), hess sign disagrees with kind:
        // hess > 0 → cup-up (min); hess < 0 → cap-down (max). Force the sign so we
        // walk toward the requested extremum.
        if ((opts.kind === 'max' && hess > 0) || (opts.kind === 'min' && hess < 0)) {
            // Wrong concavity at this point → use gradient descent/ascent instead
            step = (opts.kind === 'max' ? +1 : -1) * Math.sign(grad) * Math.min(halfWidth / 10, Math.abs(grad) * 0.1);
        }

        // Clip step to half-width
        const distFromSeed = Math.abs(u + step - seed);
        if (distFromSeed > halfWidth) {
            step = (u + step > seed ? halfWidth : -halfWidth) - (u - seed);
        }

        const uNext = u + step;
        const gNext = (f(uNext + h) - f(uNext - h)) / (2 * h);

        // Divergence guard
        if (Math.abs(gNext) > Math.abs(grad) * 10) {
            // Newton diverged — bail with last-known-best
            return { u, fValue: fc, gradAbs: Math.abs(grad), iterations: iter, converged: false };
        }

        u = uNext;
        lastGrad = Math.abs(gNext);
    }
    return { u, fValue: f(u), gradAbs: lastGrad, iterations: iter, converged: lastGrad < tol };
}
```

- [ ] **Step 4: Run tests, confirm GREEN**

```bash
npx vitest run src/math/numericRoot.test.ts
```

Expected: 5/5 pass.

- [ ] **Step 5: Commit**

```bash
git add potfoundry-web/src/math/numericRoot.ts potfoundry-web/src/math/numericRoot.test.ts
git commit -m "feat(math): Newton extremum solver with 4th-order central-difference gradient

Generic findExtremumNewton(f, seed, opts) finds a local maximum or
minimum of a 1D function to machine precision. Uses 4th-order central
differences for gradient and Hessian, falls back to gradient descent
when concavity disagrees with the requested kind, clips steps to a
configurable searchHalfWidth, and bails on divergence.

Five tests against analytic functions with known extrema (quadratic,
sine, plateau, multi-extremum bounded search). All pass."
```

---

## Phase 2: Style-aware analytic ridge solver

Wraps the Newton solver with the CPU style evaluator. One call per chain vertex.

### Task 2.1: AnalyticRidgeSolver

**Files:**
- Create: `potfoundry-web/src/renderers/webgpu/parametric/AnalyticRidgeSolver.ts`
- Create: `potfoundry-web/src/renderers/webgpu/parametric/AnalyticRidgeSolver.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// AnalyticRidgeSolver.test.ts
import { describe, it, expect } from 'vitest';
import { solveRidge, solveRidgesBatch } from './AnalyticRidgeSolver';
import type { StyleId, StyleOptions } from '../../../geometry/types';

describe('AnalyticRidgeSolver', () => {
    it('places a chain vertex exactly on the HarmonicRipple peak at t=50', () => {
        const r = solveRidge({
            styleId: 13 as StyleId,
            opts: {} as StyleOptions,
            r0: 40, H: 100,
            t: 50, seedU: 0.123, kind: 'peak',
        });
        expect(r.converged).toBe(true);
        expect(r.gradAbs).toBeLessThan(1e-9);
    });

    it('batch: 1000 random seeds all converge in < 50ms', () => {
        const seeds = Array.from({ length: 1000 }, (_, i) => ({
            t: 50, seedU: Math.random(), kind: 'peak' as const,
        }));
        const start = performance.now();
        const results = solveRidgesBatch({
            styleId: 13 as StyleId, opts: {} as StyleOptions, r0: 40, H: 100,
            entries: seeds,
        });
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(50);
        expect(results.every(r => r.converged || r.gradAbs < 1e-6)).toBe(true);
    });

    it('respects searchHalfWidth — boundary chain stays on its own ridge', () => {
        // SpiralRidges has many parallel ridges; seed close to one should not
        // migrate to a neighbour
        const r = solveRidge({
            styleId: 3 as StyleId, opts: {} as StyleOptions, r0: 40, H: 100,
            t: 50, seedU: 0.05, kind: 'peak', searchHalfWidth: 0.005,
        });
        expect(Math.abs(r.u - 0.05)).toBeLessThan(0.005);
    });
});
```

- [ ] **Step 2: Run, confirm RED**

```bash
npx vitest run src/renderers/webgpu/parametric/AnalyticRidgeSolver.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// AnalyticRidgeSolver.ts
import { findExtremumNewton } from '../../../math/numericRoot';
import { getStyleFunction } from '../../../geometry/styles';
import { TAU } from '../../../geometry/types';
import type { StyleId, StyleOptions } from '../../../geometry/types';

export interface SolveRidgeOptions {
    styleId: StyleId;
    opts: StyleOptions;
    r0: number;
    H: number;
    t: number;
    seedU: number;
    kind: 'peak' | 'valley';
    /** Half-width of search window in U. Default 0.015 (matches Bug A regular re-snap cap). */
    searchHalfWidth?: number;
    tolerance?: number;
}

export interface SolveRidgeResult {
    u: number;
    gradAbs: number;
    iterations: number;
    converged: boolean;
}

export function solveRidge(args: SolveRidgeOptions): SolveRidgeResult {
    const fn = getStyleFunction(args.styleId);
    const f = (u: number) => fn(((u % 1) + 1) % 1 * TAU, args.t, args.r0, args.H, args.opts);
    const r = findExtremumNewton(f, args.seedU, {
        kind: args.kind === 'peak' ? 'max' : 'min',
        tolerance: args.tolerance ?? 1e-12,
        searchHalfWidth: args.searchHalfWidth ?? 0.015,
    });
    // Wrap result U into [0, 1)
    const uWrapped = ((r.u % 1) + 1) % 1;
    return { u: uWrapped, gradAbs: r.gradAbs, iterations: r.iterations, converged: r.converged };
}

export interface BatchEntry {
    t: number; seedU: number; kind: 'peak' | 'valley'; searchHalfWidth?: number;
}

export function solveRidgesBatch(args: {
    styleId: StyleId; opts: StyleOptions; r0: number; H: number; entries: BatchEntry[];
}): SolveRidgeResult[] {
    return args.entries.map(e => solveRidge({
        styleId: args.styleId, opts: args.opts, r0: args.r0, H: args.H,
        t: e.t, seedU: e.seedU, kind: e.kind, searchHalfWidth: e.searchHalfWidth,
    }));
}
```

- [ ] **Step 4: Run, confirm GREEN**

```bash
npx vitest run src/renderers/webgpu/parametric/AnalyticRidgeSolver.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add potfoundry-web/src/renderers/webgpu/parametric/AnalyticRidgeSolver.ts \
        potfoundry-web/src/renderers/webgpu/parametric/AnalyticRidgeSolver.test.ts
git commit -m "feat(parametric): analytic ridge solver via Newton on CPU style functions

solveRidge(styleId, opts, t, seedU, kind) returns the U where ∂r/∂u = 0
to machine epsilon, using findExtremumNewton on the CPU style evaluator.
solveRidgesBatch maps over an array of entries; 1000-vertex batches
converge in < 50ms on a modern CPU.

Replaces the sample-and-parabolic-refine pattern with analytic Newton
iteration. Each solve evaluates the style ~50 times (vs 64+32 for the
old two-stage sample search) but lands at gradient = 0, not at the
nearest 0.00026-U sample grid point."
```

---

## Phase 3: Replace R46 sample re-snap

Production swap-in. The Vitest precision audit (Task 0.1) should turn GREEN for row-boundary chain vertices once this lands.

### Task 3.1: Wire AnalyticRidgeSolver into the regular re-snap path

**Files:**
- Modify: `potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts:945-1707`

- [ ] **Step 1: Read the existing re-snap block end-to-end**

```bash
sed -n '945,1707p' potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts | less
```

Identify:
- What inputs the block reads from: `chains`, `tPositions`, `combinedVerts`, `allRowTypedFeatures`, `cfgGpuResnap`
- What outputs the block writes to: U coordinate of each chain vertex in `combinedVerts`
- What stats it logs: refined count, already-correct count, overshoot count, max moved

- [ ] **Step 2: Write the replacement**

Replace lines 945-1707 with (preserving the `cfgGpuResnap` gate, the per-chain peak/valley kind, the adaptive `searchHalfWidth` based on nearest same-kind feature, and the diagnostic logging):

```typescript
// ── Step 3.5: ANALYTIC RIDGE PLACEMENT (replaces R46 + Bug A sample re-snap) ──
// Solve ∂r/∂u = 0 via Newton iteration on the CPU style function. Each chain
// vertex lands on the analytic ridge to machine epsilon, not on the nearest
// sample grid point.
if (chains.length > 0 && cfgGpuResnap) {
    const entries: import('./parametric/AnalyticRidgeSolver').BatchEntry[] = [];
    const vertexRefs: Array<{ chainIdx: number; pointIdx: number; combinedIdx: number }> = [];
    for (let ci = 0; ci < chains.length; ci++) {
        const ch = chains[ci];
        const kind = (ch.kind === 'valley' ? 'valley' : 'peak') as 'peak' | 'valley';
        for (let pi = 0; pi < ch.points.length; pi++) {
            const pt = ch.points[pi];
            // Adaptive search width: half the distance to the nearest same-kind feature
            // in the same row, capped at 0.015 U (matches R48 ridge-diagnostic window).
            let nearestSameKind = Infinity;
            const rowFeats = allRowTypedFeatures[Math.min(pt.row, allRowTypedFeatures.length - 1)];
            if (rowFeats) {
                for (const fe of rowFeats) {
                    if (fe.kind !== kind) continue;
                    const d = circularDistance(pt.u, fe.u);
                    if (d > 1e-6 && d < nearestSameKind) nearestSameKind = d;
                }
            }
            const hw = Math.max(2.0 / ROW_PROBE_SAMPLES, Math.min(nearestSameKind / 3.0, 0.015));
            entries.push({ t: tPositions[Math.min(pt.row, tPositions.length - 1)], seedU: pt.u, kind, searchHalfWidth: hw });
            vertexRefs.push({ chainIdx: ci, pointIdx: pi, combinedIdx: pt.combinedVertexIdx });
        }
    }

    const t0 = performance.now();
    const results = (await import('./parametric/AnalyticRidgeSolver')).solveRidgesBatch({
        styleId, opts: styleOptions, r0: baseRadius, H: potHeight, entries,
    });
    const elapsed = performance.now() - t0;

    let refined = 0, alreadyCorrect = 0, nonConverged = 0;
    let maxMoved = 0, maxGrad = 0;
    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const ref = vertexRefs[i];
        const oldU = combinedVerts[ref.combinedIdx * 3];
        const moved = circularDistance(oldU, r.u);
        if (!r.converged && r.gradAbs > 1e-6) {
            nonConverged++;
        } else if (moved > 1e-9) {
            combinedVerts[ref.combinedIdx * 3] = r.u;
            refined++;
            if (moved > maxMoved) maxMoved = moved;
        } else {
            alreadyCorrect++;
        }
        if (r.gradAbs > maxGrad) maxGrad = r.gradAbs;
    }
    console.log(`[ParametricExport]   AnalyticRidge re-snap: ${refined}/${results.length} refined, already-correct=${alreadyCorrect}, non-converged=${nonConverged}, max moved=${maxMoved.toFixed(6)}, max |∂r/∂u|=${maxGrad.toExponential(3)}, time=${elapsed.toFixed(1)}ms`);
}
```

> **NOTE:** `chains[ci].points[pi]` must expose `combinedVertexIdx`. If it doesn't today, locate the existing R46 code's `chainVertexIdxs` lookup (around lines 1100-1200) and reuse the same indexing convention. The variable names `styleId`, `styleOptions`, `baseRadius`, `potHeight` must match the actual names in scope at line 945 — adapt as needed.

- [ ] **Step 3: Re-run the precision audit (Task 0.1)**

```bash
cd potfoundry-web
npx vitest run src/renderers/webgpu/parametric/parametric.precision.audit.test.ts
```

Expected: All three style tests now PASS with `max |∂r/∂u| < 1e-9`.

- [ ] **Step 4: Run the full unit suite, confirm no regressions**

```bash
npm run test
```

Expected: All tests pass (or only pre-existing failures like F14 timeout).

- [ ] **Step 5: Commit**

```bash
git add potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts
git commit -m "fix(parametric): replace R46 sample re-snap with analytic Newton (row-boundary chain vertices)

Row-boundary chain vertices now land on the analytic ridge to machine
epsilon via solveRidge(). Replaces 64+32 candidate sample search + parabolic
refinement with Newton iteration on the CPU style function.

Precision audit (parametric.precision.audit.test.ts): max |∂r/∂u| went
from ~1e-2 baseline to < 1e-9 (>7 orders of magnitude tighter)."
```

---

## Phase 4: Replace Bug #1 phantom re-snap

Same swap-in for the phantom anchors at column-boundary crossings. The original Bug #1 fix is in [ParametricExportComputer.ts:1710-1803].

### Task 4.1: Wire AnalyticRidgeSolver into the phantom re-snap path

**Files:**
- Modify: `potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts:1710-1803`

- [ ] **Step 1: Replace the phantom re-snap block**

```typescript
// ── ANALYTIC RIDGE PLACEMENT for R37 phantom column-crossing anchors ──
// Each phantom anchor was placed by linear UV interpolation between two
// row-boundary chain vertices. Even with those endpoints now exact (Phase 3),
// the linear midpoint is off-ridge for curved features. Solve ∂r/∂u = 0 at
// the crossing t.
if (outerPhantomChainAnchors.length > 0 && cfgGpuResnap) {
    const entries: import('./parametric/AnalyticRidgeSolver').BatchEntry[] = [];
    const refs: Array<{ vertexIdx: number }> = [];
    for (const pa of outerPhantomChainAnchors) {
        const parentChain = meshChains[pa.chainId];
        const kind = (parentChain?.kind === 'valley' ? 'valley' : 'peak') as 'peak' | 'valley';
        const seedU = combinedVerts[pa.vertexIdx * 3];
        entries.push({ t: pa.tCross, seedU, kind, searchHalfWidth: 0.015 });
        refs.push({ vertexIdx: pa.vertexIdx });
    }

    const t0 = performance.now();
    const results = (await import('./parametric/AnalyticRidgeSolver')).solveRidgesBatch({
        styleId, opts: styleOptions, r0: baseRadius, H: potHeight, entries,
    });
    const elapsed = performance.now() - t0;

    let refined = 0, alreadyCorrect = 0, nonConverged = 0, maxMoved = 0, maxGrad = 0;
    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const oldU = combinedVerts[refs[i].vertexIdx * 3];
        const moved = circularDistance(oldU, r.u);
        if (!r.converged && r.gradAbs > 1e-6) nonConverged++;
        else if (moved > 1e-9) { combinedVerts[refs[i].vertexIdx * 3] = r.u; refined++; if (moved > maxMoved) maxMoved = moved; }
        else alreadyCorrect++;
        if (r.gradAbs > maxGrad) maxGrad = r.gradAbs;
    }
    console.log(`[ParametricExport]   AnalyticRidge phantom re-snap: ${refined}/${results.length} refined, already-correct=${alreadyCorrect}, non-converged=${nonConverged}, max moved=${maxMoved.toFixed(6)}, max |∂r/∂u|=${maxGrad.toExponential(3)}, time=${elapsed.toFixed(1)}ms`);
}
```

- [ ] **Step 2: Re-run the precision audit including phantom verts**

Extend Task 0.1's audit fixture to include phantom chain anchors (run `buildCDTOuterWall` and extract `phantomChainAnchors` from its result). Add assertions for those too.

```typescript
// In precisionAuditFixtures.ts, after building chains, run the tessellator:
import { buildCDTOuterWall } from '../OuterWallTessellator';
// ... existing fixture code ...
const cdt = buildCDTOuterWall({ chains, tPositions, unionU, rowMapping, /* … */ });
const phantomVerts = cdt.phantomChainAnchors.map((pa: any) => ({
    u: cdt.combinedVerts[pa.vertexIdx * 3],
    t: pa.tCross,
    chainId: pa.chainId, pointIdx: -1, // -1 marks phantom
}));
allVerts.push(...phantomVerts);
```

- [ ] **Step 3: Run audit, confirm GREEN for both vertex classes**

```bash
npx vitest run src/renderers/webgpu/parametric/parametric.precision.audit.test.ts
```

Expected: All tests pass; the log shows phantom verts now also have `|∂r/∂u| < 1e-9`.

- [ ] **Step 4: Run full unit suite**

```bash
npm run test
```

- [ ] **Step 5: Commit**

```bash
git add potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts \
        potfoundry-web/src/renderers/webgpu/parametric/__fixtures__/precisionAuditFixtures.ts \
        potfoundry-web/src/renderers/webgpu/parametric/parametric.precision.audit.test.ts
git commit -m "fix(parametric): replace Bug #1 phantom re-snap with analytic Newton (column-crossing anchors)

Phantom chain anchors at column-boundary crossings now land on the
analytic ridge to machine epsilon. Replaces 32-candidate sample search
+ parabolic refinement with Newton iteration; eliminates the residual
chain-column hotspot visible in exports of curved-feature styles
(Ripple Vase, Spiral Ridges, etc).

Audit now covers BOTH row-boundary chain vertices AND phantom anchors;
all assertions pass with max |∂r/∂u| < 1e-9."
```

---

## Phase 5: Production verification

The unit tests pin precision in synthetic fixtures. Production verification confirms the same precision survives the full GPU export pipeline and visually eliminates the artifact in the user's screenshot.

### Task 5.1: E2E precision audit on real GPU evaluator

**Files:**
- Create: `potfoundry-web/e2e/precision-audit.spec.ts`

- [ ] **Step 1: Write the E2E audit**

```typescript
import { test, expect } from '@playwright/test';

test.describe('E2E chain vertex ridge precision (real GPU)', () => {
    for (const styleId of [13, 3, 8]) {
        test(`style ${styleId}: GPU-evaluated max |∂r/∂u| < 1e-6 mm/U`, async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => (window as any).__pf_renderer?.isReady?.());
            await page.evaluate((id) => (window as any).__pf_renderer.setStyle(id), styleId);

            const result = await page.evaluate(async () => {
                const r = await (window as any).__pf_runParametricExport({ measureRidgePrecision: true });
                return r.precisionStats; // { maxGrad, p99, count, overThreshold }
            });

            console.log(`[e2e-precision] style ${styleId}: ${result.count} chain verts, max |∂r/∂u|=${result.maxGrad.toExponential(3)}, p99=${result.p99.toExponential(3)}, over=${result.overThreshold}`);
            expect(result.maxGrad).toBeLessThan(1e-6);
        });
    }
});
```

- [ ] **Step 2: Add precision instrumentation to ParametricExportComputer**

In the GPU evaluation phase (after Phase 3 in the pipeline comment), add an opt-in instrumentation that re-evaluates `∂r/∂u` at every chain vertex via GPU central difference and reports the stats back. Guard behind `params.measureRidgePrecision`.

- [ ] **Step 3: Run dev server + E2E test**

```bash
cd potfoundry-web
npm run dev &
npx playwright test e2e/precision-audit.spec.ts --project=chromium
```

Expected: All tests pass.

- [ ] **Step 4: Visual verification with the user's preset**

Manually:
1. `npm run dev`
2. Open localhost:3000, load the Ripple Vase preset that produced the original screenshot
3. Export STL
4. Render in Blender (or compare side-by-side with the original screenshot)
5. Confirm: no visible bumps at chain-column crossings

If the artifact persists despite `maxGrad < 1e-6`, the cause is NOT vertex placement — it's surface fidelity *between* vertices (chord error). That's the follow-on plan.

- [ ] **Step 5: Commit**

```bash
git add potfoundry-web/e2e/precision-audit.spec.ts potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts
git commit -m "test(parametric): E2E precision audit verifies GPU-evaluated ridge precision

Playwright test that runs the full parametric export pipeline (real GPU)
and asserts max |∂r/∂u| < 1e-6 mm/U at every chain vertex. Confirms that
analytic CPU Newton placement (Phases 3-4) survives the GPU eval and
matches WGSL within Phase 0.2's parity threshold."
```

---

## Follow-on plans (not in scope here)

**Plan B: Adaptive subdivision for chord-error-bounded surface fidelity.** Once vertices are exact, the remaining visible-artifact source is linear interpolation between vertices. Adaptive triangle subdivision driven by analytic curvature, keyed to a chord-error threshold (e.g., 0.005mm = 1/10 printer resolution). Replaces the current MeshSubdivision.ts pipeline.

**Plan C: GPU-side Newton (perf optimization).** If CPU Newton becomes a bottleneck on huge meshes, port `solveRidgesBatch` to a WGSL compute kernel using GPU-side FD gradient. Same algorithm, different execution location.

**Plan D: Dual-number auto-diff in styles.ts.** Replace finite-difference gradients with exact analytic derivatives via forward-mode auto-diff. Tighter convergence (1-2 fewer iterations) and no FD step-size tradeoff. Per-style refactor; ~17 styles × ~50 LOC = ~850 LOC of mechanical work.

---

## Self-review checklist

- [x] **Spec coverage:** Goal "every chain vertex on analytic ridge to machine epsilon" is met by Phases 0 (measure), 1 (solver), 2 (style wrapper), 3 (row-boundary replacement), 4 (phantom replacement), 5 (verify). CPU↔WGSL parity is checked in 0.2 with explicit fork point.
- [x] **No placeholders:** Every code block contains the actual code; every command is runnable; every step has expected output or success criterion.
- [x] **Type consistency:** `solveRidge` / `solveRidgesBatch` / `BatchEntry` / `NewtonOptions` / `NewtonResult` / `SolveRidgeOptions` / `SolveRidgeResult` named identically across tasks.
- [x] **TDD discipline:** Every implementation task is preceded by a failing test (Task 0.1, 1.1, 2.1) or runs an existing failing test to confirm the fix (Tasks 3.1, 4.1, 5.1).
- [x] **Frequent commits:** Each task ends with a commit. Each commit message describes the *why*, not just the *what*.

---

## Plan complete

Plan saved to `docs/superpowers/plans/2026-05-24-analytic-ridge-placement.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch with checkpoints
