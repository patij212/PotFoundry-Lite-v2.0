# Verifier Round 7 — Critique of Generator's Smoothing Proposals
Date: 2026-03-04
Agent: Verifier (dispatched by Master)

## Overall Assessment

The Generator's analysis is directionally correct. The frequency response argument for increasing SG halfWidth is sound — window=7 passes oscillations with period >12 rows, and the convergence-zone oscillation pattern likely has >12 row periodicity. The three-track structure is well-organized.

**Verdict: ACCEPT WITH AMENDMENTS** for P1+P2+P3+P4. DEFER P5 pending post-smooth data.

---

## C1 [ACCEPT]: P1 — SG halfWidth 3→8

Sound proposal. SG quadratic preserves linear trends exactly, so diagonal chains are safe. The risk of over-smoothing at halfWidth=8 is real but acceptable — the window spans 17 points of a typical 243-point chain (7%), well within safe territory.

**One concern**: The `smoothChainPath` function recomputes SG coefficients on every call. With 20 chains and 2 passes (P2), that's 40 coefficient computations. At halfWidth=8, the coefficient array is 17 elements — trivial cost. No action needed, just noting for completeness.

**ACCEPTED as-is.**

---

## C2 [ACCEPT WITH AMENDMENT]: P2 — 2-Pass Smoothing

Two passes of SG is mathematically equivalent to applying a single filter whose transfer function is the square of the single-pass transfer function. This is well-established signal processing.

**Amendment**: The Generator should verify that the **too-short guard** (`n < 2*halfWidth + 1`) doesn't silently skip the second pass on very short chains. With halfWidth=8, chains shorter than 17 points would be returned unsmoothed. After `filterLowConfidenceChains` (MIN_CHAIN_LENGTH=10), chains of 10-16 points survive the confidence filter but skip smoothing entirely. These short chains may still oscillate.

**Fix**: For chains too short for the full window, apply SG with a reduced halfWidth that fits: `const effectiveHW = Math.min(halfWidth, Math.floor((n-1)/2))`. This gives every chain SOME smoothing.

**ACCEPTED WITH AMENDMENT: adaptive halfWidth for short chains.**

---

## C3 [CRITICAL]: P3 — Boundary Linear Extrapolation

**The pseudocode has a critical bug.** The Generator proposes:
```typescript
const slope = smoothed[m + 1] - smoothed[m];
for (let i = m - 1; i >= 0; i--) {
    smoothed[i] = smoothed[i + 1] - slope;
}
```

This uses a fixed slope from positions m and m+1 to extrapolate ALL boundary points. Why this is wrong:

1. **It assumes the chain is linear at the boundary.** Chains that curve (e.g., petal tips, convergence zones) have non-zero curvature at the boundary. A fixed slope will diverge from the true feature.

2. **Better approach — use the SG itself with a partial window.** The SG filter can be reformulated for edge cases: compute the polynomial fit over the available points (asymmetric window) and evaluate at the boundary position. This is called "SG edge extension" and is well-documented in the literature.

3. **Simplest robust fix — mirror extension.** Before smoothing, extend the unwrapped array by mirroring the boundary data: `[u[m-1], u[m-2], ..., u[0], u[0], u[1], ..., u[n-1], u[n-1], u[n-2], ..., u[n-m]]`. Then apply SG to the extended array and trim back to n points. This is the standard approach in signal processing and preserves the curvature at boundaries.

**REJECTED as stated. Replace with mirror extension approach:**
```typescript
// Mirror-extend the unwrapped array for boundary handling
const extended = new Float64Array(n + 2 * m);
// Mirror leading boundary
for (let i = 0; i < m; i++) {
    extended[i] = 2 * unwrapped[0] - unwrapped[m - i];
}
// Copy interior
for (let i = 0; i < n; i++) {
    extended[m + i] = unwrapped[i];
}
// Mirror trailing boundary
for (let i = 0; i < m; i++) {
    extended[m + n + i] = 2 * unwrapped[n - 1] - unwrapped[n - 2 - i];
}

// Apply SG to extended array, extract middle n values
const smoothed = new Float64Array(n);
for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -m; k <= m; k++) {
        sum += coeffs[k + m] * extended[m + i + k];
    }
    smoothed[i] = sum;
}
```

This eliminates the boundary/interior split entirely. Every point gets full SG treatment.

---

## C4 [ACCEPT]: P4 — Post-Smooth Diagnostic

**ACCEPTED as-is.** Essential for validation. Should use the same `computeChainDiagnostics` function for consistency.

One addition: also log the **per-chain worst offenders** (top 3 chains by maxConsecDelta) so we can identify if the problem is concentrated in specific chains or spread across all chains. This helps distinguish between a systemic oscillation problem and a few pathological chains.

---

## C5 [DEFER]: P5 — Crossing Constraint Removal

**Correct direction but premature.** The crossing constraint problem is a SYMPTOM of chain oscillation. If P1+P2+P3 bring maxConsecDelta below 0.002, the crossing constraint problem may self-resolve because smooth chains that are 0.002 apart (more than 1 grid column) won't cross each other.

**Decision**: Implement P1-P4 first. Measure post-smooth maxConsecDelta and missing edges. If missing edges remain >50 after smoothing improvement, THEN implement P5.

**The Generator's O(E²) sweep approach is reasonable** but could be replaced by a spatial hash grid for O(E·logE) average case. Not worth optimizing until we know if it's needed.

**DEFERRED pending post-smooth data.**

---

## C6 [ACCEPT]: P6 — Track C Feasibility Assessment

Agree with the Generator's assessment: not feasible in the current architecture. The GPU evaluatePoints infrastructure is the correct abstraction — no need to replicate WGSL math in TypeScript.

The Generator's alternative insight (post-smooth GPU re-snap to verify) is **excellent** and should be promoted from a footnote to a formal proposal. If smoothing moves a chain point too far from its true feature, the GPU re-snap would detect it. This provides a safety net for over-smoothing.

**ACCEPTED. Recommend post-smooth GPU verification as a future enhancement (not Round 7 scope).**

---

## Converged Implementation Plan

1. **Modify `smoothChainPath`** in ChainLinker.ts:
   - Change `SMOOTH_HALFWIDTH` from 3 to 8
   - Replace boundary handling with mirror extension (C3 amendment)
   - Add adaptive halfWidth for short chains: `const effectiveHW = Math.min(halfWidth, Math.floor((n-1)/2))` (C2 amendment)

2. **Modify PEC Step 3.6:**
   - Apply 2-pass smoothing
   - Add post-smooth diagnostic (P4)

3. **No changes to**: CDT, companions, tessellation, feature detection, chain linking

## Validation Protocol

After implementing:
1. Run export with same settings as Round 6 (chainStrip=cdt/d12/e4/rtrue)
2. Check post-smooth diagnostic: maxConsecDelta < 0.002
3. Check missing chain edges: target < 50
4. Check maxAspect UV: target < 1000:1
5. Check inverted triangles: target < 10K

If maxConsecDelta < 0.002 but missing edges still > 50, implement P5 (crossing constraint removal).
If maxConsecDelta still > 0.002, increase halfWidth further or add a 3rd pass.
