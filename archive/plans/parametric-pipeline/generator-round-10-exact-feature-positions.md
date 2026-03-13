# Generator Round 10 — Exact Feature Position Resolution

Date: 2026-03-04

## Problem Statement

Feature chain polylines are visibly jagged because the pipeline detects features from discrete samples, then applies smoothing that *moves positions off the true mathematical features*. The current best result is maxConsecDelta ≈ 0.003 (post-WH), producing 0.78mm lateral zigzag per 0.38mm vertical step — a 2:1 ratio that remains visually unacceptable.

The fundamental issue: **detection noise and genuine feature trajectory are entangled in the U-position signal, and no amount of post-hoc smoothing can separate them.** WH smoothing trades fidelity for smoothness, producing a curve that is smooth but *wrong* — it doesn't pass through the true features.

### What "Exact" Means

For any row at parameter `t`, the radius function `r(θ, t) = style_radius(styleId, θ, t, r_base(t))` is a smooth, known function of θ. Its extrema (ridges/valleys) satisfy:

```
∂r/∂θ = 0   (necessary condition)
∂²r/∂θ² < 0  (peak) or ∂²r/∂θ² > 0  (valley)
```

These positions are **determined exactly** by the parametric surface. Every digit of precision in the detected U is achievable — we just need to solve `∂r/∂θ = 0` rather than hunting through discrete samples.

## Root Cause Analysis

### The Precision Hierarchy (Current Pipeline)

| Stage | Precision | Source |
|---|---|---|
| Initial detection | ±1/(2×8192) ≈ ±6.1e-5 | Gradient sign change + 3-point parabolic |
| GPU re-snap | ±1/(32×8192) ≈ ±3.8e-6 | 32 candidates + parabolic refinement |
| WH smoothing | Moves positions by up to 0.003 | Penalty smoother (fidelity vs smoothness) |
| CatRom subdivision | Interpolates between (wrong) positions | Geometric, no new data |

The re-snap already achieves excellent precision (~3.8e-6 in U, or ~0.001mm on a 250mm circumference). **The problem is NOT detection precision at any single row.** The problem is that even at ±3.8e-6 per row, the detected positions have a *random* component that makes consecutive rows disagree by up to 0.009 in U, creating visible zigzag.

### Why Rows Disagree

Two sources:
1. **Genuine trajectory variation**: With SuperformulaBlossom (m_base=6, m_top=10), features sweep across U as m morphs along t. Adjacent rows can have legitimately different feature U positions. This is signal.
2. **Numerical quantization**: The GPU evaluates `compute_outer_radius(θ, t)` in f32 precision. The re-snap searches 32 candidates on a uniform grid within ±2 sample widths. When a peak is very flat (low curvature), the parabolic fit is ill-conditioned, and the refined position can jitter. This is noise.

**Key insight**: For styles with `m ∈ {6, 8, 10}` (common SuperformulaBlossom), the feature trajectory `u*(t)` is an **analytic function of t**, often nearly linear or gently curved. The "zigzag" comes from per-row detection noise overlaid on a smooth trajectory.

### The Mathematical Opportunity

The function `compute_outer_radius(θ, t)` is available on the GPU and can be evaluated at **arbitrary** (θ, t). We don't need to work with discrete 8192-sample rows. We can:
- Evaluate `r(θ ± ε, t)` at any ε
- Compute `∂r/∂θ` via finite differences at machine-chosen step sizes
- Iterate Newton-Raphson on the GPU to find exact zeros of `∂r/∂θ`

The `snap_to_feature_ridges` shader ([adaptive_mesh.wgsl](../src/assets/shaders/adaptive_mesh.wgsl) L929) already does something similar — 2D Hessian eigendecomposition + Golden Section Search. But it operates on *grid vertices* for mesh optimization, not on *chain points* for feature tracking.

## Proposals

### Proposal 1: GPU Newton-Raphson Feature Solver (Moderate — Recommended)

**Idea**: Replace the current re-snap (brute-force grid search of 32 candidates) with a purpose-built GPU compute pass that runs Newton-Raphson iteration on each chain point to find the exact zero of `∂r/∂θ` at that row's t-value.

**Mechanism**:
1. After chain linking (Step 3), collect all chain points as `(u_initial, t, kind)` triples.
2. Write a new WGSL compute shader `refine_chain_features` that, for each chain point:
   a. Computes `∂r/∂θ` via central finite difference: `dr = (r(θ+h) - r(θ-h)) / (2h)` with `h = 1e-4` (~0.006°)
   b. Computes `∂²r/∂θ²` via central difference: `d2r = (r(θ+h) - 2r(θ) + r(θ-h)) / h²`
   c. Iterates: `θ_{n+1} = θ_n - dr/d2r` (Newton-Raphson for extremum)
   d. Converges when `|dr| < 1e-8` or after 8 iterations (quadratic convergence = 8 iterations gives ~1e-16 precision, far beyond f32 limits)
   e. Validates: checks `∂²r/∂θ²` sign matches expected kind (peak vs valley)
   f. Writes back the refined `u = θ/(2π)` to the chain point buffer
3. The CPU reads back refined positions. These are now at **machine precision** for the true extremum.
4. **WH smoothing is REMOVED.** The positions are already exact; smoothing would only make them wrong.

**Mathematical basis**: Newton-Raphson finds zeros of `f(θ) = ∂r/∂θ`. For a smooth function with isolated zeros and non-zero second derivative at the zero, convergence is quadratic: `|θ_{n+1} - θ*| ≤ C·|θ_n - θ*|²`. Starting from within ±6e-5 of the true zero (initial detection precision), one iteration gives ~3.6e-9 precision, two iterations give ~1.3e-17 — below f32 epsilon (~6e-8).

**How it achieves sub-sample precision**: Instead of evaluating r at a grid of candidate points and picking the best (current re-snap), it algebraically solves for the zero of dr/dθ using the GPU's ability to evaluate r at arbitrary points. Two Newton iterations from the initial detection are sufficient.

**Impact on pipeline**:
- **Replaces**: Step 3.5 (GPU re-snap). The new shader is simpler (no grid search, just 2-3 Newton iterations per point).
- **Removes**: Step 3.6 (WH smoothing) — no longer needed because positions are exact.
- **Keeps**: Everything else — initial detection (Step 2), chain linking (Step 3), CatRom subdivision (Step 7 in OWT).
- **CatRom subdivision becomes purely cosmetic**: It adds intermediate points for mesh density but doesn't need to "fix" jagged chains.

**Files affected**:
- `adaptive_mesh.wgsl` — New `@compute` entry point `refine_chain_features` (~40 lines of WGSL)
- `ParametricExportComputer.ts` L920-1035 — Replace GPU re-snap section with Newton solver dispatch
- `ParametricExportComputer.ts` L1035-1070 — Remove WH smoothing call (or gate behind config flag)
- `ChainLinker.ts` — `whittakerSmooth` becomes dead code (keep for reference, remove call)

**Trade-offs**:
- (+) Exact positions, zero smoothing bias
- (+) Fewer GPU evaluations per point (2×3 = 6 evaluations for 2 Newton iterations vs 32 for grid search)
- (+) Simpler code (remove WH machinery)
- (-) Requires one new WGSL entry point + pipeline
- (-) Newton can diverge on flat features (curvature ≈ 0), needs safeguard

**Assumptions** (for Verifier to attack):
1. Two Newton iterations from the initial detection's starting point always converge for all PotFoundry style functions. *Justification*: Initial detection places us within ±6e-5 of the true zero, and all style functions have continuous second derivatives. The convergence basin for Newton on `dr/dθ = 0` is much wider than ±6e-5 for any feature with prominence above the detection threshold.
2. f32 precision is sufficient for Newton iteration on `dr/dθ`. *Justification*: The finite difference step h=1e-4 is ~1600× larger than f32 epsilon. The computed gradient dr and Hessian d2r have ~4 significant digits of precision, which is more than enough for iteration convergence to f32 limits.
3. Exact positions render smoothing unnecessary. *Justification*: The maxConsecDelta between exact positions represents the TRUE feature trajectory variation (genuine morphing of the style function). This should be small and monotonic for well-behaved style functions. If it's still large, the style function genuinely has rapid feature migration, and smoothing would FALSIFY the feature path.
4. The existing `compute_outer_radius` function evaluates correctly at arbitrary θ (not just at the 8192 sample points). *Justification*: It's a continuous mathematical function (superformula, harmonic, etc.) with no sampling or lookup tables.
5. A new compute pipeline can be added without exceeding WebGPU bind group limits. *Justification*: It uses the same bind group layout as `evaluate_vertices` — only uniform buffer + vertex storage buffer needed. The existing `snapPipeline` is a precedent.

---

### Proposal 2: Multi-Scale GPU Bisection + Cubic Hermite (Conservative)

**Idea**: Instead of Newton-Raphson (which requires computing second derivatives and can diverge on flat peaks), use a guaranteed-convergence approach: bisection to narrow the bracket, then cubic Hermite interpolation from the bracket endpoints.

**Mechanism**:
1. Same starting point as Proposal 1 — chain points with initial U estimates.
2. GPU shader `bisect_chain_features`:
   a. For each chain point, establish a bracket `[θ_L, θ_R]` where `∂r/∂θ` changes sign. Use the initial detection's ±1-sample neighbors. Width = 2/8192 ≈ 2.4e-4 radians.
   b. Run 16 bisection iterations → bracket width = 2.4e-4 / 2^16 ≈ 3.7e-9 radians. This is below f32 epsilon.
   c. At the final bracket, compute cubic Hermite interpolation using `r, dr/dθ` at both endpoints for a smooth final estimate.
3. CPU reads back. No smoothing needed.

**How it achieves sub-sample precision**: Bisection is unconditionally convergent. 16 iterations on a ±1-sample bracket gives precision below f32 epsilon. The Hermite step is optional polish.

**Impact on pipeline**:
- Same as Proposal 1 — replaces re-snap, removes WH smoothing.
- Slightly more GPU evaluations per point: 16 iterations × 3 evaluations (midpoint + gradient) = 48 evaluations (vs Newton's ~6). Still far fewer than the current 32-candidate search + parabolic.

Wait — actually current re-snap does 32 evaluations total per point. Bisection does 16 midpoint evaluations (each requires 3 r() calls for central difference gradient) = 48 r() calls. So bisection is ~1.5× more GPU work than current re-snap but with **guaranteed convergence** and sub-f32 precision.

**Files affected**: Same as Proposal 1.

**Trade-offs**:
- (+) Guaranteed convergence — no divergence risk
- (+) Exact positions, no smoothing needed
- (+) Mathematically simple — just bisection
- (-) More GPU evaluations per point than Newton (48 vs 6)
- (-) Requires valid sign-change bracket, which may fail if initial detection is off by >1 sample

**Assumptions** (for Verifier to attack):
1. A sign-change bracket for `∂r/∂θ` always exists within ±1 sample of the detected position. *Justification*: The initial detection IS a gradient sign change (that's how detectRowFeaturesV16 works — Strategy 1). So the bracket is inherently available from the detection step.
2. 16 bisection iterations are sufficient. *At 2.4e-4 / 2^16 ≈ 3.7e-9 radians, this is below f32 epsilon (~6e-8), so yes.*
3. Same assumptions 3, 4, 5 as Proposal 1.

---

### Proposal 3: Analytic Trajectory Fitting (Radical)

**Idea**: Instead of refining each row independently and then linking, compute the **global feature trajectory** `u*(t)` as a low-order polynomial or spline fit constrained by the known style function mathematics.

**Mechanism**:
1. For SuperformulaBlossom with `m_base → m_top` morphing, the feature positions are determined by:
   ```
   ∂r/∂θ(θ, t) = 0  where  r = style_radius(styleId, θ, t, r_base(t))
   ```
   For the superformula, `r ∝ |cos(m(t)·θ/4)|^n2 + |sin(m(t)·θ/4)|^n3` (simplified), and the extrema are at `θ_k = k·2π/m(t)` (approximately, modulo n2/n3 asymmetry). When `m(t) = m_base + (m_top - m_base)·t`, the trajectory is:
   ```
   u_k*(t) = k / m(t) = k / (m_base + (m_top - m_base)·t)
   ```
   This is a **hyperbola** in (u, t) space. A rational function of t.

2. Fit each chain to a rational function `u*(t) = (a + bt) / (c + dt)` using weighted least squares on the GPU-refined positions.

3. Evaluate the fitted trajectory at each row's t-value. This gives mathematically consistent positions that follow the true feature path with zero zigzag.

**Mathematical basis**: For superformula-based styles, the extrema of r(θ) move as θ_k ∝ 1/m(t), where m(t) varies linearly. The trajectory is exactly a rational function, and fitting a rational function to ~264 data points is trivially overdetermined.

**How it achieves sub-sample precision**: The fit constrains positions to lie on a smooth analytic curve determined by the style function's mathematical structure. Per-row quantization noise is averaged out by the global fit.

**Impact on pipeline**:
- **Replaces**: GPU re-snap AND WH smoothing AND chain linking's raw U positions
- **Keeps**: Initial detection (for identifying which features exist), chain linking (for topology)
- **New**: CPU-side rational function fitting after chain linking

**Files affected**:
- `ChainLinker.ts` — New function `fitChainTrajectory(chain) → rational function`, plus `evaluateTrajectory(chain, t) → u`
- `ParametricExportComputer.ts` — After chain linking, call trajectory fitter, replace chain point U values

**Trade-offs**:
- (+) Globally smooth result with zero zigzag by construction
- (+) Works even without Newton refinement — noise averages out
- (+) No new GPU shader needed (fitting is CPU-side)
- (-) **Style-specific** — the rational function form only works for superformula. Other styles (Harmonic, Fourier) have different trajectory shapes.
- (-) Requires knowing the mathematical form of the trajectory, which is tightly coupled to the style function implementation
- (-) If the fit is wrong (model mismatch), ALL positions are systematically biased
- (-) Doesn't handle trajectory bifurcation (features appearing/disappearing along height)

**Assumptions** (for Verifier to attack):
1. Feature trajectories for all PotFoundry styles can be adequately represented by low-order rational functions. *This is FALSE for styles with m that varies non-monotonically, or for Harmonic/Spiral styles where features have completely different mathematical structure.*
2. Averaging out per-row noise via global fit doesn't introduce systematic bias. *This depends on the fit model being correct — if the true trajectory is a hyperbola but we fit a polynomial, the residuals are systematic.*
3. Feature count remains constant across the full height range. *FALSE — SuperformulaBlossom with m_base=6, m_top=10 must create 4 new features somewhere in the t range. The trajectory fitting must handle bifurcation.*

---

## Recommended Approach

**Proposal 1 (GPU Newton-Raphson)** is the recommended primary approach:
- It solves the root cause (imprecise feature positions) rather than compensating for it (smoothing)
- It's style-agnostic — works with any `compute_outer_radius` function
- It's mathematically optimal (quadratic convergence)
- It's simpler than the current pipeline (removes WH smoothing + grid search)
- The risk (Newton divergence on flat peaks) is manageable with a safeguard fallback to bisection (Proposal 2)

**Recommended hybrid**: Implement Newton-Raphson as the primary solver with a bisection fallback. If after 4 Newton iterations `|dr/dθ| > 1e-4`, switch to bisection for that point. This gives the speed of Newton (6 GPU r() evaluations for 95%+ of points) with the safety net of bisection for edge cases.

**Proposal 3 is explicitly NOT recommended** at this stage. It's style-specific, fragile to model mismatch, and doesn't handle bifurcation. It could be revisited later as an optional "trajectory regularizer" after exact positions are established.

## The Smoothing Question

**Can WH smoothing be entirely removed?**

**Yes, conditionally.** Once positions are at machine precision:
- If `maxConsecDelta` drops to < 0.001 (which it should, since most of the 0.009 pre-smooth value was quantization noise), the chains are smooth enough for CDT tessellation.
- The remaining consecutive delta represents the *true* feature migration rate, which is physically meaningful and should NOT be smoothed away.
- CatRom subdivision still operates on the refined positions, adding intermediate points at 1/3 and 2/3 of each row gap — this provides mesh density without altering the feature-accurate positions.

**However**: If a style function has legitimately rapid feature migration (delta > 0.005 per row), the resulting chain will look "diagonal". This is CORRECT behavior — the mesh should follow the diagonal feature. WH smoothing would straighten a diagonal feature into a vertical one, which is WRONG.

**Recommendation**: Remove WH smoothing, gate behind a `legacySmoothEnabled` config flag (default false) for rollback safety. Add a diagnostic log of post-Newton maxConsecDelta to verify the improvement.

## Expected Outcome

| Metric | Current (WH) | Expected (Newton) |
|---|---|---|
| maxConsecDelta | 0.003 | < 0.0005 (5× improvement) |
| Feature position accuracy | ±0.003 (smoothing bias) | ±6e-8 (f32 limit) |
| Debug dots vs lines alignment | Misaligned (different sources) | Coincident (same exact positions) |
| GPU evaluations per point | 32 (grid search) | 6-8 (Newton + validation) |
| CPU post-processing | WH pentadiagonal solve | None |

## Open Questions

1. **Flat peaks**: For styles with very gentle features (prominence < 0.05mm), `∂²r/∂θ²` can be near-zero, making Newton's step `dr/d2r` huge. The bisection fallback handles this, but how common is it? Verifier: please estimate the fraction of chain points with `|d2r| < 1e-6` on typical style configurations.

2. **Twist interaction**: The `compute_twist` function shifts θ by `spinTurns · 2π · t^spinCurve`. Does Newton-Raphson on `∂r/∂θ` correctly account for the twist already being baked into `compute_outer_radius`? Or does the twist create a dependence of the extremum position on t that makes the per-row Newton isolate the wrong zero?  *I believe twist is already applied inside `compute_outer_radius → style_radius`, so Newton operates on the twisted coordinate. Verifier should confirm.*

3. **Seam interaction**: If a feature's true position is at u ≈ 0 or u ≈ 1, Newton iteration in θ-space crosses the 0/2π boundary. The current circular wrapping in chain linking handles this, but does the Newton shader need explicit modular arithmetic? *Probably yes — the shader should work in θ ∈ (-∞, ∞) and only wrap to [0, 1) at the end.*

4. **Performance on high-feature-count styles**: With 264 rows × 20 features = 5280 chain points, each needing 2-3 GPU dispatches, can this complete in < 100ms? The current re-snap processes all points in a single GPU dispatch (single buffer of `5280 × 32 = 168,960` probe vertices). Newton requires 2-3 sequential dispatches of 5280 points each. Fewer total evaluations but more dispatch overhead. Verifier: is dispatch overhead significant for 5280-point workloads?

5. **CatRom subdivision accuracy**: After Newton gives exact row positions, CatRom subdivision interpolates U between rows. This interpolation has no mathematical basis — it's geometric. Should the subdivision points also be Newton-refined? That would require a second Newton pass on ~10,000 additional points (2 per chain edge × 5000 edges). Cost: ~60,000 GPU r() evaluations, probably < 50ms. Worth it for perfect precision everywhere, not just at row boundaries.
