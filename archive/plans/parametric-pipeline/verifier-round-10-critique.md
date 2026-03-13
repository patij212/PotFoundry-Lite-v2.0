# Verifier Round 10 — Critique of GPU Newton-Raphson Feature Solver

Date: 2026-03-04

## Summary Verdict: REJECT — Proposal rests on an invalid f32 precision analysis

The Generator's central claim — that Newton-Raphson in f32 achieves "machine precision" for feature positions, making smoothing unnecessary — is **mathematically incorrect**. Finite difference derivatives in f32 have a noise floor that limits Newton/bisection convergence to approximately ±4×10⁻⁶ in U-space, which is **the same precision the existing re-snap already achieves** (±3.8×10⁻⁶). Furthermore, the proposal ignores two independent structural bugs (chain-strip constraints: total=0 and the 141K inverted triangles) that Newton-Raphson cannot address.

The core idea of iterative refinement has merit, but the implementation plan, precision claims, and pipeline impact analysis are all flawed. A revised proposal with correct numerical analysis, a realistic step-size `h`, and a plan for the independent bugs is needed before this can proceed.

---

## Critique

### C1 [CRITICAL]: f32 Finite Difference Precision Invalidates All Convergence Claims

**Generator's claim**: "Two Newton iterations from initial detection give ~1.3×10⁻¹⁷ precision — below f32 epsilon." (Proposal 1, Mathematical basis section)

**Actual behavior**: This analysis assumes **exact arithmetic**. In f32 with central finite differences, the signal-to-noise ratio of the computed derivatives imposes a hard precision floor that is orders of magnitude above f32 epsilon.

**Mathematical proof**:

For a superformula pot (m=6, amplitude ≈ 14mm, r₀ ≈ 40mm):

| Quantity | Symbol | Value |
|----------|--------|-------|
| f32 machine epsilon (relative) | ε | 1.19×10⁻⁷ |
| Absolute rounding in r() | εᵣ = r₀·ε | 4.76×10⁻⁶ mm |
| True ∂²r/∂θ² at peak | d²r | ~31.5 mm/rad² |
| True ∂³r/∂θ³ | d³r | ~47 mm/rad³ |

**At the Generator's proposed h = 1×10⁻⁴:**

*First derivative noise*: The central difference `dr = (r(θ+h) − r(θ−h)) / (2h)` has rounding error ≈ 2εᵣ / (2h) = 4.76×10⁻⁶ / 10⁻⁴ = **0.048 mm/rad**. Near the extremum where dr → 0, this noise dominates completely.

*Second derivative noise*: `d2r = (r(θ+h) − 2r(θ) + r(θ−h)) / h²` has:
- Signal: |d²r| · h² = 31.5 × 10⁻⁸ = **3.15×10⁻⁷ mm**
- Noise: √6 · εᵣ ≈ **1.17×10⁻⁵ mm**
- **SNR = 0.027** — the second derivative is pure noise at h = 10⁻⁴!

The Newton step `dr/d2r` divides a noisy gradient by a noise-dominated Hessian. The result is **random**, not convergent.

*Bisection with h = 10⁻⁴*: Bisection needs the SIGN of dr, which is correct only when |dr_true| > noise_dr. Resolution: δθ_limit = noise_dr / |d²r| = 0.048 / 31.5 ≈ 1.5×10⁻³ radians = **2.4×10⁻⁴ in U-space**. This is **4× WORSE** than the initial 8192-sample detection (±6.1×10⁻⁵).

**Optimal h for f32**:

The optimal step size that minimizes total error (truncation + rounding) for the first derivative is:

$$h_{opt} = \left(\frac{3 \varepsilon |r|}{|f'''|}\right)^{1/3} \approx \left(\frac{3 \times 4.76 \times 10^{-6}}{47}\right)^{1/3} \approx 6.7 \times 10^{-3} \text{ rad}$$

At h = 0.007 radians (not 10⁻⁴!), the achievable precision is:
- Gradient total error: ≈ 7.9×10⁻⁴ mm/rad
- Zero-crossing resolution: 7.9×10⁻⁴ / 31.5 ≈ 2.5×10⁻⁵ rad ≈ **4.0×10⁻⁶ in U-space**

This is **approximately equal to the existing re-snap precision** (±3.8×10⁻⁶) — not 1000× better as claimed.

**Evidence**: The existing `snap_to_feature_ridges` shader ([adaptive_mesh.wgsl](../../src/assets/shaders/adaptive_mesh.wgsl#L948)) uses h = 0.001 (not 10⁻⁴), and even that gives the Hessian only ~1.5 digits of precision. The Generator's h is 10× smaller than the already-marginal existing choice.

**Required fix**: 
1. Use h ≈ 0.005–0.01 radians (not 10⁻⁴)
2. Acknowledge that f32 Newton achieves ±4×10⁻⁶ precision, NOT "machine precision"
3. Acknowledge this is equivalent to (not better than) the existing re-snap
4. Re-evaluate whether replacing re-snap with Newton provides any precision benefit

---

### C2 [CRITICAL]: Removing WH Smoothing Is Unsafe — Zigzag Is Not From Detection Noise

**Generator's claim**: "Exact positions render smoothing unnecessary. [...] WH smoothing would FALSIFY the feature path."

**Actual behavior**: The reported pre-smooth maxConsecDelta of 0.009 **cannot be from detection noise** given re-snap precision of ±3.8×10⁻⁶. The ratio 0.009 / 3.8×10⁻⁶ ≈ 2,368 rules out detection noise as the source.

**Root cause analysis of the 0.009 zigzag**:

The "pre-smooth diagnostic" at [ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L907) runs **after chain linking (Step 3) but before re-snap (Step 3.5)**. So it captures initial detection noise (±6.1×10⁻⁵) plus any linking errors. But even ±6.1×10⁻⁵ gives at most ~1.2×10⁻⁴ consecutive delta (two adjacent noise values), which is 75× smaller than 0.009.

The theoretical maximum du/dt for SuperformulaBlossom (m_base=6, m_top=10):

$$\frac{du}{dt} = -\frac{(4k-1) \cdot m'(t)}{2m^2(t)} = -\frac{3 \times 4}{2(6+4t)^2}$$

At t=0: du/dt = -6/36 = -0.167/unit-t. With ~264 rows: du/row ≈ 0.167/264 ≈ **6.3×10⁻⁴**.

This is the genuine feature migration rate. The observed 0.009 is **14× larger** than even this theoretical maximum, proving the zigzag comes from **chain linking errors** — the linker intermittently swaps between nearby features.

**Counterexample**: For SuperformulaBlossom with m transitioning from 6→10, four new features must appear along the height axis. Near a bifurcation, there are two extrema close together. The chain linker uses a search radius (CHAIN_LINK_RADIUS = 0.04) and can grab either one on successive rows. This creates zigzag with amplitude = feature spacing ≈ 0.01, matching the observed 0.009.

Newton-Raphson would refine each chain point to the **exact** position of whichever feature the linker chose — confirming the wrong choice with mathematical precision. The chain would be jagged AND exact.

**Required fix**: 
1. Do NOT remove WH smoothing until chain linking errors are resolved
2. Add a post-re-snap / pre-smooth diagnostic to distinguish detection noise from linking errors
3. Address the chain linking problem as a prerequisite, not a consequence, of Newton refinement

---

### C3 [CRITICAL]: "Primary chain edges: total=0" and "Chain-strip constraints: total=0" Are Independent Bugs Not Addressed

**Generator's claim**: The proposal does not mention these diagnostic results at all.

**Investigation results**:

**"Primary chain edges: total=0"** is an **expected consequence of CatRom subdivision** (v25.0), not a bug per se. At [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1418), a "primary" edge requires both endpoints to have `pointIdx >= 0`. CatRom subdivision inserts vertices with `pointIdx = -1` between every pair of original chain points, meaning NO edge connects two original points anymore. The diagnostic is correctly counting zero but is now misleading — it should be renamed or removed.

**"Chain-strip constraints: total=0"** is more concerning. At [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1487), this counts constraints passed into CDT strip triangulation. Tracing the data flow:

1. `chainEdges` built at [L439](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L439) → aliased to `allChainEdges` at [L739](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L739)
2. Pre-indexed into `rowBandEdges` at [L819](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L819) — requires `cv0` and `cv1` to be valid chain vertices
3. Per-band filtered to `bandConstraintEdges` at [L1021](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1021) — same `cv0`/`cv1` validity check
4. Per-strip filtered to `segConstraints` at [L1133](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1133) — U-range check
5. Passed to `cdtTriangulateStrip` at [L1286](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1286) → counted in `stats.totalConstraints` at [ChainStripTriangulator.ts](../../src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L219)

If `totalConstraints = 0`, NONE of the chain edges survived all four filtering stages. Possible causes:
- All chain edges fail at step 2 (`cv0` or `cv1` is undefined because vertex index is out of range)
- All chain edges are filtered by the U-range check at step 4
- Batch2Remap eliminates chain vertex indices before they reach the strip vertex lists

This is a **separate mesh topology bug** that Newton-Raphson cannot fix. Without constraint edges in CDT, chain features are not enforced in the mesh, producing the 141K inverted triangles observed.

**Required fix**: The Generator must diagnose and fix the constraint pipeline before or alongside Newton refinement. Newton gives exact positions but without constraint enforcement, those positions aren't reflected in the actual triangulation.

---

### C4 [WARNING]: Superformula Cusps at Default Parameters (n2=n3=1)

**Generator's claim**: "All style functions have continuous second derivatives."

**Actual behavior**: The superformula at [styles.wgsl](../../src/assets/shaders/styles.wgsl#L46) computes:
```wgsl
let c = pow(abs(cos(m * theta / 4.0) / max(a, 1e-4)), n2);
let s = pow(abs(sin(m * theta / 4.0) / max(b, 1e-4)), n3);
```

The defaults are n1=n2=n3=1.0 ([adaptive_mesh.wgsl](../../src/assets/shaders/adaptive_mesh.wgsl#L82)). With n2=1: `pow(abs(cos(...)), 1.0) = abs(cos(...))`, which has **discontinuous first derivative** (cusp) at its zeros — which are exactly the feature positions Newton tries to find.

**Mitigating factor**: At the cusp, the function is symmetric, so central-difference dr/dθ evaluates to exactly 0 by symmetry. Newton would see dr=0 and declare "converged" immediately. This accidentally works but violates the quadratic convergence guarantee.

**Severity**: WARNING not CRITICAL, because the cusp case works by coincidence. However:
- For n2 or n3 ∈ (1, 2), the function is C⁰ but not C¹ at feature positions. Newton's second derivative is undefined there.
- The Generator should note this limitation and verify behavior for all default parameter combinations.

---

### C5 [WARNING]: Newton vs Bisection Evaluation Count Is Understated

**Generator's claim**: "Fewer GPU evaluations per point (2×3 = 6 evaluations for 2 Newton iterations vs 32 for grid search)"

**Actual behavior**: Each Newton iteration requires:
- 3 `r()` evaluations for dr via central difference: r(θ+h), r(θ), r(θ−h)
- Actually, d2r also needs r(θ+h), r(θ), r(θ−h) — but these overlap with dr! So simultaneous dr + d2r = 3 r() evals per iteration.
- Plus 1 validation evaluation to check kind (peak vs valley)

Two iterations = 2×3 + 1 = **7 evaluations**. The Generator says 6, which is close but excludes validation.

For the bisection fallback (Proposal 2): Each bisection step evaluates dr at the midpoint, requiring 2 `r()` evals for central difference (r(mid+h), r(mid−h); r(mid) isn't needed for sign detection but is needed for the Hermite polish). So 16 bisection steps = 16×2 = 32 evals minimum + Hermite. The Generator's stated "48 evaluations" is actually correct.

**Net**: Newton is ~4.5× fewer evaluations than re-snap (7 vs 32). This is the REAL benefit of the proposal — not precision, but efficiency. However, Newton requires **2-3 sequential GPU dispatches** vs re-snap's single dispatch, adding latency.

**Verdict**: ACCEPT WITH AMENDMENT — acknowledge the correct evaluation counts and that the benefit is efficiency (fewer r() evaluations per point), not precision.

---

### C6 [WARNING]: CatRom Subdivision Points Need Newton Refinement — Definitive Answer

**Generator's open question**: "Should the subdivision points also be Newton-refined?"

**Definitive answer: Yes, they must be.** CatRom interpolation at [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L316) computes:
```typescript
let u = catmullRomInterp(p0.u, p_i.u, p_i1.u, p3.u, frac);
```

This interpolates U geometrically between chain vertices. If the true feature trajectory is `u*(t) = (4k-1) / (2m(t))` (a hyperbola for linear m(t)), CatRom approximates it with a cubic polynomial. For gently curving trajectories (m changing slowly), the approximation error is small. For rapid m transitions (m_base=6 → m_top=10), the CatRom error can be significant.

The subdivision points have explicit t-values ([L320](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L320)): `t = tLo + (tHi - tLo) * frac`. Newton refinement at these t-values is straightforward and uses the same shader. Cost: 2 subdivision points per chain edge × ~4000 edges × 7 evaluations = ~56,000 r() evaluations. At GPU throughput of ~10M evals/sec, this is <10ms. **Worth it.**

---

### C7 [NOTE]: Twist Is Irrelevant — Confirmed

**Generator's open question**: "Does twist affect Newton's convergence?"

**Definitive answer: No.** Confirmed by reading [adaptive_mesh.wgsl](../../src/assets/shaders/adaptive_mesh.wgsl#L122):
```wgsl
fn compute_outer_radius(theta: f32, t: f32) -> f32 {
    let styleId = get_styleId();
    let r0 = r_base(t);
    return style_radius(styleId, theta, t, r0);
}
```
`compute_outer_radius` does NOT call `compute_twist`. Twist is applied separately in [evaluate_vertices](../../src/assets/shaders/adaptive_mesh.wgsl#L785):
```wgsl
let r = compute_outer_radius(theta, t);
let th = compute_twist(theta, t);
x = r * cos(th); y = r * sin(th);
```
The radius `r(θ, t)` is twist-independent. Feature positions in θ-space are fixed regardless of twist parameters.

---

### C8 [NOTE]: Seam Wrapping Needs Modular Arithmetic — Confirmed

**Generator's open question**: "Does Newton need explicit modular arithmetic?"

**Definitive answer: Yes, but it's trivial.** The `style_radius` dispatch at [ShaderManager.ts](../../src/renderers/webgpu/ShaderManager.ts#L67) already normalizes:
```wgsl
let th = theta - floor(theta / TAU) * TAU;
```
Newton iteration in θ-space naturally stays near the starting point (within h of it). But if a feature sits near θ=0 or θ=2π, the ±h stencil could cross the boundary. The normalization inside `style_radius` handles this correctly. The final u-wrapping (`u = θ / (2π)`, wrapped to [0,1)) is standard. No special treatment needed beyond what the shader already provides.

---

### C9 [NOTE]: Debug Dots vs Lines Misalignment — Confirmed

**Generator's claim**: Debug dots use pre-smoothing positions while lines use post-smoothing positions.

**Confirmed.** Debug dots (LAST_PEAK_DEBUG_DATA) are built at [ParametricExportComputer.ts](../../src/renderers/webgpu/ParametricExportComputer.ts#L865) from `allRowFeatures` — the raw per-row detected positions, before chain linking, re-snap, or smoothing. Debug lines (LAST_CHAIN_DEBUG_DATA) are built at [L1162](../../src/renderers/webgpu/ParametricExportComputer.ts#L1162) from `chains` — which at that point have been through linking, re-snap, AND smoothing. The positions diverge by up to maxConsecDelta ≈ 0.003 in U-space (~0.75mm on a 250mm circumference pot). This explains why "debug dots and debug lines don't coincide."

Newton refinement would not fix this visualization issue because the dots show RAW features (one per row per detection) while lines show CHAIN features (linked across rows). Even with exact positions, the dots and lines would differ wherever the linker skips a feature or picks a different one.

---

### C10 [NOTE]: Dispatch Overhead for 5,280-Point Workloads

**Generator's open question**: "Is dispatch overhead significant for 5280-point workloads?"

Each WebGPU compute dispatch involves: command encoding, queue submission, GPU kernel launch. For 5280 invocations at workgroup_size(64): ceil(5280/64) = 83 workgroups. This is a trivially small dispatch. The overhead is dominated by CPU→GPU→CPU round-trip latency (~0.5-2ms per dispatch on most systems), not by computation. Two sequential Newton dispatches = ~1-4ms total latency. The current single-dispatch re-snap (168,960 probes) has higher compute cost but only one round-trip. Net: Newton may be slightly faster overall (fewer evaluations, but more dispatch overhead). **Not a blocker.**

---

## Accepted Items

### A1: `compute_outer_radius` can be evaluated at arbitrary θ ✓
Confirmed at [adaptive_mesh.wgsl L122](../../src/assets/shaders/adaptive_mesh.wgsl#L122): pure function call, no lookup tables, no sampling grid dependency.

### A2: A new compute pipeline can be added within WebGPU bind group limits ✓
The existing `snap_to_feature_ridges` entry point at [adaptive_mesh.wgsl L929](../../src/assets/shaders/adaptive_mesh.wgsl#L929) demonstrates that multiple compute entry points can coexist. Same bind group layout applies.

### A3: Bisection is more robust than Newton for flat-peak styles ✓
Proposal 2's unconditional convergence is a genuine advantage. However, the precision analysis must use the correct h (see C1).

### A4: Proposal 3 (analytic trajectory fitting) is correctly rejected ✓
Style-specific rational function fitting is fragile, handles bifurcation poorly, and couples to style internals.

---

## New Issues Discovered

### N1: Missing Intermediate Diagnostic
There is no diagnostic log between re-snap (Step 3.5) and smoothing (Step 3.6). This makes it impossible to distinguish how much of the pre-smooth zigzag (0.009) is detection noise (removed by re-snap) vs linking errors (persistent). **Recommendation**: Add a `computeChainDiagnostics` call immediately after re-snap and before smoothing.

### N2: CatRom Subdivision Makes "Primary Chain Edges" Metric Useless
After v25.0 CatRom subdivision, ALL primary edges become non-primary because generated subdivision vertices have `pointIdx = -1`. The "Primary chain edges: total=0" diagnostic is now always zero and provides no useful information. It should be updated to count edges connecting any two vertices from the same original chain (regardless of pointIdx).

### N3: The Root Problem May Be Chain Linking, Not Feature Precision
Given the analysis in C2 (zigzag ≫ detection noise + genuine trajectory variation), the most impactful fix would be to improve chain linking quality — possibly by adding trajectory prediction (next row's expected U) or by using the feature KIND (peak vs valley) more aggressively to prevent chain swaps between nearby features of different types.

---

## Open Questions for Generator

1. What is the step size `h` you would use after seeing the f32 analysis? The existing snap shader uses h=0.001— would you match that, or compute an optimal value?

2. Given that Newton/bisection achieves the SAME precision as the existing re-snap (±4×10⁻⁶), what is the revised value proposition of replacing re-snap? Is it just fewer GPU evaluations?

3. How do you propose to fix the chain-strip constraint pipeline (total=0)? This is blocking feature enforcement in the mesh independently of feature position precision.

4. Would you accept keeping WH smoothing as a safety net (default on, configurable off) until chain linking quality is verified?

---

## Final Recommendation

### Should the Master approve Proposal 1? **NOT YET.**

The proposal needs revision to address three critical issues:

1. **Correct the f32 precision analysis.** Replace h=10⁻⁴ with h≈0.005-0.01. Acknowledge that achievable precision is ±4×10⁻⁶ (equivalent to re-snap), not "machine precision." The value proposition shifts from "exact positions" to "same precision, fewer GPU evaluations, simpler code."

2. **Do NOT remove WH smoothing.** The zigzag is dominated by chain linking errors, not detection noise. Newton refinement confirms wrong positions with precision but doesn't fix the topology. Keep smoothing until the linking problem is solved. Gate removal behind a config flag with default=on.

3. **Address the chain-strip constraint bug.** This is the most impactful issue — without constraint enforcement, no amount of position precision matters for mesh quality. This may be a separate work item but must be acknowledged and planned.

### Revised Proposal Conditions (If Generator Addresses the Above)

If the Generator revises the proposal per the above, I would **ACCEPT WITH AMENDMENTS**:

- Implement Newton-Raphson with h=0.007 and bisection fallback (hybrid as proposed)
- Keep WH smoothing (default on), add config flag `exactFeaturePositions` to disable smoothing when Newton is active
- Add post-re-snap / pre-smooth diagnostic
- Fix or at least diagnose the chain-strip constraint total=0 issue
- Newton-refine CatRom subdivision points in a second pass
- Update the metric: reframe from "5× precision improvement" to "4× fewer GPU evaluations with equivalent precision"

### Validation Protocol (For Executioner, After Revision)

1. Build: clean, no new TS errors
2. Tests: all existing + new Newton/bisection unit tests
3. Post-Newton maxConsecDelta: compare to post-re-snap value (should be similar, ~0.003)
4. Post-smooth maxConsecDelta: unchanged (smoothing still active)
5. Chain-strip constraints: total > 0 (if constraint bug is fixed)
6. Visual test: debug dots and lines should be closer (both use post-Newton positions)
7. Performance: total export time ≤ 110% of current (Newton dispatches may add latency)
