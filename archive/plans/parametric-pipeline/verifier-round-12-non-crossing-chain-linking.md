# Verifier Round 12 — Critique of Non-Crossing Chain Linking
Date: 2026-03-05

## Summary Verdict: ACCEPT WITH AMENDMENTS

The proposal is mathematically sound, well-motivated, and addresses the correct root cause. The DP formulation is correct. The circular linearization works. The non-crossing assumption holds for all current PotFoundry styles (verified against shader code). Three amendments are required before implementation, and several warnings merit the Executioner's attention.

---

## Accepted Items

### A1: Root Cause Diagnosis — ACCEPT
**Generator's claim**: Greedy sorted-scan fails because same-kind features at spacing < 0.0002 produce numerically tied scores, and `Array.sort` tie-breaking is arbitrary.

**Verification**: Confirmed at [ChainLinker.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainLinker.ts#L740-L745). The current code sorts `candidates` by `dist` (line 745) then iterates with `usedChains`/`usedFeats` exclusion (line 748-749). When two candidates have `dist` values differing by < 1e-10, JavaScript's `Array.sort` (Timsort in V8) preserves insertion order, which depends on the nested loop iteration order (`ci` then `f`). This means the chain with the lower index in `activeChains` always wins ties — not necessarily the geometrically correct chain. The zigzag trace in the proposal is realistic and reproducible.

**Evidence**: The scoring formula at [lines 693-731](potfoundry-web/src/renderers/webgpu/parametric/ChainLinker.ts#L693-L731) computes `alpha * rawDist + (1-alpha) * predDist + ACCEL_PENALTY_WEIGHT * accel`. For velocity ≈ 0 (vertical features), `predDist ≈ rawDist` and `accel ≈ 0`, collapsing the formula to approximately `rawDist`. Two chains 0.0002 apart produce a score gap of ~0.0002, which while not below floating-point precision, IS below the noise floor of feature detection jitter (~0.000122 = 1/8192). The Generator is correct that this gap is meaningless.

### A2: DP Recurrence Relation — ACCEPT
**Generator's claim**: The three-option DP (skip feature, skip chain, match) finds the optimal non-crossing matching.

**Verification**: This is the textbook non-crossing bipartite matching DP (also known as "maximum weight non-crossing matching" or "sequence alignment DP"). The recurrence:
```
dp[i][j] = min(dp[i][j-1],           // skip feature j
               dp[i-1][j],           // skip chain i
               dp[i-1][j-1] + c[i,j]) // match (non-crossing by construction)
```
is correct. The non-crossing guarantee follows from the fact that matching chain `i` with feature `j` requires that all previous matches involve chains `< i` AND features `< j` (encoded by `dp[i-1][j-1]`). This is the standard LCS/alignment argument.

**Initialization**: `dp[0][*] = dp[*][0] = 0` is correct — zero cost for empty prefixes. Unmatched chains/features have zero cost in the DP; their consequences (missCount increment, new chain starts) are handled outside the DP in the existing assignment application code ([lines 789-808](potfoundry-web/src/renderers/webgpu/parametric/ChainLinker.ts#L789-L808)).

**Backtrace**: Correct. Starting at `(K, M)`, following `from[]` choices backward recovers the optimal assignment. The `while i > 0 and j > 0` termination is correct — remaining chains/features at the boundary are unmatched.

### A3: Circular Linearization — ACCEPT
**Generator's claim**: Cutting at the midpoint of the largest gap between chain positions produces a valid linearization.

**Verification**: Traced through multiple scenarios:
- **K=10 evenly spaced**: Gaps all equal (0.10). Cut at first gap midpoint. All chains cluster in [0, 1) after shift. ✓
- **K=2 at 0.25 and 0.75**: Two equal gaps (0.50). Strict `>` comparison means first gap wins. Cut at 0.50. `shiftU(0.25) = 0.75`, `shiftU(0.75) = 0.25`. Order reverses but DP correctly maps features to the reordered chains. ✓
- **All chains in small arc** (e.g., near pot base): Largest gap > 0.8. Cut is in the gap, all chains in the remaining 0.2 range. ✓
- **Feature near cut point**: Features in the largest gap between chains are by definition far from any chain, so they exceed `CHAIN_LINK_RADIUS` and don't affect matching. ✓

`shiftU` implementation `((u - cutU) % 1 + 1) % 1` is correct for JavaScript's truncated-division modulo. Verified: `shiftU(0.1, cut=0.5) = 0.6`, `shiftU(0.9, cut=0.5) = 0.4`, `shiftU(0.5, cut=0.5) = 0.0`. ✓

### A4: Graceful Degradation When Features Cross — ACCEPT
**Generator's claim**: If crossing ever DID occur, the DP would force a chain break rather than zigzag.

**Verification**: Correct. In a hypothetical crossing scenario where chain A should move right past chain B, the non-crossing DP would either: (a) match both to their nearest features in the original order (slight distance penalty but no crossing), or (b) leave one unmatched. Both outcomes produce a clean chain break (`missCount++`) rather than zigzag artifacts. This is strictly better than the current behavior.

---

## Accepted with Amendments

### C1 [WARNING → AMENDMENT]: Non-Crossing Claim Needs Stronger Justification for Harmonic and Wave Styles
**Generator's claim**: "Features never cross in U-space... monotonic functions of m."

**Actual behavior**: The Generator's argument is convincing for SuperformulaBlossom (where extrema at θ_k = 4πk/m shift proportionally as m varies, preserving order — verified in [styles.wgsl](potfoundry-web/src/assets/shaders/styles.wgsl#L36-L101) line 92: `superformula_value(theta_adj, m, ...)`). It's also correct for SpiralRidges ([styles.wgsl](potfoundry-web/src/assets/shaders/styles.wgsl#L236-L256) line 251: `f = 1 + amp * sin(k * theta + phase)`) where all features rotate at the same phase velocity `turns/k`, maintaining constant spacing.

**However**, for HarmonicRipples ([styles.wgsl](potfoundry-web/src/assets/shaders/styles.wgsl#L278-L295) lines 291-292), the style is a PRODUCT of two periodic components:
```wgsl
var f = 1.0 + pet_amp * cos(petals * theta + pet_ph + TAU * pet_zg * t);
f *= 1.0 + rip_amp * sin(rip_freq * theta + rip_ph + TAU * rip_zg * t);
```
When `pet_zg ≠ rip_zg`, the two sinusoidal components rotate at different speeds in U-space. The extrema of the product f(θ) = g₁(θ) × g₂(θ) occur where g₁'/g₁ = -g₂'/g₂, which ARE smooth functions of t. Features can merge/split through fold bifurcations but cannot truly cross (this follows from the implicit function theorem — two distinct non-degenerate extrema of the same kind cannot swap positions without passing through a degeneracy, which manifests as a merge, not a crossing).

The formal argument is correct but the Generator's justification ("monotonic functions of m") doesn't cover it. Similarly for WaveInterference ([styles.wgsl](potfoundry-web/src/assets/shaders/styles.wgsl#L391-L450)), which has domain warping that could appear to create crossings but topologically cannot.

**Required fix**: The Executioner must add a comment block (≥5 lines) in the DP implementation documenting the mathematical justification for the non-crossing assumption:
1. Superformula: extrema at θ_k = 4πk/m, order preserved under continuous m variation
2. Spiral/Harmonic: uniform phase velocity → constant spacing
3. Product styles (HarmonicRipples): fold bifurcation theorem — same-kind extrema merge/split, never cross
4. Defensive fallback: if crossing did occur, DP produces clean chain break (no zigzag)

### C2 [WARNING → AMENDMENT]: K ≈ 10 Claim is Incorrect — Must Handle K up to ~72
**Generator's claim**: "K ≈ 10 same-kind chains, M ≈ 10 features."

**Actual behavior**: Feature count depends on style parameters:
- SuperformulaBlossom with `m_base=6`: K_peaks ≈ 6. ✓ (typical default)
- SuperformulaBlossom with `m_base=30`: K_peaks ≈ 30. The UI allows m up to at least 30.
- WaveInterference with `feature_count=1.0`: `base_freq = floor(6 + 30*1.0) = 36`. K_peaks could reach ~72 (peaks of a 36-cycle function over [0, 2π]).
- GothicArches with N=12: K ≈ 24-36 per kind.

The DP complexity is O(K×M). For K=M=72, cost matrix = 5,184 entries, DP table = 5,329 entries. At ~10ns per DP cell, this is ~53μs per row, ~14ms for 264 rows. Still fast. The algorithm is correct regardless of K.

**Required fix**: Change the claim in code comments from "K ≈ 10" to "K ≈ 6-72 depending on style" and note that worst-case is ~15ms total — still negligible. Also: pre-allocate cost matrix and DP arrays at the maximum K×M seen across all rows (reuse buffers instead of allocating per row) to avoid GC pressure at K=72.

### C3 [WARNING → AMENDMENT]: DP Initialization Must Handle dp[i][0] Boundary Correctly for the Skip-Chain Path
**Generator's claim**: dp array initialized to 0, inner loop from i=1, j=1.

**Actual behavior**: Consider the inner loop body for j=1:
```
dp[i][1] = min(dp[i][0],          // skip feat 1 → 0  (correct)
               dp[i-1][1],        // skip chain i → dp[i-1][1]
               dp[i-1][0]+c[i,1]) // match → 0 + c  (correct)
```
The skip-chain option accesses `dp[i-1][1]`, which was computed in the previous i-iteration. For i=1: `dp[0][1] = 0` (correct — no chains, no cost).

For `dp[i][0]` (j=0, never enters the inner loop), the value is 0 (from initialization). This means "skip all features for the first i chains" costs 0. This is correct because unmatched chains have zero cost IN THE DP — their real cost (missCount) is applied outside.

**BUT**: There's an asymmetry. When the inner loop processes column j, "skip feature j" uses `dp[i][j-1]` which walks backward through features. When it processes row i, "skip chain i" uses `dp[i-1][j]` which walks backward through chains. Both directions correctly accumulate 0 for skips.

Actually, after careful analysis, the initialization IS correct. No amendment needed here — withdrawing this concern.

**Revised**: No action required.

---

## Critique

### C4 [WARNING]: Removing `lengthBonus` Creates a Leftmost-Chain Bias When K > M
**Generator's claim**: "With non-crossing DP, there's no priority ambiguity — the ordering constraint determines which chain gets which feature."

**Counterexample**: Consider three chains (sorted by U): C₁ (dying, 3 points), C₂ (healthy, 200 points), C₃ (healthy, 150 points). Two features: F₁, F₂. All three chains have valid cost to their nearest feature. The DP matches C₁→F₁ and C₂→F₂ because that's the optimal non-crossing assignment. C₃ is unmatched.

But C₁ is dying (feature disappearing) — the feature F₁ actually belongs to C₂. Without lengthBonus, C₁ has no penalty for being short. The DP picks C₁→F₁ because it's the leftmost valid match.

**Severity**: LOW. This scenario is mitigated by:
1. Dying features fade gradually, so C₁'s cost to F₁ will increase over rows as the feature weakens
2. C₂ has better prediction (longer history, better velocity estimate), so `predDist` term favors C₂→F₁
3. `MAX_MISS_COUNT=6` gives C₃ ample buffer to survive 1-2 rows of being unmatched
4. The DP cost includes α-weighted prediction, which indirectly encodes chain quality

**Recommendation**: Remove `lengthBonus` as proposed (it's conceptually wrong for the DP), but monitor the dying-chain-stealing scenario in post-implementation diagnostics. If observed, consider adding a small `chainAge` term to the cost function (e.g., `-0.001 * min(points.length, 20)`) as a tiebreaker.

### C5 [NOTE]: `MATCH_BONUS = 1.0` Is Correct but Fragile
**Generator's claim**: MATCH_BONUS=1.0 makes matching lexicographically preferred over skipping.

**Verification**: With typical scores in [0.001, 0.05], each match contributes [−0.999, −0.95] to total cost. The DP minimizes total cost, so it maximizes matches first (each match adds ~−0.95), then minimizes score among maximum-cardinality assignments. This is the correct behavior.

**Edge case**: If a match has score > 1.0, the cost after bonus is positive, and skipping is cheaper. When would score > 1.0 occur? Only if `rawDist + predDist + ACCEL_PENALTY_WEIGHT * accel > 1.0`. With `rawDist ≤ CHAIN_LINK_RADIUS = 0.02`, `predDist ≤ 0.02`, and `accel ≤ 0.04`, the maximum score is ~0.052. Score > 1.0 is impossible given the current radius constraints. The bonus mechanism is safe.

**Recommendation**: Document why 1.0 works: "MATCH_BONUS must exceed the maximum possible score for any valid (chain, feature) pair. Since scores are bounded by ~2 × CHAIN_LINK_RADIUS + ACCEL_PENALTY_WEIGHT × CHAIN_LINK_RADIUS ≈ 0.046, a bonus of 1.0 provides ≥20× margin."

### C6 [NOTE]: Per-Row Cut Point Recomputation vs. Fixed Cut
**Generator's Open Question 1**: Should the cut point be recomputed every row?

**Recommendation**: Recompute per row. The cost is O(K log K) ≈ O(10 log 10) per row — negligible. Benefits:
1. Adapts to chain drift (features rotate in spiral styles)
2. Handles chains that start/end mid-export (K changes between rows)
3. No risk of the fixed cut point becoming suboptimal as chains shift

However, use `predictedU` positions (not last-assigned U) for the gap computation, since the DP sorts by `predictedU` order. Using last-assigned U could cause ordering inconsistencies between the gap-finding sort and the DP sort.

### C7 [NOTE]: `postProcessFeatureChains` Is Transparent to This Change
**Generator doesn't mention** `postProcessFeatureChains`.

**Verified**: At [ChainLinker.ts lines 304-307](potfoundry-web/src/renderers/webgpu/parametric/ChainLinker.ts#L304-L307), `postProcessFeatureChains` simply calls `suppressDuplicateChains`, which compares chains by mean U-distance across shared rows. The DP change doesn't affect chain output format (`FeatureChain[]` with `ChainPoint[]`), so `postProcessFeatureChains` continues to work unchanged. No action needed.

### C8 [WARNING]: Pipeline Ordering — `repairChainsZigzags` Must Not Be Silently Removed
**Generator's claim**: "Remove entirely. Keep as diagnostic for one release cycle."

**Verified call site**: [ParametricExportComputer.ts line 1044](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1044): `chains = repairChainsZigzags(chains, allRowFeatures, allRowTypedFeatures)`. This is sandwiched between post-resnap diagnostics and pre-smooth diagnostics.

**Required approach**: 
1. Phase 1: Keep `repairChainsZigzags` call but add a counter: `const repairCount = countRepairs(result)`. If repairCount > 0, log a WARNING (not just info).
2. Phase 2 (subsequent PR): If repairCount is confirmed zero across all test configurations, remove the function.

The Generator's "keep as diagnostic" suggestion is correct. DO NOT remove the function body or its tests in the initial PR.

---

## Open Questions for Generator

1. **Wave Interference domain warping**: The `wi_compute_pattern` function applies domain warping (`warp_mag * sin(th * warp_freq + ...)`). Warping changes the effective θ-to-U mapping non-uniformly. Are you confident that warped-domain features still satisfy the non-crossing property? I believe they do (warping is a smooth diffeomorphism that preserves ordering), but the argument should be explicit.

2. **m-transition zone width**: During bifurcation (m=6→10), features split over 5-8 rows. How does the DP handle the transition rows where K increases by 4? Specifically: in the row where the first new feature appears, does the DP correctly avoid matching an existing chain to the new feature (which is between two existing chains)? I believe it does (the new feature has high cost to distant chains and gets skipped → starts a new chain), but a concrete trace through the DP for a bifurcation scenario would be reassuring.

---

## Implementation Conditions (for Executioner)

If Generator addresses amendments C1 and C2, the Executioner should implement as follows:

### Implementation Order
1. Add the `findCircularCut()` and `shiftU()` helper functions
2. Replace [lines 662-745](potfoundry-web/src/renderers/webgpu/parametric/ChainLinker.ts#L662-L745) of `linkFeatureChainsCore` (the candidate-building, sorting, and assignment block) with the DP implementation
3. Remove the `lengthBonus` computation (current [lines 737-740](potfoundry-web/src/renderers/webgpu/parametric/ChainLinker.ts#L737-L740))
4. Keep `repairChainsZigzags` as diagnostic (add counter logging)
5. Keep `smoothChainPath`, `whittakerSmooth`, `filterLowConfidenceChains`, `suppressDuplicateChains` unchanged
6. Pre-allocate DP buffers outside the row loop with maximum expected K×M

### Validation Protocol
After implementation, the following metrics must be checked:

| Metric | Current | Must Achieve | Ideal |
|--------|---------|-------------|-------|
| `maxConsecDelta` (pre-smooth) | 0.008735 | < 0.003 | < 0.001 |
| `repairChainsZigzags` count | > 0 | ≤ 5 | 0 |
| Inverted triangles | 207K | < 50K | < 10K |
| Chain count | 20 | 15-25 (same ballpark) | — |
| Export time regression | — | < 5% increase | — |

### Tests to Add
1. **Unit test**: Two chains at U=0.170 and U=0.172 with features alternating between U=0.169/0.173 — verify no zigzag (the concrete scenario from the proposal)
2. **Unit test**: K=2, M=1 — verify the better-scoring chain wins regardless of position
3. **Unit test**: K=3, M=5 — verify unmatched features start new chains in correct positions
4. **Unit test**: Circular wrapping — chains at U=0.99 and U=0.01, features at U=0.991 and U=0.009 — verify non-crossing across the seam
5. **Integration test**: Full pipeline with SuperformulaBlossom m=6→10 transition — verify chain continuity through bifurcation
6. **Regression test**: All existing `ChainLinker.test.ts` tests must continue to pass

---

## Summary

The non-crossing DP is the right algorithm for this problem. The Generator correctly identifies that zigzag = crossing, and that the greedy sort cannot enforce ordering. The DP is O(K×M), mathematically optimal, and has no tuning parameters. The circular linearization is sound. The MATCH_BONUS mechanism correctly implements lexicographic optimization (maximize matches, then minimize cost).

Two amendments are required:
- **C1**: Add formal justification for non-crossing across all styles (especially product-of-sinusoids in HarmonicRipples)
- **C2**: Correct K≈10 claim to K≈6-72, pre-allocate buffers accordingly

With these amendments and the validation protocol above, this proposal is ready for implementation.
