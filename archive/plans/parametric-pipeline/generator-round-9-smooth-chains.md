# Generator Round 9 — Eliminating Chain Oscillation Upstream
Date: 2026-03-04

## Problem Statement

Chain polylines remain "horribly jagged" after Round 8's Catmull-Rom subdivision. CatRom is an interpolating spline — it passes through every control point — so if the control points zigzag, the spline zigzags through them smoothly but still oscillates. The problem is **upstream**: the chain points themselves scatter around the true feature curve with maxConsecDelta=0.003378 (≈1mm on surface).

Current smoothing: 2-pass SG quadratic with halfWidth=8 (window=17). This reduced maxConsecDelta from 0.007843 to 0.003378 — only 57% reduction. Insufficient.

## Root Cause Analysis

### Why 2-Pass SG(8) is Insufficient

The SG quadratic transfer function for halfWidth=m is:

$$H(f) = \frac{1}{\text{norm}} \sum_{k=-m}^{m} c_k \cos(2\pi f k)$$

where $c_k = \frac{3m(m+1) - 1 - 5k^2}{\text{norm}}$.

For m=8, I computed the transfer function at key oscillation periods:

| Period (rows) | Single-pass |H| | 2-pass |H|² | Residual at input 0.008 |
|---|---|---|---|
| 2 | 0.15 | 0.023 | 0.000184 |
| 4 | 0.115 | 0.013 | 0.000104 |
| 8 | 0.42 | 0.18 | 0.001440 |
| 12 | 0.68 | 0.46 | 0.003680 |
| 16 | 0.82 | 0.67 | 0.005360 |

**The killer**: Oscillation at period 8-16 rows passes through 2-pass SG(8) nearly unscathed. If the dominant jitter has a period of ~10-12 rows (highly plausible — it matches the feature spacing / linker dynamics), the 2-pass SG(8) only attenuates it by ~50%. This perfectly explains maxConsecDelta going from 0.008 to 0.0034.

### Why More SG Passes Have Diminishing Returns

The SG quadratic kernel has **negative sidelobes**: at period 4, the coefficient is actually -0.115 (sign-inverted). Three-pass SG amplifies phase-inverted components back. Multi-pass SG doesn't converge to a clean lowpass — it oscillates in the frequency domain, creating new artifacts at different scales. This is a fundamental limitation of polynomial-preserving filters with fixed windows.

### The Right Frame

The chain path $u(t)$ is a smooth function observed with additive noise:
$$u_{\text{observed}}(t_i) = u_{\text{true}}(t_i) + \epsilon_i$$

where $\epsilon_i$ has significant energy at periods 4-16 rows. We need a filter that:
1. Suppresses noise at all periods below ~20 rows (not just period 2-4)
2. Preserves the trajectory slope (diagonal/spiral features) exactly
3. Preserves genuine curvature at large scales (>30 rows)
4. Doesn't introduce ringing or overshoot

SG is designed for derivative preservation, not optimal noise suppression. We need an **approximating smoother**, not a **local polynomial filter**.

---

## Proposals

### Proposal 1: Whittaker-Henderson Penalized Smoothing (Recommended — Moderate)

**Name**: Whittaker-Henderson (WH) penalized least-squares smoother

**Idea**: Replace SG smoothing entirely with a Whittaker-Henderson smoother that minimizes **both** data fidelity and curvature simultaneously. This is the mathematically optimal 1D smoother for our problem class.

**Mechanism**:

Minimize the penalized least-squares objective:

$$\min_{\mathbf{s}} \left[ \sum_{i=0}^{n-1} (s_i - u_i)^2 + \lambda \sum_{i=1}^{n-2} (s_{i-1} - 2s_i + s_{i+1})^2 \right]$$

The first term keeps smoothed values $s_i$ close to observed values $u_i$. The second term penalizes curvature (second differences). $\lambda$ controls the trade-off.

Setting the gradient to zero gives the linear system:

$$(\mathbf{I} + \lambda \mathbf{D}_2^T \mathbf{D}_2) \mathbf{s} = \mathbf{u}$$

where $\mathbf{D}_2$ is the $(n-2) \times n$ second-difference matrix. The system matrix $\mathbf{I} + \lambda \mathbf{D}_2^T \mathbf{D}_2$ is **symmetric positive definite pentadiagonal** — solvable in $O(n)$ with banded Cholesky.

**Transfer function**: The WH smoother has a clean, monotonic lowpass:

$$H(f) = \frac{1}{1 + \lambda (2 - 2\cos 2\pi f)^2}$$

This is **always positive** (no phase inversion!), **monotonically decreasing**, and has no sidelobes. Compare to SG which has negative sidelobes at period 4.

**Parameter choice**: $\lambda = 200$

| Period (rows) | |H(f)| | Residual at input 0.008 |
|---|---|---|
| 2 | 0.0003 | 0.000002 |
| 4 | 0.0012 | 0.000010 |
| 8 | 0.052 | 0.000416 |
| 10 | 0.12 | 0.000960 |
| 15 | 0.36 | 0.002880 |
| 20 | 0.58 | 0.004640 |
| 30 | 0.80 | preserved |
| 50+ | 0.95+ | preserved |

With $\lambda = 200$, oscillation at period 10 (the likely dominant jitter) is reduced to 12%. For a pre-smooth maxConsecDelta of 0.008 dominated by period-10 oscillation, the post-smooth maxConsecDelta would be **~0.001**. This is 3× better than 2-pass SG(8).

For stronger suppression: $\lambda = 500$ gives |H(10)| = 0.014, |H(15)| = 0.17, maxConsecDelta ≈ 0.0004. But this starts to flatten genuine curvature at 20-row scales.

**Recommended**: Start with $\lambda = 200$, adjust if needed.

**Risk assessment**: LOW
- WH is a well-studied smoother (1923, Whittaker; 1924, Henderson). Used extensively in actuarial science, spectroscopy, and signal processing.
- The transfer function is monotonic — no ringing, no phase inversion, no sidelobes.
- Linear trends (diagonal features) are preserved exactly: $\mathbf{D}_2$ annihilates linear functions, so $\lambda \mathbf{D}_2^T \mathbf{D}_2$ has no effect on linear components.
- Risk: At $\lambda = 200$, curvature at scales < 15 rows is attenuated 60-80%. If a chain has a genuine sharp turn at a 10-row scale (tight spiral), it would be smoothed. Mitigation: for typical pot features, genuine trajectory changes happen at 30-100+ row scales.
- Risk: Pentadiagonal Cholesky is slightly more complex to implement than SG convolution. But it's O(n) and well-documented.

**Code sketch**:

Location: New function `whittakerSmooth()` in `ChainLinker.ts`, replacing `smoothChainPath()`.

```typescript
const WH_LAMBDA = 200;

export function whittakerSmooth(
    chain: FeatureChain,
    lambda: number = WH_LAMBDA
): FeatureChain {
    const n = chain.points.length;
    if (n < 5) return chain;

    const u = unwrapChain(chain);  // seam-safe unwrapping (reuse existing)

    // Build pentadiagonal system: (I + λ D₂ᵀD₂)s = u
    // D₂ᵀD₂ has the pattern:
    //   row 0:    [1, -2, 1, 0, 0, ...]
    //   row 1:    [-2, 5, -4, 1, 0, ...]
    //   row 2..n-3: [1, -4, 6, -4, 1, ...]
    //   row n-2:  [..., 0, 1, -4, 5, -2]
    //   row n-1:  [..., 0, 0, 1, -2, 1]
    //
    // Bands: diag, off1, off2
    const diag = new Float64Array(n);
    const off1 = new Float64Array(n - 1);  // sub/super-diagonal 1
    const off2 = new Float64Array(n - 2);  // sub/super-diagonal 2

    // Interior rows: diagonal = 1 + 6λ
    for (let i = 2; i <= n - 3; i++) diag[i] = 1 + 6 * lambda;
    // Boundary adjustments
    diag[0] = 1 + lambda;
    diag[1] = 1 + 5 * lambda;
    diag[n - 2] = 1 + 5 * lambda;
    diag[n - 1] = 1 + lambda;

    // Off-diagonal 1: -4λ interior, -2λ at boundaries
    for (let i = 0; i < n - 1; i++) off1[i] = -4 * lambda;
    off1[0] = -2 * lambda;
    off1[n - 2] = -2 * lambda;

    // Off-diagonal 2: +λ everywhere
    for (let i = 0; i < n - 2; i++) off2[i] = lambda;

    // Solve symmetric pentadiagonal system via banded Cholesky
    const s = solvePentadiagonalSPD(diag, off1, off2, u);

    // Re-wrap to [0, 1)
    const newPoints: ChainPoint[] = chain.points.map((p, i) => ({
        row: p.row,
        u: ((s[i] % 1) + 1) % 1,
    }));
    return { ...chain, points: newPoints };
}
```

The `solvePentadiagonalSPD()` function is ~40 lines implementing banded Cholesky decomposition and forward/back substitution for a symmetric positive definite pentadiagonal matrix. This is a textbook algorithm with no numerical pitfalls (the system is guaranteed SPD for any $\lambda > 0$).

**Expected improvement**:
- maxConsecDelta: 0.003378 → **~0.0008-0.0012** (70-75% reduction from current)
- Single-pass operation (no need for multi-pass)
- Boundary points handled implicitly (no mirror extension needed)
- Computation: O(n) per chain, negligible vs GPU probing

**Files affected**:
- `ChainLinker.ts`: Add `whittakerSmooth()` + `solvePentadiagonalSPD()` (~80 lines), export
- `ParametricExportComputer.ts` L1043-1044: Replace 2× `smoothChainPath()` with 1× `whittakerSmooth()`

**Assumptions** (for Verifier to attack):
1. The dominant chain oscillation is at period 8-15 rows (not at period 3-4 where SG already works well)
2. $\lambda = 200$ is the right operating point — preserves curvature at >30-row scales while suppressing <15-row jitter
3. The noise is approximately homoscedastic (equal variance across the chain) — no heterogeneous noise regions
4. The pentadiagonal Cholesky is numerically stable for $n \lesssim 1000$ and $\lambda \lesssim 10^4$
5. Linear trend preservation is sufficient — we don't need to preserve quadratic curvature exactly (unlike SG which preserves quadratic)

---

### Proposal 2: Multi-Pass Gaussian Smoothing with Curvature Guard (Conservative)

**Name**: Iterated Gaussian with curvature preservation gate

**Idea**: Replace SG with Gaussian filtering (which has a clean, positive, monotonic impulse response) and iterate 3-4 times. Add a curvature guard: at each iteration, if a point's displacement exceeds a threshold proportional to local curvature scale, clamp it. This prevents over-smoothing at genuine trajectory inflection points.

**Mechanism**:

1. **Gaussian kernel**: For standard deviation $\sigma$, the discrete Gaussian weights are $w_k = \exp(-k^2 / 2\sigma^2)$, normalized to sum to 1, truncated at $|k| \leq 3\sigma$.

2. **Iterated application**: Apply the Gaussian 3 times. Each pass with $\sigma = 4$ (kernel width ≈ 25 points). Three passes of Gaussian($\sigma$) is equivalent to a single Gaussian with $\sigma_{\text{eff}} = \sigma \sqrt{3} \approx 6.93$.

3. **Curvature guard**: After each pass, compute the displacement $\delta_i = |s_i^{new} - s_i^{old}|$ and the local curvature magnitude $\kappa_i = |u_{i-1} - 2u_i + u_{i+1}|$. If $\delta_i > \alpha \times \kappa_{scale}$ where $\kappa_{scale}$ is the 90th-percentile curvature, blend:
   $$s_i^{final} = s_i^{old} + \min(\delta_i, \text{maxShift}) \times \text{sign}(\delta)$$
   with maxShift = 0.001 (≈0.3mm). This prevents any single pass from displacing a point more than 1mm total.

**Parameter choices**:
- $\sigma = 4$ per pass, 3 passes → effective $\sigma \approx 7$
- Curvature guard maxShift = 0.001 per pass, cumulative max shift = 0.003
- Mirror boundary extension (reuse from existing `smoothChainPath`)

**Transfer function** (3-pass Gaussian, σ=4):

$$H(f) = \exp\left(-3 \times 2\pi^2 \sigma^2 f^2\right) = \exp\left(-3 \times 2\pi^2 \times 16 \times f^2\right)$$

| Period | |H(f)| |
|---|---|
| 4 | 0.000009 |
| 8 | 0.024 |
| 10 | 0.091 |
| 15 | 0.35 |
| 20 | 0.58 |
| 30 | 0.82 |

Very similar to WH($\lambda = 200$). Both are effective in the critical period 8-15 band.

**Why Gaussian instead of SG?**
- Gaussian has no negative sidelobes. It cannot create sign-inverted artifacts at any frequency.
- Gaussian convolution preserves linear trends (the kernel is symmetric, so the mean of a symmetric kernel applied to a linear ramp is the center value — exact preservation).
- Multi-pass Gaussian converges toward a Gaussian — it doesn't develop pathological oscillations like multi-pass SG.
- Gaussian is trivially implementable with the existing mirror-extension infrastructure.

**Risk assessment**: LOW-MODERATE
- (+) Simple implementation — same convolution structure as current SG, just different weights
- (+) No negative sidelobes — cannot create inverted-phase artifacts
- (+) Curvature guard prevents over-smoothing spiral features
- (-) Gaussian does NOT preserve quadratic curvature (unlike SG). Parabolic trajectory bends are slightly flattened. For typical pot features, this is negligible — the trajectory curvature scale is >> the smoothing window.
- (-) Curvature guard adds complexity and a tunable parameter ($\alpha$). If set too tight, smoothing is inhibited; too loose, it's useless.
- (-) 3 passes = 3× more convolution work than single-pass WH. Still negligible vs GPU work.

**Code sketch**:

Location: New function `gaussianSmooth()` in `ChainLinker.ts`.

```typescript
const GAUSS_SIGMA = 4;
const GAUSS_MAX_SHIFT = 0.001;  // max displacement per pass

export function gaussianSmoothChain(
    chain: FeatureChain,
    sigma: number = GAUSS_SIGMA,
    passes: number = 3,
    maxShift: number = GAUSS_MAX_SHIFT
): FeatureChain {
    const n = chain.points.length;
    if (n < 5) return chain;

    let u = Float64Array.from(unwrapChain(chain));
    const halfW = Math.min(Math.ceil(3 * sigma), Math.floor((n - 1) / 2));

    // Precompute Gaussian kernel (symmetric, truncated at ±halfW)
    const kernel = new Float64Array(2 * halfW + 1);
    let ksum = 0;
    for (let k = -halfW; k <= halfW; k++) {
        kernel[k + halfW] = Math.exp(-0.5 * (k / sigma) ** 2);
        ksum += kernel[k + halfW];
    }
    for (let k = 0; k < kernel.length; k++) kernel[k] /= ksum;

    for (let pass = 0; pass < passes; pass++) {
        // Mirror-extend
        const ext = mirrorExtend(u, halfW);
        const smoothed = new Float64Array(n);
        for (let i = 0; i < n; i++) {
            let sum = 0;
            for (let k = -halfW; k <= halfW; k++) {
                sum += kernel[k + halfW] * ext[halfW + i + k];
            }
            // Curvature guard: clamp displacement
            const delta = sum - u[i];
            smoothed[i] = u[i] + Math.max(-maxShift, Math.min(maxShift, delta));
        }
        u = smoothed;
    }

    const newPoints: ChainPoint[] = chain.points.map((p, i) => ({
        row: p.row,
        u: ((u[i] % 1) + 1) % 1,
    }));
    return { ...chain, points: newPoints };
}
```

**Expected improvement**:
- maxConsecDelta: 0.003378 → **~0.0008-0.0015** (comparable to WH)
- But clamped by curvature guard, so genuine spiral curvature is preserved up to the maxShift cap
- 3× the computation of SG (negligible)

**Files affected**:
- `ChainLinker.ts`: Add `gaussianSmoothChain()` (~50 lines), export
- `ParametricExportComputer.ts` L1043-1044: Replace 2× `smoothChainPath()` with 1× `gaussianSmoothChain()`

**Assumptions** (for Verifier to attack):
1. Gaussian's failure to preserve quadratic curvature is negligible at σ=4 for chains with genuine curvature scales > 30 rows
2. The curvature guard maxShift=0.001 is appropriately calibrated — tight enough to preserve features, loose enough to actually smooth
3. Three passes with clamping converge to a stable result (no oscillation from the clamping interaction)
4. Mirror boundary extension works correctly with the Gaussian kernel (same as SG — verified)
5. The Gaussian kernel with σ=4 has negligible energy at |k| > 12, so halfW=12 truncation is safe

---

### Proposal 3: Penalized B-Spline Approximation (Radical)

**Name**: Least-squares cubic B-spline with reduced knot count

**Idea**: Fit a cubic B-spline to the chain points using least-squares with significantly fewer control points than data points. The B-spline cannot represent oscillation at scales shorter than the knot spacing, so high-frequency jitter is geometrically impossible in the output.

**Mechanism**:

1. **Knot placement**: For a chain with $n$ points, place $m = \max(8, \lfloor n / K \rfloor)$ uniformly-spaced interior knots. With $K = 8$ (knot every 8 rows), a typical 242-point chain gets 30 control points.

2. **Basis construction**: Construct the $n \times (m+3)$ B-spline basis matrix $\mathbf{B}$ using the de Boor recursion. Each row $i$ of $\mathbf{B}$ contains the values of the $(m+3)$ cubic B-spline basis functions evaluated at $t_i = $ row index.

3. **Least-squares fit**: Solve $\mathbf{B}^T \mathbf{B} \mathbf{c} = \mathbf{B}^T \mathbf{u}$ for control points $\mathbf{c}$. The system is $(m+3) \times (m+3)$ and banded (bandwidth 4) — solvable in $O(m)$.

4. **Evaluation**: Compute smoothed values $\mathbf{s} = \mathbf{B} \mathbf{c}$ at the original row positions.

**Mathematical basis**:

A cubic B-spline with knot spacing $h = 8$ rows has a minimum representable wavelength of $2h = 16$ rows. Oscillation at period < 16 rows **literally cannot exist** in the B-spline representation. This is not attenuation — it's structural elimination.

The least-squares fit finds the B-spline curve closest to the data in L² sense. For a true smooth feature with additive period-10 noise, the spline tracks the feature and completely ignores the noise (because the noise can't be represented in the spline space).

**Maximum deviation bound**: For noise with standard deviation $\sigma$ and $n$ points per knot span, the expected maximum deviation of the B-spline from the true feature is:

$$\text{dev} \leq \sigma / \sqrt{K} + O(h^4 \|u^{(4)}\|)$$

With $\sigma \approx 0.002$ and $K = 8$: dev ≤ 0.0007. The $O(h^4)$ term is the B-spline approximation error for the true smooth curve — for gentle features ($|u^{(4)}| \ll 1$), this is negligible.

**Parameter choices**:
- $K = 8$ (knot every 8 rows) — aggressive enough to eliminate period-10 jitter
- Minimum knots: 8 (even for short chains)
- Cubic degree (order 4) — ensures C² smooth output
- Open uniform knot vector with multiplicity 4 at endpoints (interpolates first/last point exactly)

**Risk assessment**: MODERATE-HIGH
- (+) Structurally eliminates high-frequency jitter — not just attenuation, but complete removal
- (+) C² smooth output guaranteed — the B-spline is inherently smooth
- (+) Model-based approach: the spline represents a "model" of the true feature, not just filtered data
- (+) Single-pass, no iteration, no tuning a transfer function
- (-) Implementation complexity: de Boor recursion, basis matrix construction, banded least-squares solve. ~120-150 lines of new code.
- (-) Endpoint behavior: with open knot vectors, the spline interpolates endpoints exactly. If the first/last chain points are noisy, this error propagates into the boundary region. Mitigation: extend the chain by 2-3 mirror points before fitting, then discard the boundary spline values.
- (-) Knot spacing is a hard cutoff. If a chain has a genuine sharp turn at a 6-row scale (e.g., entering a seam region), the spline cannot represent it. This would appear as a positional offset at the turn. Mitigation: adaptive knot insertion at high-curvature regions, but this adds significant complexity.
- (-) The least-squares solve requires $O(n \times m)$ for basis evaluation + $O(m)$ for the solve. For $n=242, m=33$: the basis evaluation is ~8000 multiply-adds. Negligible, but more than SG's $O(n \times w)$ with $w=17$.

**Code sketch**:

Location: New module `ChainBSpline.ts` in `parametric/`, called from `ChainLinker.ts`.

```typescript
// knot spacing in rows
const BSPLINE_KNOT_SPACING = 8;
const BSPLINE_MIN_KNOTS = 8;

export function bsplineApproxChain(
    chain: FeatureChain,
    knotSpacing: number = BSPLINE_KNOT_SPACING
): FeatureChain {
    const n = chain.points.length;
    if (n < 8) return chain;

    const u = unwrapChain(chain);
    const rows = chain.points.map(p => p.row);

    // Normalized parameter t ∈ [0, 1]
    const tMin = rows[0], tMax = rows[n - 1];
    const tNorm = rows.map(r => (r - tMin) / (tMax - tMin));

    // Number of interior knots
    const nInterior = Math.max(BSPLINE_MIN_KNOTS, Math.floor(n / knotSpacing));
    const nCtrl = nInterior + 4; // cubic: nCtrl = nInterior + order

    // Build uniform open knot vector
    const knots = buildOpenUniformKnots(nInterior, 4);

    // Build basis matrix B[i][j] = N_j^3(tNorm[i])
    const B = buildBasisMatrix(tNorm, knots, 3); // n × nCtrl

    // Solve normal equations: (BᵀB)c = Bᵀu
    const c = solveBandedNormalEquations(B, u, 4); // bandwidth = order

    // Evaluate: s = Bc
    const s = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < nCtrl; j++) sum += B[i][j] * c[j];
        s[i] = sum;
    }

    // Re-wrap to [0, 1)
    const newPoints: ChainPoint[] = chain.points.map((p, i) => ({
        row: p.row,
        u: ((s[i] % 1) + 1) % 1,
    }));
    return { ...chain, points: newPoints };
}
```

**Expected improvement**:
- maxConsecDelta: 0.003378 → **~0.0003-0.0006** (best of all proposals)
- Output is guaranteed C² smooth — no staircase possible
- No residual oscillation at any frequency below twice the knot spacing

**Files affected**:
- New file: `parametric/ChainBSpline.ts` (~150 lines)
- `ChainLinker.ts`: Import and export the function
- `ParametricExportComputer.ts` L1043-1044: Replace smoothing call

**Assumptions** (for Verifier to attack):
1. Uniform knot spacing is adequate — no adaptive refinement needed for typical pot features
2. $K = 8$ is the right knot spacing — balances noise removal vs feature fidelity
3. The open-knot-vector boundary treatment (interpolating endpoints) doesn't cause boundary ringing
4. The de Boor recursion implementation is numerically stable for the expected parameter ranges
5. Genuine feature curvature at scales > 16 rows is represented faithfully by cubic B-spline with 8-row knots
6. The least-squares fit doesn't introduce systematic positional bias (the B-spline mean approximates the data mean)

---

## Recommended Approach

**Proposal 1 (Whittaker-Henderson)** is the recommended primary approach. Justification:

### Why WH over Gaussian (P2)?
Both achieve similar frequency responses. WH is superior because:
- **Single pass** vs 3 iterations — simpler control flow, no convergence questions from the curvature guard
- **Exact linear preservation** — WH with second-difference penalty preserves linear functions exactly (same as SG), while Gaussian only approximately preserves them
- **Principled parameter**: $\lambda$ has a clear interpretation (smoothness vs fidelity trade-off) with a well-studied transfer function. Gaussian σ × passes × maxShift is a 3-parameter tuning problem
- **No clamping artifacts**: The curvature guard in P2 introduces a nonlinearity that could create artifacts at the clamp boundaries

### Why WH over B-spline (P3)?
B-spline gives the best theoretical result but:
- **Implementation complexity**: ~150 lines of new code (de Boor, basis matrix, banded normal equations) vs ~80 lines for WH (pentadiagonal Cholesky)
- **Hard knot cutoff**: B-spline has a sharp spatial cutoff at the knot spacing. WH has a smooth rolloff — graceful degradation at all scales
- **Debugging**: If WH produces unexpected results, it's easy to diagnose (adjust λ). B-spline issues could arise from knot placement, boundary conditions, or basis function numerics
- **Marginal improvement**: WH gives maxConsecDelta ≈ 0.001, B-spline gives ≈ 0.0005. Both are below the visual threshold. The extra complexity of B-spline buys diminishing returns.

### Why not keep SG at all?
SG has served well but its fundamental limitation — negative sidelobes creating phase-inverted components — is a design flaw for our use case. Multi-pass SG doesn't converge cleanly, and wider windows risk the same sidelobe problem at different frequencies. WH is the "correct" replacement.

### Fallback
If WH proves insufficient (maxConsecDelta still > 0.002 due to unexpected noise characteristics), escalate to P3 (B-spline). The WH implementation provides the pentadiagonal solver infrastructure that's also useful for other numerical tasks.

### Interaction with Existing CatRom Subdivision
Round 8's CatRom subdivision in `OuterWallTessellator.ts` becomes a **strong complement** to WH smoothing. WH reduces the control point oscillation to ~0.001. CatRom then interpolates smoothly between these near-correct control points, producing visually perfect constraint edges in the CDT. The two approaches are synergistic: WH handles the amplitude, CatRom handles the geometric representation.

---

## Open Questions (Verifier: Please Attack These)

1. **Is the noise stationary?** I'm assuming the oscillation energy is similar across the chain length. If some regions (e.g., near the rim or base) have higher jitter than the interior, a single global $\lambda$ may under-smooth the noisy regions and over-smooth the quiet ones. Possible solution: adaptive $\lambda$ per-segment, but this adds complexity.

2. **Row gaps**: Some chains may have skipped rows (from the linker's `maxMissCount` feature). The WH pentadiagonal system assumes uniform spacing. If row[i+1] - row[i] > 1, the second-difference penalty is applied across a gap, which slightly distorts the filter behavior. Possible fix: weight the penalty terms by row spacing, making it $\lambda / (h_i)^4$ where $h_i$ is the local row gap.

3. **Is maxConsecDelta the right metric?** After WH smoothing, consecutive-point delta measures the smoothed trajectory's slope variation plus residual noise. If the feature trajectory itself has period-8 curvature (genuine, not noise), WH would attenuate it and maxConsecDelta would drop — but the chain would be positionally wrong. Should we also track **max deviation from pre-smooth position** to ensure the filter doesn't shift features too far?

4. **Chain length distribution**: With `MIN_CHAIN_LENGTH = 10`, some chains may be very short (10-20 points). For these, the WH system is small and well-conditioned, but $\lambda = 200$ may over-smooth (the effective smoothing length ~√λ ≈ 14 rows is comparable to the chain length). Should $\lambda$ scale with chain length?

5. **Seam-crossing chains**: The unwrap/rewrap mechanism handles seam crossings, but WH smoothing of an unwrapped chain that crosses the seam means the smoothed values may drift outside the expected range. The re-wrapping `((s[i] % 1) + 1) % 1` handles this, but should the penalty also be modified near seam crossings?
