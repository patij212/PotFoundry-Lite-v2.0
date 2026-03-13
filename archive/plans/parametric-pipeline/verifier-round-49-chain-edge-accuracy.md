# Verifier Round 49 — Critique of Generator Chain Edge Accuracy Proposals

Date: 2026-03-09  
Agent: Verifier (GitHub Copilot — Claude Opus 4.6)

## Summary Verdict: ACCEPT WITH AMENDMENTS

P4 (revert fan midpoints) — **ACCEPT**  
P1 (adaptive wide re-snap) — **ACCEPT WITH AMENDMENTS** (critical sampling resolution issue)  
P2 (chain-coherent DP) — **ACCEPT WITH AMENDMENTS** (expectedDrift needs specification)  
P5 (batch2Remap correction) — **REJECT** (marginal impact, risk mischaracterized)  
P3 (differential tracking) — **DEFER** (too radical for current evidence)

---

## Claim Verification

### Claim 1: Re-snap window is 61× too narrow

**Verdict: CONFIRMED**

**Generator's claim**: `RESNAP_HALFWIDTH = 2.0 / ROW_PROBE_SAMPLES` gives ±0.000244 U; `RIDGE_DIAG_HW = 0.015` is 61× wider.

**Evidence**:
- [ParametricExportComputer.ts](../../../potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L981): `const RESNAP_HALFWIDTH = 2.0 / ROW_PROBE_SAMPLES;`
- [ParametricExportComputer.ts](../../../potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L466): `cfgRowProbeSamples = pc?.rowProbeSamples ?? 8192`
- 2.0 / 8192 = 0.000244140625 ✓
- [ParametricExportComputer.ts](../../../potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L2087): `const RIDGE_DIAG_HW = 0.015;`
- 0.015 / 0.000244 = 61.5× ✓

The arithmetic is correct. The re-snap window was designed for sub-sample refinement only.

### C1 [WARNING]: maxConsecDelta is NOT a clean measure of chain-linking noise

**Generator's claim**: "Chain-linking position variance: up to 0.007886 U (maxConsecDelta)"

**Actual behavior**: `maxConsecDelta` measures the maximum U difference between CONSECUTIVE chain points. It conflates three sources:
1. **Genuine feature drift** — the mathematical ridge moves in U as T changes (e.g., in m-transition zones)
2. **Detection sub-sample jitter** — ±0.00006 U per row
3. **Chain-linker mis-assignment** — connecting to the wrong candidate feature

From the project journal (agents_journal.md line 3219): *"Theoretical maximum du/row for SuperformulaBlossom(6→10) is only 6.3e-4."* With maxConsecDelta ≈ 0.009 and theoretical max drift of 0.00063, the excess (0.009 − 0.00063 ≈ 0.008) IS overwhelmingly from detection noise and linker noise — NOT from genuine feature drift. So the Generator's conclusion is **directionally correct** (chain-linking noise dominates), but maxConsecDelta overstates the error because it measures consecutive deltas, not error from ground truth.

A chain point could be 0.008 U from its predecessor but still ON the true ridge if the ridge itself moved. The correct metric would be distance from the KNOWN extremum at each row (which is what the ridge diagnostic measures, at 0.22mm).

**Impact**: The Generator's 61× mismatch argument stands on its own — it doesn't depend on the precise magnitude of chain-linking noise. The re-snap window is too narrow regardless.

### Claim 2: Primary and interpolated have same ridge distance

**Verdict: PARTIALLY CORRECT — with critical diagnostic caveat**

**Generator's claim**: primary=0.2230mm vs interpolated=0.2278mm proves re-snap ineffectiveness.

**The conclusion is correct but the evidence is weaker than claimed.** Two issues:

### C2 [CRITICAL]: Ridge diagnostic crosses to neighboring features for high-m styles

The diagnostic uses `RIDGE_DIAG_HW = 0.015`. For styles with high m values:

| m value | Same-kind spacing (U) | Diagnostic window (U) | Window / Spacing | Status |
|---------|----------------------|----------------------|-------------------|--------|
| 6       | 0.167                | ±0.015 = 0.030       | 18%               | ✓ Safe |
| 10      | 0.100                | ±0.015 = 0.030       | 30%               | ✓ Safe |
| 18      | 0.056                | ±0.015 = 0.030       | 54%               | ⚠️ Marginal |
| 34      | 0.029                | ±0.015 = 0.030       | **103%**           | ❌ CROSSES |

For m≥34, the diagnostic window EXCEEDS the inter-feature spacing. The "true extremum" found by the diagnostic is potentially the NEIGHBORING feature's peak, not the intended one. This means:

1. The worst vertex (chain0, dist=6.8mm, uErr=0.015) almost certainly crossed to a neighboring feature — it hit the window boundary exactly, which is a telltale sign
2. The average ridge distance (0.22mm) may be inflated for high-m vertices by cross-feature contamination
3. The "primary ≈ interpolated" conclusion could be an artifact if both are measured against the wrong reference

**Required fix**: The diagnostic MUST validate that the extremum found is of the same kind AND has consistent prominence with the chain's feature. Add a guard: if the diagnostic's best candidate is >50% of inter-feature spacing from the vertex's U, flag it as a cross-feature hit and exclude from the average.

**However**: Even if the diagnostic has noise, the core argument holds. If re-snap were effective, primary vertices (which went through Step 3.5) would show ANY systematic advantage over interpolated (which only got Phase 2 re-snap). The fact that they're statistically equal is damning for Step 3.5's effectiveness.

### C3 [NOTE]: Phase 2 re-snap window is adaptive and MUCH wider

**Generator correctly identifies** at [PEC line 1519](../../../potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1519):
```typescript
const hw = Math.min(0.01, Math.max(BASE_HALFWIDTH, gapAdaptive));
```

For typical gap sizes (gap=2), this gives hw ≈ 0.004 — 16× wider than Step 3.5's 0.000244. This likely explains why interpolated vertices match primary accuracy: Phase 2's wider window compensates for the poor starting position.

**Verified**: [PEC line 1516](../../../potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1516): `const BASE_HALFWIDTH = 2.0 * SAMPLE_WIDTH` (same base as Step 3.5) but the adaptive expansion to up to 0.01 is the key difference.

### Claim 3: Fan midpoints made things worse

**Verdict: CONFIRMED with nuance**

### C4 [WARNING]: R48 comparison is confounded by P3 removal

The Generator compares Pre-R48 (38.6%) vs Post-R48 (47.0%). But R48 performed TWO changes:
1. **Removed** R47 P3 (neighbor-constrained re-snap smoothing)
2. **Added** fan midpoint insertion

From repo memory: Pre-R47 baseline was 37.1%. R47 (P1+P3) brought it to 38.6%. The 1.5% increase was from R47 changes.

If R48 removed P3 (which contributed to the 38.6%), the clean baseline without P3 is approximately 37.1% + P1-only effect. Since P1 (selective CSO flip) should REDUCE slivers or be neutral, the true baseline is ≤37.1%.

So the fan midpoint insertion caused a **~10% increase** (37.1% → 47.0%), not the stated 8.4% (38.6% → 47.0%). The Generator understates the damage.

### C5 [CRITICAL]: Generator INCORRECTLY claims fan midpoints are not GPU-evaluated

**Generator's claim**: "The midpoint positions are also NOT GPU-evaluated — they use `(p0 + p1) / 2` in 3D, which doesn't lie on the parametric surface."

**REFUTED.** The code at [PEC lines 1725-1742](../../../potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1725-L1742) clearly shows:

1. UV midpoint computation (circular U averaging + T averaging):
```typescript
let uMid = u0 + du * 0.5;
const tMid = (combinedVerts[v0 * 3 + 1] + combinedVerts[v1 * 3 + 1]) * 0.5;
midUVs[i * 3] = uMid;
```

2. **GPU evaluation** of these UV midpoints:
```typescript
const midPositions = await this.evaluatePoints(
    midUVs, uniformBuffer, styleParamBuffer, ...
);
```

3. Using GPU-evaluated 3D positions (NOT 3D averages):
```typescript
newResultData.set(resultData);
for (let i = 0; i < toSplit.length * 3; i++) {
    newResultData[resultData.length + i] = midPositions[i];
}
```

The midpoints ARE on the parametric surface. The Generator confused UV-midpoint-then-GPU-eval (what the code does, correctly) with 3D-average (what the code does NOT do). This factual error undermines confidence in the Generator's close reading of this code path, though it does not change the OVERALL case for reverting (the CSO rowSpan rejection is the real problem).

### C6 [NOTE]: The CSO rowSpan rejection mechanism is correctly diagnosed

**Verified** at [ChainStripOptimizer.ts line 459-472](../../../potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L459-L472):

```typescript
const rowSpanExceeds = (shLo, shHi, opp0, opp1): boolean => {
    const allT = [t_shLo, t_shHi, t_opp0, t_opp1];
    const origTExtent = Math.max(...allT) - Math.min(...allT);
    ...
    const tSpanLimit = Math.min(origTExtent * 1.1 + maxSingleRowTSpan * 0.1, maxSingleRowTSpan * 2.5);
    return maxNewTSpan > tSpanLimit;
};
```

When a fan midpoint has T between two grid rows, any edge flip involving it creates a triangle spanning a 1.5-row T extent. With `maxSingleRowTSpan` typically ~0.004, the origTExtent for a mid-row vertex would be ~0.006 (1.5 rows) while normal quads have 0.004 (1 row). The tSpanLimit becomes tight and many flips are blocked. The 38,980 rowSpan rejects confirm this mechanism.

---

## Proposal Critiques

### P4 (Revert Fan Midpoints): ACCEPT

The evidence is unambiguous:
- Sliver rate increased (37.1% → 47.0%)
- 38,980 CSO quality flips blocked
- No measurable geometric benefit

**Condition**: Preserve the ridge-distance diagnostic code (lines 2085-2185). It is orthogonal to the fan midpoint insertion. Verify by checking that the diagnostic doesn't reference any fan midpoint vertex indices or fan-specific data structures.

### P1 (Adaptive Wide Re-Snap): ACCEPT WITH AMENDMENTS

### C7 [CRITICAL]: 10× coarser sampling destroys parabolic refinement precision

**Generator proposes**: 64 candidates in ±0.005 U window = 0.010 U total.
- Step size: 0.010 / 63 = **0.000159 U**  
- Parabolic refinement precision: ~step/6 ≈ **0.0000265 U** ≈ 0.008mm

**Current Step 3.5**: 32 candidates in ±0.000244 U window = 0.000488 U total.
- Step size: 0.000488 / 31 = **0.0000157 U**
- Parabolic refinement precision: ~step/6 ≈ **0.0000026 U** ≈ 0.0008mm

The wider window has **10× coarser sampling** and **10× worse final precision**. While 0.008mm is far better than the current 0.22mm average, it's a gratuitous precision loss.

**Required amendment**: Use a **two-stage re-snap**:
1. Stage 1: 64 candidates in the wide window (±hw adaptive) → find approximate extremum
2. Stage 2: 32 candidates in ±2 sample widths around Stage 1's best → parabolic refinement at original precision

This gives the wide search of P1 with the precision of the current re-snap. Total probes: 64 + 32 = 96 per chain point (vs current 32). A 3× increase, not prohibitive. GPU batching makes this essentially free compared to the existing wall evaluation.

### C8 [WARNING]: MAX_RESNAP_HW = 0.005 won't reach the worst vertices

The worst vertex has uErr = 0.015 (from the diagnostic). Even allowing for diagnostic cross-feature contamination (C2), there ARE vertices with true error > 0.005. These are likely in m-transition zones where features genuinely jump.

**However**: The diagnostic's worst vertex almost certainly crossed to a neighboring feature (uErr = 0.015 exactly equals RIDGE_DIAG_HW — hitting the boundary). After fixing C2, the true worst-case error may be ≤0.005. This can only be resolved with a corrected diagnostic.

**Acceptable risk**: P1 with MAX_RESNAP_HW = 0.005 is safe. If post-implementation diagnostics show remaining outliers > 0.005, widen MAX_RESNAP_HW in a follow-up round.

### C9 [NOTE]: 1/3 inter-feature safety margin is adequate

For a superformula peak at angular position θ₀, the radius function has a local maximum. The nearest same-kind peak is at θ₀ ± 2π/m. At 1/3 of the way toward the neighbor (= 2π/(3m) away from center), the radius is well into the descending slope. The parabolic fit at this distance would give nonsensical results, but since we're looking for the MAXIMUM (for peaks) or MINIMUM (for valleys), we'll correctly select the candidate nearest the intended feature's extremum.

**Verified**: The re-snap selects the best candidate by radius magnitude ([PEC line 1040-1047](../../../potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1040-L1047)), so candidates in the tail of the neighboring feature will have worse radius than candidates near the true extremum. The 1/3 margin is safe.

### C10 [NOTE]: Computing per-point inter-feature spacing

The Generator proposes using `allRowTypedFeatures` to find nearest same-kind features. This data IS available at Step 3.5 — it's computed by `detectAllRowFeatures()` and passed through chain linking.

Verified: [PEC line 933](../../../potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L933) shows `allRowTypedFeatures` is available. Each chain point has a `row` index that maps into `allRowTypedFeatures[row]`. Computing nearest same-kind distance is O(features_per_row) per chain point — negligible.

The ChainLinker's own `RESNAP_RADIUS = 0.005` ([ChainLinker.ts line 28](../../../potfoundry-web/src/renderers/webgpu/parametric/ChainLinker.ts#L28)) is set to the same value as the proposed MAX_RESNAP_HW, providing independent validation that ±0.005 is a vetted safe radius in this codebase.

### P2 (Chain-Coherent DP Re-Snap): ACCEPT WITH AMENDMENTS

### C11 [CRITICAL]: expectedDrift is undefined

The coherence penalty is `|u_k - u_{k_prev}| / expectedDrift`. The Generator never defines how to compute expectedDrift. Without this, the proposal is incomplete.

**Options** (Generator must choose one):
1. **Empirical**: Use the median consecutive delta of the raw chain (post-Step-3.5) as expectedDrift. Problem: this is circular — we're trying to fix incoherence, but measuring coherence from the incoherent chain.
2. **Theoretical**: Compute from m-value and T-spacing: `expectedDrift = 2π / (m × numRows)` for non-morphing sections. For morphing sections, use the derivative of the m-interpolation function. Problem: requires access to style parameters.
3. **Adaptive**: Use a robust estimator like median absolute deviation (MAD) of the local 5-point window. Problem: local window may be too short to estimate correctly.

**Required**: Generator must specify the exact computation and demonstrate it works for (a) vertical features (drift ≈ 0), (b) spiral features (drift ≈ constant), and (c) m-transition zones (drift changes rapidly).

### C12 [WARNING]: α = 0.7 is unjustified

No sensitivity analysis provided. The balance between ridge accuracy and coherence depends on:
- Feature prominence (flat peaks need more weight on coherence)
- Feature density (dense features need less coherence to avoid cross-pulling)
- Feature drift rate (fast-moving features need less coherence penalty)

**Required**: Generator must provide α sensitivity analysis on at least 3 test cases: (1) vertical features with high prominence (easy case), (2) spiral features with constant drift, (3) m-transition zones with variable drift. Show that α = 0.7 doesn't degrade any case by > 0.01mm average ridge distance.

### C13 [NOTE]: GPU probe cost is acceptable

Generator claims 216K probes. Verified: 13 chains × 260 rows × 64 = 216,320. Current Step 3.5: ~6549 × 32 = 209,568. So P2 **approximately doubles** GPU probe count for Step 3.5 (original + DP candidates), not replaces it. Total: ~425K probes, batched in a single `evaluatePoints` call.

For context, the main row probing does ~400 rows × 8192 = 3.3M probes. The 425K additional is ~13% overhead — acceptable.

### C14 [NOTE]: O(N × K²) complexity is correct but understated

N = 260, K = 64: the DP backtracking is 260 × 64² = 1,064,960 per chain. With 20 chains (not 13 as Generator states — the actual count from diagnostics is ~20), total = 21.3M operations. This is still negligible for CPU (~5ms), but the Generator should use the correct chain count.

### C15 [WARNING]: Seam-crossing chains

The DP uses `|u_k - u_{k_prev}|` as the coherence penalty. If a chain crosses the seam (U wraps from ~0.99 to ~0.01), the raw absolute difference would be ~0.98, causing a massive penalty that breaks the DP.

**Required**: Use `circularDistance(u_k, u_{k_prev})` instead of `|u_k - u_{k_prev}|`. The Generator acknowledges seam wrapping in their assumptions but doesn't specify the fix.

### P5 (Batch2Remap Correction): REJECT

### C16 [WARNING]: Marginal impact, risk mischaracterized

The Generator claims ≤0.03mm error per vertex. Let's verify:
- MERGE_THRESHOLD = 1e-4 U ([OWT line 867](../../../potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L867))
- At 300mm circumference: 1e-4 U × 300mm = 0.03mm ✓

But the Generator's proposed fix (overwriting grid vertex U with chain vertex U) has a subtle problem. The grid vertex serves double duty:
1. It's a mesh vertex (position matters for geometry)
2. It's a grid vertex used by `unionU[col]` for cell-boundary determination

The proposal moves the mesh vertex but leaves `unionU[col]` unchanged. This means the vertex's U no longer matches its column's U. All code that computes cell assignments via `bsearchFloor(unionU, vertexU)` would still work (the vertex is within 1e-4 of the column), but any code that assumes `vertices[gridIdx * 3] === unionU[col]` would break.

I found [OWT line 955](../../../potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L955): `if (batch2Remap.has(cv.vertexIdx)) continue;` — batch2Remap'd vertices are skipped for cell assignment. And at [OWT line 1642](../../../potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1642), the batch2Remap size is logged but not otherwise critically used.

The risk is real but small. However, the **benefit** is also small: 0.03mm maximum improvement on a subset of vertices (batch2Remap.size is typically small), vs the current 0.22mm average error. ROI is poor.

**Verdict**: REJECT. Fix the big problems first (P1/P2). If average ridge distance drops to < 0.05mm with P1, the 0.03mm batch2Remap contribution would become significant and can be revisited.

### P3 (Differential Feature Tracking): DEFER

### C17 [CRITICAL]: Feature births/deaths are not handwaveable

The Generator acknowledges feature births/deaths but offers no solution. In a SuperformulaBlossom style that morphs from m=6 to m=10:
- At m=6: 6 peaks
- At m=10: 10 peaks
- In the transition zone: 4 new peaks "appear" from zero prominence

Tracking from an anchor would simply lose the feature when prominence drops to zero. Detecting the birth and spawning a new tracker requires... per-row detection, which is what we're trying to replace. This creates a circular dependency.

### C18 [WARNING]: Sprint features break the narrow tracking window

For styles with spiral/rotating features, feature U can drift >0.02 per row when the rotation rate is high. The proposed ±0.001 window would lose these features within 1-2 rows.

The Generator partially addresses this: "window must be adaptive." But no adaptive scheme is proposed. Without it, P3 cannot handle the diversity of PotFoundry's 19 styles.

### C19 [NOTE]: 16 candidates per row is fine for resolution

Step size: 0.002 / 15 = 0.000133 U. This is comparable to P1's 0.000159 and sufficient for parabolic refinement.

**Verdict**: The architecture is sound in principle but requires solving births/deaths and adaptive windows — both non-trivial. Defer until P1+P2 results show whether it's needed.

---

## Accepted Items

| Item | Status | Evidence |
|------|--------|----------|
| 61× window mismatch | CONFIRMED | PEC L981, L2087 |
| Primary ≈ interp ridge distance | CONFIRMED (with C2 caveat) | Diagnostic output |
| Fan midpoints counter-productive | CONFIRMED | CSO rowSpan mechanism verified at CSO L459-472 |
| Phase 2 has wider adaptive window | CONFIRMED | PEC L1519 |
| `allRowTypedFeatures` available at Step 3.5 | CONFIRMED | PEC L933 |
| 1/3 inter-feature margin is safe | CONFIRMED | Superformula monotonicity argument |
| Fan midpoints ARE GPU-evaluated | Generator ERROR — code shows GPU eval at PEC L1740 |

## Open Questions for Generator

1. **expectedDrift specification** (C11): Provide exact computation for the coherence penalty denominator, with worked examples for vertical, spiral, and morphing features.
2. **α sensitivity** (C12): Show that α = 0.7 works across at least 3 feature classes.
3. **Correct chain count** (C14): Use 20 chains (not 13) for probe-cost estimates.
4. **Seam wrapping** (C15): Confirm circularDistance will be used in the DP coherence penalty.
5. **Diagnostic contamination** (C2): Propose a guard for the ridge diagnostic to prevent cross-feature hits at m ≥ 30.

## Implementation Conditions

### If proceeding with P4 + P1 (recommended immediate path):

**Step 1: P4 — Revert fan midpoints**
- Remove PEC lines ~1665-1807 (the `FAN_ASPECT_THRESHOLD` / fan midpoint block)
- Keep `outerFanDiagonalEdges` in the constraint edge set (these protect fan diagonals from CSO flips)
- Keep the ridge-distance diagnostic (lines 2085-2185)
- Verify: `fanMidpointSubEdges` is only used downstream for `constraintEdgeSet` — trace all references before removing

**Step 2: P1 — Adaptive wide re-snap (with C7 two-stage amendment)**
- Modify Step 3.5 (PEC lines 980-1090) to:
  1. Compute per-chain-point `nearestSameKindDist` from `allRowTypedFeatures[point.row]`
  2. Set `hw = min(nearestSameKindDist / 3.0, 0.005)`
  3. Stage 1: 64 candidates in ±hw → find coarse best candidate
  4. Stage 2: 32 candidates in ±(2/ROW_PROBE_SAMPLES) around Stage 1 best → parabolic refinement at full precision
- Guard: `finalU` must satisfy `circularDistance(originalU, finalU) < hw` (don't overshoot the adaptive window)
- Diagnostic: log per-chain statistics (count of points where wide search found a different extremum than narrow search would have)

**Validation Protocol**:
1. Run export on SuperformulaBlossom (m=10) style
2. Ridge-distance diagnostic should show avg < 0.10mm (down from 0.22mm)
3. Sliver rate should return to ~37% (reverting fan midpoints)
4. CSO rowSpan rejects should drop to ~0 (no more mid-row vertices)
5. Run export on a high-m style (m≥30) to verify no cross-feature snapping
6. Log comparison: how many chain points got a DIFFERENT result from the wide window vs the original narrow window

---

*Verifier out. The 61× window mismatch is real and damning. The two-stage re-snap amendment (C7) is the single most important condition — without it, we trade 10× precision for 20× reach, which is a poor bargain when we can have both.*
