# Verifier Round 9 — Critique of Generator Chain Smoothing Proposals
Date: 2026-03-04

## Summary Verdict: ACCEPT WITH AMENDMENTS (P1: Whittaker-Henderson)

The Generator's diagnosis of SG(8) limitations is mathematically sound, and the recommendation of WH smoothing is the correct choice. However, the WH transfer function table contains **systematically wrong numbers** — the real filter is ~3× more aggressive than claimed in the critical period 8-20 band. This changes the λ recommendation and the risk profile. Amendments required before implementation.

---

## Part I: Chain Smoothing Proposals

### C1 [CRITICAL]: WH Transfer Function Numbers Are Wrong

**Generator's claim**: At λ=200, |H(period=8)| = 0.052, |H(period=10)| = 0.12, |H(period=15)| = 0.36, |H(period=20)| = 0.58.

**Actual behavior**: The Generator's own formula $H(f) = 1/(1 + \lambda(2-2\cos 2\pi f)^2)$ with λ=200 yields:

| Period P | f = 1/P | $(2-2\cos 2\pi f)^2$ | $1 + 200 \cdot (\ldots)$ | Correct |H| | Generator |H| | Error factor |
|---|---|---|---|---|---|---|
| 2 | 0.5 | 16.0 | 3201 | **0.000312** | 0.0003 | ~OK |
| 4 | 0.25 | 4.0 | 801 | **0.00125** | 0.0012 | ~OK |
| 8 | 0.125 | 0.3431 | 69.63 | **0.01436** | 0.052 | **3.6×** |
| 10 | 0.1 | 0.1459 | 30.18 | **0.03314** | 0.12 | **3.6×** |
| 15 | 0.0667 | 0.02990 | 6.980 | **0.1433** | 0.36 | **2.5×** |
| 20 | 0.05 | 0.009582 | 2.917 | **0.3429** | 0.58 | **1.7×** |
| 30 | 0.0333 | 0.001910 | 1.382 | **0.7236** | 0.80 | 1.1× |
| 50 | 0.02 | 0.000249 | 1.0497 | **0.9527** | 0.95+ | ~OK |

**Verification**: $\cos(2\pi/8) = \cos(\pi/4) = \sqrt{2}/2 \approx 0.7071$; $(2-2\times0.7071)^2 = (0.5858)^2 = 0.3432$; $H = 1/(1+200\times0.3432) = 1/69.63 = 0.01436$. Not 0.052.

The Generator's numbers are consistent with **λ ≈ 50**, not λ=200. It appears the Generator computed the table at the wrong λ value, or made a unit/scaling error.

**Impact**: At λ=200, the WH smoother is **far more aggressive** than the Generator intended:
- Period 10 signal preserved at 3.3% (not 12%) — this is near-total suppression
- Period 15 preserved at 14.3% (not 36%) — heavy attenuation
- Period 20 preserved at 34.3% (not 58%) — significant attenuation
- Period 30 preserved at 72.4% (not 80%) — noticeable attenuation

If any chains have genuine trajectory curvature at 15-20 row scales (e.g., entering a tight spiral section), λ=200 would flatten that curvature to 14-34% of its true amplitude. This is over-smoothing.

**Required fix**: Recalibrate λ. To achieve the transfer function profile the Generator *intended* (period 10 at ~12%, period 20 at ~58%), use **λ ≈ 50**. The corrected table for λ=50:

| Period | |H| at λ=50 |
|---|---|
| 2 | 0.00125 |
| 4 | 0.00498 |
| 8 | 0.0551 |
| 10 | 0.121 |
| 15 | 0.401 |
| 20 | 0.676 |
| 30 | 0.913 |

Alternatively, if the Generator genuinely wants aggressive smoothing (period 10 at ~3%), keep λ=200 but acknowledge the real attenuation profile. The Executioner must decide based on visual testing.

**Recommendation**: Start with **λ=50** to match the Generator's intended profile. Provide λ as a configurable constant (already in the code sketch as `WH_LAMBDA`) so it can be tuned empirically.

### C2 [CONFIRMED]: SG(8) Negative Sidelobes at Period 4

**Generator's claim**: The SG quadratic kernel with m=8 has a negative transfer function value at period 4, with "coefficient actually -0.115."

**Verification**: SG quadratic coefficients for m=8:
- $c_k = (3 \times 8 \times 9 - 1 - 5k^2) / \text{norm}$, where norm = $(17 \times 19 \times 15)/3 = 1615$
- $c_0 = 215/1615 = 0.1331$, ..., $c_7 = -30/1615 = -0.0186$, $c_8 = -105/1615 = -0.0650$

Transfer function at f = 0.25 (period 4):
$H(\pi/2) = c_0 + 2(-c_2 + c_4 - c_6 + c_8) = 0.1331 + 2(-0.1207+0.0836-0.0217-0.0650)$
$= 0.1331 + 2(-0.1238) = 0.1331 - 0.2476 = -0.1145$

**Verdict: CONFIRMED**. The value -0.1145 matches the Generator's -0.115. The SG kernel indeed has negative sidelobes, and multi-pass SG amplifies phase-inverted components. The diagnosis is sound.

### C3 [CONFIRMED]: Pentadiagonal Band Structure

**Generator's claim**: $D_2^T D_2$ produces the pattern `[1, -2, 1, 0, ...]` / `[-2, 5, -4, 1, ...]` / `[1, -4, 6, -4, 1, ...]` at boundary / row 1 / interior.

**Verification**: With $D_2$ being the $(n-2) \times n$ second-difference matrix:

- $diag[0] = 1 + \lambda \cdot 1 = 1+\lambda$ ✓
- $diag[1] = 1 + \lambda \cdot 5 = 1+5\lambda$ ✓
- $diag[2..n-3] = 1 + \lambda \cdot 6 = 1+6\lambda$ ✓
- $diag[n-2] = 1+5\lambda$, $diag[n-1] = 1+\lambda$ ✓
- $off1[0] = -2\lambda$, $off1[1..n-3] = -4\lambda$, $off1[n-2] = -2\lambda$ ✓
- $off2[i] = \lambda$ for all $i$ ✓

**Verdict: CONFIRMED**. The code sketch's diagonal/off-diagonal values are mathematically correct. The system matrix is correctly constructed.

### C4 [CONFIRMED]: WH Transfer Function Formula

**Generator's claim**: $H(f) = 1/(1 + \lambda(2-2\cos 2\pi f)^2)$ for the second-order WH smoother.

**Verification**: The second-difference operator $\Delta^2 y_i = y_{i-1} - 2y_i + y_{i+1}$ has frequency response $-(2-2\cos\omega)$ where $\omega = 2\pi f$. The penalty matrix $D_2^T D_2$ has frequency response $(2-2\cos\omega)^2$. The smoother $(I + \lambda D_2^T D_2)^{-1}$ has transfer function $1/(1+\lambda(2-2\cos\omega)^2)$.

**Verdict: CONFIRMED**. The formula is correct. The numerical evaluation is wrong (C1 above), but the analytical formula is right.

### C5 [WARNING]: Row Gap Bias in Pentadiagonal System

**Generator's claim**: The pentadiagonal system assumes uniform row spacing (implicit in using constant coefficients).

**Actual behavior**: The linker uses `maxMissCount = 6` ([ChainLinker.ts](src/renderers/webgpu/parametric/ChainLinker.ts#L492)), allowing chains to bridge gaps of up to 6 consecutive rows. Chain points are stored only at rows where a feature was found. The `unwrapChain()` function ([ChainLinker.ts](src/renderers/webgpu/parametric/ChainLinker.ts#L93)) returns one value per chain point, indexed sequentially — it does NOT encode row position.

**Counterexample**: A chain with points at rows [0, 1, 2, 5, 6, 7, ...] has a 3-row gap between indices 2 and 3. The WH smoother treats indices 2 and 3 as adjacent (spacing h=1), but the true row spacing is h=3. The second-difference penalty $(u_2 - 2u_3 + u_4)^2$ approximates $h^4 u''(x)^2$ (for uniform spacing h), so for h=3 the penalty is 81× too strong relative to what the actual curvature warrants.

**Practical impact**: Moderate. Most chains in typical styles span >200 rows with few gaps (the GPU re-snap step at L994-1038 fills in many gaps). But when gaps occur, the vicinity is slightly over-smoothed, pulling the smoothed chain toward a straight line through the gap region.

**Required fix**: The Generator correctly identified this in Open Question #2. For the initial implementation, this can be deferred — add a TODO comment. If empirical testing reveals positional drift near gap regions, the fix is to weight the penalty by row gap: replace the uniform `D₂` with a non-uniform version where each row of $D_2$ has entries $[1/h_{i-1}, -(1/h_{i-1}+1/h_i), 1/h_i]$ (scaled by appropriate gap widths $h_i = \text{row}_{i+1} - \text{row}_i$). This changes the pentadiagonal coefficients but not the solver structure.

### C6 [CONFIRMED]: WH Is Superior to Gaussian (P2) and B-Spline (P3)

**Generator's claim**: WH is recommended over Gaussian (P2) and B-spline (P3).

**Verdict: CONFIRMED**. The Generator's comparative analysis is sound:
- WH vs Gaussian: Single-pass vs 3-pass, exact linear preservation vs approximate, no clamping artifacts. All valid.
- WH vs B-spline: Lower implementation complexity (~80 vs ~150 lines), smooth rolloff vs hard knot cutoff, easier debugging. All valid.
- The diminishing returns argument (both WH and B-spline exceed visual threshold) is correct, especially now that we know WH at λ=200 is even more aggressive than claimed.

### C7 [WARNING]: Seam Wrapping With Global Solver

**Generator's claim**: "use existing `unwrapChain()`" for seam safety with WH.

**Actual behavior**: `unwrapChain()` ([ChainLinker.ts](src/renderers/webgpu/parametric/ChainLinker.ts#L93-L105)) converts wrapped [0,1) U values to a monotonic unwrapped sequence. This works correctly for the WH solver — the solver sees a smooth, monotonic signal and produces a smooth, monotonic output. Re-wrapping with `((s[i] % 1) + 1) % 1` correctly maps back to [0,1).

The concern about global coupling is unfounded: for second-order WH penalties, the influence kernel decays exponentially with distance, decay length $\sim \lambda^{1/4}$. At λ=50, $\lambda^{1/4} \approx 2.66$ rows; at λ=200, $\approx 3.76$ rows. The effective coupling range is ~4 rows — negligible for chains of 200+ points.

**Verdict**: Seam unwrapping is correct, but there's a **type mismatch** in the code sketch: `unwrapChain()` returns `number[]`, but the WH solver uses `Float64Array` for the diagonals. The RHS vector `u` must be converted to `Float64Array` before the solve, or the solver must accept `number[]`. Minor implementation detail.

**Required fix**: Cast `unwrapChain(chain)` to `Float64Array` in the implementation: `const u = Float64Array.from(unwrapChain(chain));`

### C8 [NOTE]: CatRom Subdivision Interaction — Keep It

**Generator's claim**: "WH handles the amplitude, CatRom handles the geometric representation" — they are synergistic.

**Verification**: This is correct but the reasoning should be sharper. After WH smoothing:
- Chain points are ≈correct U positions (maxConsecDelta ~0.001 or less)
- But chain points are spaced one per row (~313 points across 313 rows)
- CDT constraint edges span the full row-to-row T-distance
- CatRom adds 2 intermediate vertices per edge, tripling the constraint point density

The benefit of CatRom post-WH is **not** further smoothing — the points are already smooth. The benefit is **increased CDT resolution**: shorter constraint edges produce better-shaped triangles near the feature. Without CatRom, constraint edges span full row gaps, and the CDT may produce elongated triangles in the strip bands.

**Verdict**: Keep CatRom. It serves a different purpose (mesh density) than WH (trajectory accuracy). They are genuinely complementary. Do NOT remove CatRom.

### C9 [NOTE]: Lambda Scaling for Short Chains

The Generator correctly raises this concern in Open Question #4. For a chain with 10-20 points, the effective smoothing length $\sim \lambda^{1/4} \approx 2.7$ (at λ=50) or $3.8$ (at λ=200) rows. For a 10-point chain, this means the smoothing window spans ~27-38% of the chain — substantial but not pathological.

However, the endpoints are naturally handled by the WH penalty structure: the boundary rows of $D_2^T D_2$ have reduced penalty (diagonal $1+\lambda$ instead of $1+6\lambda$), so endpoints are held closer to their original values. This implicit boundary handling is actually better than SG's mirror extension for short chains.

**Verdict**: No special λ scaling needed for short chains. The WH boundary structure handles it automatically. If empirical testing shows issues, add a clamp: `const effectiveLambda = Math.min(lambda, n * n / 4)` to prevent the smoothing length from exceeding the chain length.

---

## Part II: Horizontal Line Artifacts

### C10 [CRITICAL]: Debug Lines Render Seam-Crossing Segments as Cross-Pot Lines

**Root cause identified**: The horizontal line artifacts are caused by **seam-crossing debug line segments rendered as straight lines in clip space**.

**Evidence**:

1. Debug line construction in [ParametricExportComputer.ts](src/renderers/webgpu/ParametricExportComputer.ts#L1170-L1188): For each chain, consecutive points are pushed as `[pt.u, finalT[fr]]` using **raw wrapped U values** (0 to 1). No seam-wrapping correction is applied.

2. Segment projection in [useParametricExport.ts](src/hooks/useParametricExport.ts#L375-L385):
   ```
   segs.push(p0[0], p0[1], p1[0], p1[1]);
   ```
   Consecutive chain points become line segments. For a chain crossing the seam, this creates a segment from (u≈0.98, t) to (u≈0.02, t+Δt).

3. Debug line shader in [ShaderManager.ts](src/renderers/webgpu/ShaderManager.ts#L248-L258): Each vertex is projected via `surface_point(0u, uv.x, uv.y)`, which maps u to θ = u×TAU. A segment from u=0.98 to u=0.02 maps to two 3D points nearly **diametrically opposite** on the pot.

4. The pipeline uses `topology: 'line-list'` ([webgpu_core.ts](src/webgpu_core.ts#L4963)). The GPU rasterizes a **straight line in clip space** between the two projected 3D points — this line cuts across the pot's interior, appearing as a horizontal line "breaking out of geometry."

**Why the diagnostic missed it**: The large-Δu-jump counter uses wrap-adjusted distance:
```typescript
if (du > 0.5) du = 1 - du;
if (du > 0.1) largeUJumps++;
```
A seam crossing from u=0.99 to u=0.01 has raw Δu = 0.98, wrap-adjusted to 0.02 — below the 0.1 threshold. The diagnostic correctly reports 0 large jumps, because in *circular* distance the jump is tiny. But the GPU draws in *linear* u-space, producing the cross-pot line.

**How many chains cross the seam?** Any chain whose feature trajectory passes through u=0 (the θ=0 meridian) will have this artifact. For a typical 20-chain style with features uniformly distributed, **1-3 chains** likely cross the seam, producing 1-3 horizontal lines per export.

**Required fix** (for the Executioner):

In [useParametricExport.ts](src/hooks/useParametricExport.ts#L375-L385), when constructing debug segments, detect seam crossings and either:

**(Option A — Skip seam segments)**: If raw |p1[0] - p0[0]| > 0.5, skip the segment entirely. Simplest fix, ~3 lines of code. The chain will have a visual gap at the seam, which is acceptable for debug visualization.

**(Option B — Split seam segments)**: Split the segment into two: one from p0 to (seam_u, lerped_t) and one from (seam_u_wrapped, lerped_t) to p1. More correct but ~15 lines of code. The seam intersection point must be computed carefully:
```typescript
const rawDu = p1[0] - p0[0];
if (Math.abs(rawDu) > 0.5) {
    // Skip this segment to avoid cross-pot line
    continue;
}
```

**Recommendation**: Option A (skip). The debug overlay is for diagnostic purposes; a tiny gap at the seam is far better than a glaring cross-pot line.

### C11 [NOTE]: Same Bug May Exist in useAdaptiveExport.ts

The adaptive export hook at [useAdaptiveExport.ts](src/hooks/useAdaptiveExport.ts#L432-L435) also calls `setDebugSegments`. If it constructs segments from feature chains or contours that cross the seam, the same horizontal line artifact would appear. The fix should be applied in both locations, or better yet, in a shared utility function.

---

## Part III: Accepted Items

1. **SG limitation diagnosis**: The negative sidelobe analysis and multi-pass convergence argument are mathematically correct. CONFIRMED.
2. **WH transfer function formula**: Analytically correct. CONFIRMED.
3. **Pentadiagonal band structure**: Correct in all details (diagonal, off-diagonal values, boundary rows). CONFIRMED.
4. **P1 > P2 > P3 ranking**: Sound comparative analysis. CONFIRMED.
5. **CatRom + WH synergy**: Correct — they address orthogonal quality dimensions. CONFIRMED.
6. **Seam unwrapping correctness**: `unwrapChain()` is compatible with global WH solve. CONFIRMED (with minor type-cast fix).

---

## Open Questions for Generator

1. **Were the WH transfer function numbers computed at a different λ?** The table values match λ≈50 closely. If the Generator intended λ=50 and wrote 200 by mistake, the risk profile changes entirely — λ=50 is a gentler smoother with less over-smoothing risk.

2. **What is the expected curvature scale of genuine feature trajectories?** The Generator asserts "genuine trajectory changes happen at 30-100+ row scales." Can this be validated from the actual chain diagnostic data? If any style has trajectory curvature at 15-row scales, even λ=50 would attenuate it to 40%.

3. **Post-smooth max deviation metric**: The Generator correctly proposes tracking max deviation from pre-smooth position (Open Question #3). Should this be a hard abort (reject the smoothing if deviation exceeds threshold) or just a diagnostic log?

---

## Implementation Conditions (for Executioner)

If the Generator accepts these amendments, the Executioner should implement as follows:

### Phase 1: Fix Horizontal Lines (Priority, independent of smoothing)
1. In `useParametricExport.ts` ~L375-385, add seam-crossing skip:
   ```typescript
   const rawDu = Math.abs(p1[0] - p0[0]);
   if (rawDu > 0.5) continue; // skip seam-crossing debug segments
   ```
2. Check `useAdaptiveExport.ts` for same pattern and apply same fix.

### Phase 2: Implement WH Smoothing
1. Add `whittakerSmooth()` + `solvePentadiagonalSPD()` to `ChainLinker.ts` (~80 lines).
2. Use **λ=50** as the starting value (with `WH_LAMBDA` constant).
3. Cast `unwrapChain()` result to `Float64Array`.
4. In `ParametricExportComputer.ts` L1043-1044, replace `2× smoothChainPath()` with `1× whittakerSmooth()`.
5. Keep `smoothChainPath()` function in the code (don't delete) — it may be useful for A/B comparison.
6. Add a TODO comment near the WH solver about non-uniform row spacing (C5).

### Phase 3: Keep CatRom Subdivision
Do NOT remove CatRom. It serves mesh density purposes orthogonal to smoothing.

### Validation Protocol
1. **Build**: Must compile clean.
2. **Tests**: All existing tests pass + add unit test for `whittakerSmooth()` verifying:
   - Linear input → linear output (exact preservation)
   - Constant input → constant output
   - Known sinusoidal input → verify attenuation matches transfer function at that frequency
   - Short chain (n=5) doesn't crash
   - Seam-crossing chain produces valid [0,1) output
3. **Visual**: Export a style with known chain features. Confirm:
   - No horizontal cross-pot lines in debug overlay
   - Chain paths visually smoother than before
   - Feature correspondence preserved (chains still track the mathematical features)
4. **Diagnostic**: Log post-smooth maxConsecDelta and compare to pre-smooth. Target: 60-80% reduction.

---

*Verifier sign-off: Critique complete. The core proposal (WH smoothing) is mathematically sound despite the numerical errors. The horizontal line diagnosis (C10) is the most impactful finding — it's a quick fix that resolves a user-visible artifact independent of the smoothing work.*
