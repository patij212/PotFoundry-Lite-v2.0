# Verifier Round 11 — Critique of Generator's Chain Linking Quality Proposals

Date: 2026-03-04

## Summary Verdict: ACCEPT WITH AMENDMENTS

The Generator's root cause analysis is fundamentally correct: the L675 conditional prevents momentum from aiding normal row-to-row linking, and the greedy nearest-neighbor assignment produces zigzags when features are close. All three proposals are directionally sound. However, several calibration issues and one missing normalization require correction before implementation.

---

## Critique

### C1 [WARNING]: L675 Is a Deliberate Design Choice, Not a Bug

**Generator's claim**: "This is the primary bug" — momentum is computed but only used during gap bridging.

**Actual behavior**: The v10.6 comments at [ChainLinker.ts](../src/renderers/webgpu/parametric/ChainLinker.ts#L621-L622) explicitly state:

```
// v10.6: Added missCount to support momentum-based gap bridging
```

And at L633:

```
// v10.6: Wider search radius when using momentum (2× normal)
```

This was an intentional engineering decision — momentum was designed *specifically* for gap bridging, not for normal linking. Calling it a "bug" mischaracterizes the code's intent.

**Impact**: Cosmetic. The analysis of *why* it should be changed is correct regardless of whether it's called a "bug" or a "design limitation." Does not block implementation.

**Recommendation**: Reframe as "design limitation that should be lifted" rather than "bug." The code comment should be updated to explain why momentum is now used always, not just for gap bridging (e.g., "v24: Use momentum during all matching, not just gap bridging, to reduce zigzag at bifurcation zones").

---

### C2 [CRITICAL]: Proposal 2's `impliedVel` Is Not Normalized by Row Gap

**Generator's claim**: The scoring formula uses `impliedVel = circularSignedDelta(C.lastU, F.u)` as a velocity term, compared against `currentVel` (the per-row median velocity).

**Actual behavior**: In `linkFeatureChainsCore`, the velocity computation at L712-721 normalizes by row span:

```typescript
const rs = pts[k].row - pts[k - 1].row;
if (rs > 0) {
    let du = (pts[k].u - pts[k - 1].u) / rs;
```

So `currentVel` is in units of U/row. But the Generator's `impliedVel = circularSignedDelta(C.lastU, F.u)` is the raw U-delta without dividing by the row gap. For `missCount === 0`, the row gap is exactly 1, so this is correct. But the scoring formula applies to ALL candidates, including those from chains with `missCount > 0`, where the row gap is > 1.

**Counterexample**: Chain last matched at row 47, now at row 50 (missCount=3). `lastU = 0.170`, `currentVel = 0.001/row`. Feature at `u = 0.173`. `impliedVel = 0.003` (covers 3 rows but isn't divided by 3). `accel = |0.003 - 0.001| = 0.002`. But the true per-row implied velocity is `0.001/row`, giving `accel = 0`. The acceleration penalty is inflated by 3×, unfairly penalizing gap-bridging matches.

**Impact**: Medium. Gap-bridging already uses `predictedU` as the match center (existing behavior, unchanged by Proposal 2). The scoring primarily matters for `missCount === 0` where it's correct. But wrong scores for `missCount > 0` could cause the greedy sort to mis-order gap-bridging candidates relative to normal candidates.

**Required fix**: Normalize `impliedVel` by row gap:
```
rowGap = currentRow - C.lastRow  // (= 1 for missCount=0)
impliedVel = circularSignedDelta(C.lastU, F.u) / rowGap
```

---

### C3 [WARNING]: Proposal 2 Cannot Disambiguate at the Exact Moment of Bifurcation

**Generator's claim**: "The acceleration penalty breaks the tie in favor of trajectory consistency."

**Actual behavior**: The Generator's own analysis correctly notes that velocity ≈ 0 for a previously-stationary feature makes prediction uninformative. But the worked example in the proposal (showing F₁ with `accel ≈ 0` vs F₂ with `accel > 0`) implicitly assumes the chain has an established non-zero velocity — which it doesn't at the moment of bifurcation.

**Verification**: For a chain with `velocity = 0`, `predictedU = lastU`, and two symmetric child features at `lastU ± δ`:

| Feature | rawDist | predDist | impliedVel | accel | score (α=0.3, β=0.5) |
|---------|---------|----------|------------|-------|------|
| F₁ (lastU - δ) | δ | δ | -δ | δ | 0.3δ + 0.7δ + 0.5δ = 1.5δ |
| F₂ (lastU + δ) | δ | δ | +δ | δ | 0.3δ + 0.7δ + 0.5δ = 1.5δ |

Scores are identical. At this moment, no formula using only the chain's history can distinguish the children because the history contains no directional information.

**Impact**: Low. This is an inherent limitation, not a flaw in the proposal. The chain will arbitrarily pick one child (correct — it has to pick one), and on subsequent rows, the established velocity locks it onto that child. The important thing is that Proposal 2 prevents subsequent *zigzagging* once a direction is chosen. The Generator acknowledges this ("necessary but not sufficient" for Proposal 1, and the worked example for Proposal 2 describes the post-bifurcation behavior).

**Recommendation**: The Generator should clarify that the scoring's value is in *maintaining* correct tracking after the initial choice, not in making the initial choice. No code change needed.

---

### C4 [WARNING]: Proposal 3 Can Create Duplicate Feature Assignments Across Chains

**Generator's claim**: "Alternate features exist in the row (they do — the wrong chain presumably stole the right feature, which means the right feature is in the row's feature list)."

**Actual behavior**: The repair pass operates on one chain at a time and searches `allRowFeatures[row]` for alternates. If Chain C₁ is repaired to snap to feature F at row R, and Chain C₂ already has F at row R (because C₂ was correctly tracking F), both chains now have the same (u, row) point. This creates two constraint polylines sharing a vertex in CDT, which produces degenerate triangles when the chains diverge at adjacent rows.

**Counterexample**: Classic zigzag swap between C₁ and C₂ at row R:
- C₁: [..., (0.165, R-1), **(0.175, R)**, (0.165, R+1), ...] ← zigzag point  
- C₂: [..., (0.175, R-1), **(0.165, R)**, (0.175, R+1), ...] ← also zigzags

Repairing C₁: predicted = (0.165 + 0.165)/2 = 0.165. Snaps to feature at 0.165. ✓  
Repairing C₂: predicted = (0.175 + 0.175)/2 = 0.175. Snaps to feature at 0.175. ✓  

In this symmetric case, both repairs are correct and don't conflict. **But consider**:

- C₁: [..., (0.165, R-1), **(0.175, R)**, (0.166, R+1), ...]
- C₂: [..., (0.175, R-1), (0.175, R), (0.174, R+1), ...] ← no zigzag, correctly on F₂

Repairing C₁: predicted = (0.165 + 0.166)/2 = 0.1655. Feature at 0.165 is closest. But C₂ is also at 0.175 at row R — no conflict there. C₁ snaps to 0.165, which is correct.

Actually, in this asymmetric case, there's no duplicate. The repair moves C₁ AWAY from C₂'s feature. The conflict only occurs if the repair moves a chain TOWARD another chain's feature, which would require the "correct" position (midpoint interpolation) to coincide with the other chain's position — this would only happen if the two chains are supposed to be at the same position, which means they should have been deduplicated.

**Impact**: Low in practice. The symmetric zigzag case (most common) resolves correctly. Asymmetric cases are unlikely to create conflicts. But defense-in-depth is warranted.

**Recommendation**: Add a `usedFeatures` set tracking `(row, featureIndex)` pairs across chains during repair. If the repair target is already used by another chain, skip the repair for that point. This prevents conflicts with O(1) lookup cost.

---

### C5 [NOTE]: β = 0.5 Is Aggressive — Validate Empirically Before Hardcoding

**Generator's claim**: β = 0.5 is "suggested."

**Verification**: For SuperformulaBlossom, the maximum theoretical feature acceleration is negligible (~9×10⁻⁷/row²), computed from:

$$\frac{d^2 U_k}{dT^2} = \frac{32k}{(6 + 4T)^3}$$

At k=1, T=0.5: $32/512 = 0.0625$ per $T^2$. Per row ($\Delta T \approx 1/264$): $0.0625/264^2 \approx 9 \times 10^{-7}$.

So β = 0.5 won't penalize legitimate feature acceleration (it's far below any threshold). But β = 0.5 means the acceleration penalty can dominate the score. For a chain with velocity 0.001/row:

- Correct next feature (impliedVel = +0.0012): accel = 0.0002, penalty = 0.0001
- Wrong feature (impliedVel = -0.001): accel = 0.002, penalty = 0.001

The penalty provides 10× discrimination here. A smaller β (e.g., 0.2) would give 4× discrimination, which is still adequate.

**Impact**: Low. β = 0.5 won't cause false positives for SuperformulaBlossom. But other styles with sharper curvature (e.g., Spiral, Wave) might have higher feature acceleration. Hardcoding β = 0.5 without cross-style validation could cause issues.

**Recommendation**: Start with β = 0.3 and validate across 3+ styles before increasing. Extract β as a named constant (e.g., `ACCEL_PENALTY_WEIGHT`) for easy tuning.

---

### C6 [NOTE]: α Ramp Reaches Minimum Before Bifurcation Zone

**Generator's claim**: α ramps from 1.0 to 0.3 over 10 points using `α = max(0.3, 1.0 - C.length * 0.07)`.

**Verification**: For SuperformulaBlossom with 264 rows, m-transition bifurcations occur around rows 20-50. By row 10, α is already at 0.3 (minimum). By the time bifurcation happens, the chain has 20-50 points and α has been at minimum for 10-40 rows.

This is actually **correct behavior** — the ramp is designed for short chains (< 10 points) where the velocity estimate is unreliable, not for timing the bifurcation. By the time bifurcation occurs, the chain should fully trust its prediction (α = 0.3 gives 70% weight to predDist).

**Impact**: None. The calibration is appropriate.

**Recommendation**: None. The ramp functions as intended.

---

### C7 [NOTE]: Proposal 3's `maxAccel = 0.003` Threshold Is Well-Calibrated

**Generator's claim**: maxAccel = 0.003 is 2.4× theoretical maximum feature acceleration.

**Verification**: The "acceleration" in Proposal 3 is actually the second difference:
```
|u[i-1] - 2·u[i] + u[i+1]|
```

For a zigzag (jump of 0.009 and back):
- u = [0.167, 0.176, 0.167]
- Second difference: |0.167 - 2(0.176) + 0.167| = |-0.018| = 0.018

This is 6× above the threshold (0.003), so zigzags are clearly detected.

For linear feature drift at maximum rate (0.000633/row):
- u = [X, X+0.000633, X+0.001266]
- Second difference: |X - 2(X+0.000633) + (X+0.001266)| = 0

Linear trajectories have zero second difference, so the threshold has infinite headroom for straight-line features. Even for the theoretical maximum quadratic acceleration ($9 \times 10^{-7}$/row²), this is 3000× below the threshold.

The threshold correctly sits between noise/zigzag level (0.016-0.018) and real feature behavior (~0). Good separation.

**Impact**: None.

**Recommendation**: None. Consider logging the second-difference distribution during development to empirically validate the gap between zigzag and legitimate values.

---

### C8 [WARNING]: `predictedU` After a Bad Assignment Locks Onto the Wrong Feature

**Generator's implicit assumption**: Using `predictedU` always (Proposal 1) helps the chain recover from bad assignments.

**Actual behavior**: After assignment at row j, `predictedU = last.u + uVel`, where `last.u` is the ASSIGNED feature's position. If the assignment was bad (chain jumped to wrong feature at u=0.180 instead of correct u=0.170):

- Velocity window (median of 5 deltas): 4 near-zero deltas + 1 outlier (+0.010). Median ≈ 0. The median successfully rejects the outlier. ✓
- But: `predictedU = 0.180 + 0.0 = 0.180` — centered on the WRONG feature's position.
- Next row: matchU = 0.180, the wrong feature remains closest.

The chain locks onto the wrong feature permanently. This is actually *better than zigzagging* — a permanent swap produces smooth chains that CDT can handle. Two chains that swap features once produce two smooth curves, just tracking different features than they started with.

**Impact**: Low. Permanent swaps are benign for mesh quality. The Generator implicitly relies on this being OK (and it is). But it means Proposal 1 alone can't *recover* from a bad assignment — it can only prevent *oscillating* between features.

**Recommendation**: No code change needed. But the Generator should explicitly note that Proposal 1 converts zigzags into permanent swaps (which are acceptable). Proposal 3's zigzag repair is the mechanism for actually correcting wrong assignments, making the two proposals truly complementary.

---

### C9 [NOTE]: SG Smoothing (smoothChainPath) Is NOT Currently in the Pipeline

**Generator's reference**: "After WH smoothing (λ=50)."

**Verification**: The Executioner's Round 9 implementation replaced double-pass SG smoothing with single-pass WH smoothing. Current pipeline at [ParametricExportComputer.ts#L1049-1051](../src/renderers/webgpu/ParametricExportComputer.ts#L1049-L1051):

```typescript
// Whittaker-Henderson smooth each chain's U path (single-pass, optimal L2 + penalty)
for (let ci = 0; ci < chains.length; ci++) {
    chains[ci] = whittakerSmooth(chains[ci]);
}
```

`smoothChainPath` is defined in ChainLinker.ts but no longer called from PEC. The Generator correctly references WH (λ=50) in their analysis. ✓

**Impact**: None. References are accurate.

---

## Accepted Items

1. **L675 analysis is correct**: `predictedU` is computed but not used during normal linking. The conditional means momentum only helps gap-bridging. Verified at [ChainLinker.ts#L675](../src/renderers/webgpu/parametric/ChainLinker.ts#L675). ✓

2. **Velocity computation is correct**: Signed-median of last 3-5 deltas, per-row normalized, seam-wrapped. Verified at [ChainLinker.ts#L706-L733](../src/renderers/webgpu/parametric/ChainLinker.ts#L706). ✓

3. **`predictedU` initialization is correct**: Set to first feature's U for new chains at [ChainLinker.ts#L769](../src/renderers/webgpu/parametric/ChainLinker.ts#L769). ✓

4. **Proposal 1 is low-risk**: For `missCount === 0` and velocity ≈ 0 (stable features), `predictedU ≈ lastU`. This is approximately a no-op for stable features, with upside for drifting features. ✓

5. **Proposal 2's core idea is sound**: Cost-based scoring with acceleration penalty breaks ties when the chain has established velocity. The formula degenerates to raw-distance ranking when velocity = 0, which is the correct fallback. ✓

6. **Proposal 3's algorithm is correct**: Sequential repair with unwrapped updates handles multi-point zigzags. Circular arithmetic via `unwrapChain` and `liftUToReference` handles seam crossings (both functions verified at [ChainLinker.ts#L75-L83](../src/renderers/webgpu/parametric/ChainLinker.ts#L75) and [ChainLinker.ts#L95-L106](../src/renderers/webgpu/parametric/ChainLinker.ts#L95)). ✓

7. **Implementation order (1 → 3 → 2) is correct**: Proposal 1 is trivial, Proposal 3 is safe and independent, Proposal 2 is the most invasive. ✓

8. **Computational cost analysis is correct**: All proposals are O(C × F) per row or O(N × F) per chain, with small constants. No asymptotic regressions. ✓

9. **Secondary pass parameters are verified**: `CHAIN_LINK_RADIUS * 0.7 = 0.014`, `maxMissCount = 2`, `momentumScale = 1.25` at [ChainLinker.ts#L818-L822](../src/renderers/webgpu/parametric/ChainLinker.ts#L818). ✓

---

## Open Questions for Generator

1. **Feature crossing**: The Generator's analysis focuses on bifurcation (one feature splitting into two). But do SuperformulaBlossom features ever *cross* each other in U-space during the m-transition? If two features swap proximity ordering, no amount of velocity prediction can prevent the initial swap — only Proposal 3's post-repair can fix it.

2. **WH λ recalibration**: The Generator raises this as Open Question 5. I agree it should be deferred until after implementation — empirically validate whether λ=50 over-smooths with cleaner input chains. But this is a calibration knob, not a blocking concern.

3. **Cross-style validation**: All calibration (β, maxAccel, α ramp) is computed for SuperformulaBlossom (m=6→10). The Executioner should validate against at least 2 other styles with different feature geometries before hardcoding constants.

---

## Implementation Conditions (for the Executioner)

### Order of Implementation
1. **Proposal 1** — One-line change at L675. Remove the `missCount > 0` conditional.
2. **Proposal 3** — New function `repairChainZigzags()`. Insert into pipeline AFTER GPU re-snap, BEFORE WH smoothing. Run 2-3 passes.
3. **Proposal 2** — Refactor the scoring in `linkFeatureChainsCore`. Update the candidate distance computation.

### Required Amendments

| # | Amendment | References |
|---|-----------|------------|
| A1 | Normalize `impliedVel` by row gap: `impliedVel = circularSignedDelta(lastU, F.u) / (currentRow - lastRow)` | C2 |
| A2 | Start β at 0.3, extract as `ACCEL_PENALTY_WEIGHT` constant | C5 |
| A3 | In Proposal 3, track `usedFeatures: Set<string>` (keyed by `${row}:${featureIndex}`) across chains to prevent duplicate assignments | C4 |
| A4 | Update the v10.6 comment on `predictedU` to explain the expanded usage | C1 |

### Validation Protocol

1. **Unit tests for Proposal 1**: Synthetic test with two close features drifting in opposite directions. Verify chain stays on its feature when velocity is established.
2. **Unit tests for Proposal 2**: Two-chain, two-feature test at a bifurcation. Verify correct chain-feature association after 3+ rows.
3. **Unit tests for Proposal 3**: Inject known zigzag pattern, verify repair corrects it. Test seam-crossing zigzag separately.
4. **Regression**: All existing ChainLinker.test.ts tests (45) must pass unchanged.
5. **Integration metric**: Run SuperformulaBlossom export, measure `maxConsecDelta` pre-smooth. Target: ≤ 0.002. Measure post-WH-smooth. Target: ≤ 0.001.
6. **Cross-style**: Run Petal and Spiral styles through the same pipeline. Verify no regression in chain count or chain quality metrics.
7. **Inverted triangles**: Measure inverted triangle count with constraint enforcement enabled (Round 10 fix). The 207K count should decrease.

---

## Interaction Analysis

### With Secondary Pass (CHAIN_LINK_RADIUS * 0.7)
Proposal 2's α ramp naturally adapts: secondary chains are shorter, so α stays high (more weight on raw distance, less on prediction). This is correct — short chain fragments shouldn't trust noisy velocity estimates. No special handling needed.

### With WH Smoothing (λ=50)
Zigzag repair (Proposal 3) removes structural outliers that WH smoothing must currently compromise on (WH optimizer balances fidelity vs smoothness — a zigzag point pulls the trajectory). With cleaner input, WH can achieve tighter fit to the true trajectory. After implementation, evaluate whether λ can be reduced (e.g., to 20-30) for less aggressive smoothing.

### With CatRom Subdivision
CatRom operates on the smoothed chain points to produce interpolated constraint curves. Smoother input chains → smoother CatRom curves → better constraint edges → fewer CDT failures. This is directionally positive with no interaction risks.

### With filterLowConfidenceChains (MAX_CHAIN_ROUGHNESS = 0.008)
If Proposals 1-3 reduce chain roughness significantly, the roughness filter may no longer drop any chains. This is fine — fewer false positives is desirable. The `MIN_CHAIN_LENGTH = 10` filter is independent of roughness improvements.

---

*Verifier signing off. The proposals are sound in their core analysis and directionally correct. The amendments are calibration corrections, not architectural changes. The Generator has earned ACCEPT WITH AMENDMENTS.*
