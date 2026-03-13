# Generator Round 1 — Chain Polyline Jaggedness: Detected Points Are Good, Chains Are Not

**Date**: 2026-03-03  
**Status**: Proposal for Verifier review

---

## Problem Statement

The user reports: **"Detected points are really looking quite well aligned, but the feature chain polylines are extremely jagged and do not follow the detected points."**

This is a critical distinction. The per-row feature detection (`detectRowFeaturesV16`) is producing accurate U positions — the individual peaks and valleys ARE at the right places. But the polylines that connect them into chains are jagged. The SG denominator bug was fixed (coefficients summed to 1.25 instead of 1.0), but even with correct normalization, the chains still show severe jaggedness.

The bug fix corrected an offset, but it didn't address the **structural** reason chains are jagged. Let me enumerate the possible causes systematically.

---

## Root Cause Analysis

### Hypothesis 1: Chain Linker Misassignment (PROBABLE — HIGH IMPACT)

`linkFeatureChainsCore` uses **greedy nearest-neighbor** matching with `CHAIN_LINK_RADIUS = 0.04`. At each row, it tries to extend active chains to the nearest unmatched feature.

**The failure mode**: When two features are close together (e.g., a peak at U=0.32 and a valley at U=0.35), the chain for the peak might grab the valley's position in a row where the peak was missed (below prominence gate), and vice versa. Even though `linkFeatureChainsByKind` separates peaks from valleys, **within the same kind**, features at similar U positions compete.

This produces chains that zigzag between adjacent same-type features, especially in styles where:
- Multiple peaks cluster near each other (e.g., harmonic composite styles)
- Features merge/split at style transitions (m-number changes)

**Evidence**: The `CHAIN_LINK_RADIUS = 0.04` is HUGE — that's 4% of the full circumference. For a pot with 10 petals, features are spaced `0.1` apart. A link radius of `0.04` means a chain can jump 40% of the way to the **next** feature. This is the core problem.

**File**: `ChainLinker.ts:400-495`

### Hypothesis 2: `resnapChainToMeasuredPeaks` Undoing GPU Precision (PROBABLE — MEDIUM IMPACT)

The pipeline does:
1. Chain linking (crude U positions from 8192-sample probe)
2. `postProcessFeatureChains` → `resnapChainToMeasuredPeaks` (snaps to nearest 8192-probe peak)
3. GPU re-snap (32 candidates, parabolic refinement — high precision)
4. SG smoothing

But wait — step 2 **snaps to the CRUDE 8192-sample peaks**, BEFORE GPU re-snap refines them. If the chain linker assigned a point to the wrong feature (Hypothesis 1), resnap makes it WORSE because it locks the misassignment to the exact crude position of the wrong feature. GPU re-snap then refines to the local extremum near that wrong position.

**File**: `ChainLinker.ts:198-222` (resnapChainToMeasuredPeaks)

### Hypothesis 3: SG Smoothing Creates NEW Zigzag on Short Chains (MINOR)

The SG filter requires `2*halfWidth + 1 = 7` points minimum. Chains with exactly 7-10 points get minimal smoothing (only 1-4 interior points smoothed), and the boundary points (kept original) can create a visual zigzag at the start/end of chains. But this is a boundary effect, not the primary cause.

### Hypothesis 4: Momentum Prediction Amplifies Misassignment (POSSIBLE)

When a chain misses a row (`missCount > 0`), the search radius expands to `MOMENTUM_LINK_RADIUS = linkRadius * 2.0 = 0.08` — a full 8% of circumference. With momentum prediction, the chain extrapolates its velocity to a `predictedU`. If the velocity itself was wrong (due to previous mis-assignment), the prediction points to the WRONG feature with an even larger search radius, locking in the error.

**File**: `ChainLinker.ts:440-460`

---

## Proposals

### Proposal 1: Tighten Link Radius + Add Typed Feature Matching (Conservative)

**Idea**: Reduce `CHAIN_LINK_RADIUS` and use the detected feature's confidence/prominence as part of the matching criteria.

**Mechanism**:
- Reduce `CHAIN_LINK_RADIUS` from `0.04` to `0.015` — features 1.5% apart should not be linked
- Reduce `MOMENTUM_LINK_RADIUS` to `linkRadius * 1.5` instead of `2.0`
- Increase `MAX_MISS_COUNT` from 6 to 8 to compensate (tighter radius means more misses, but misses can be tolerated longer with momentum)

**Trade-offs**: 
- ✅ Prevents cross-feature misassignment
- ❌ May break chains at style transitions where features genuinely move 2-3% between rows
- ❌ Doesn't fix the root cause — still greedy matching

**Assumptions**:
1. Most feature-to-feature spacing is > 0.03 U (true for 5-10 petal styles)
2. Genuine feature drift between consecutive rows is < 0.015 U (needs validation)

### Proposal 2: Hungarian Assignment Instead of Greedy (Moderate)

**Idea**: Replace the greedy closest-first matching with optimal bipartite assignment using the Hungarian algorithm (or Jonker-Volgenant).

**Mechanism**:
- For each row transition, build a cost matrix: `cost[chain][feature] = circularDistance`
- Solve the optimal assignment that minimizes total linking cost
- This prevents chain A from stealing chain B's feature just because it was processed first

**Mathematical basis**: The current "sort by distance, assign closest-first" is a greedy approximation of the assignment problem. It's well-known to be suboptimal when multiple entities compete for the same resources. Hungarian gives the provably optimal global assignment.

**Trade-offs**:
- ✅ Eliminates all cross-assignment errors
- ✅ O(n³) per row where n = max(num_chains, num_features) — typically n < 30, so < 27K operations per row at worst
- ❌ More complex to implement
- ❌ May still produce suboptimal results when chains span gaps (momentum candidates aren't natural assignments)

**Assumptions**:
1. Feature count per row is typically < 30 (makes Hungarian tractable)
2. The optimal assignment is always the correct one (may not be true at merge/split points)

### Proposal 3: Rethink the Pipeline Order — Eliminate resnapChainToMeasuredPeaks (Moderate)

**Idea**: The current pipeline has a fundamental ordering problem. `resnapChainToMeasuredPeaks` snaps to CRUDE 8192-sample positions BEFORE GPU refinement. This is backwards. Remove resnap entirely and let GPU re-snap be the sole precision mechanism.

**Mechanism**:
1. Remove `resnapChainToMeasuredPeaks` from `postProcessFeatureChains`
2. Keep `suppressDuplicateChains` (still useful for dedup)
3. GPU re-snap (already runs at Step 3.5) becomes the sole precision pass
4. SG smoothing then operates on GPU-refined positions

The current flow:
```
linking → resnap-to-crude → GPU-resnap → SG-smooth
```
Proposed flow:
```
linking → dedup → GPU-resnap → SG-smooth
```

**Mathematical basis**: `resnapChainToMeasuredPeaks` DECREASES precision when:
- The chain linker correctly assigned a feature but the 8192-sample peak position has quantization error ±0.00006
- A wrong peak is closer in the crude sample space but the correct one would be found by GPU's sub-sample refinement

**Trade-offs**:
- ✅ Removes a precision-degradation step
- ✅ Zero complexity increase (removing code)
- ❌ Chain linker positions may be slightly off-peak before GPU fixes them
- ❌ `suppressDuplicateChains` uses roughness which would see the linker's raw positions (slightly noisier)

**Assumptions**:
1. GPU re-snap can correct any positional error from the chain linker (true — it searches ±2 sample widths)
2. Removing resnap doesn't break `suppressDuplicateChains` (unlikely — roughness comparison is relative)

### Proposal 4: Chain Path Regression Instead of Point-by-Point Matching (Radical)

**Idea**: Instead of building chains point-by-point and then smoothing, fit a continuous parametric curve to clusters of detected points.

**Mechanism**:
1. Detect all row features as before (per-row peaks/valleys — these are good)
2. Instead of sequential linking, use **DBSCAN clustering** on the full set of (U, T) feature points. Each cluster represents one continuous feature.
3. For each cluster, fit a 1D parametric curve: `U(T) = polynomial` or `U(T) = spline`. This gives the smooth mathematical trajectory directly.
4. Sample the fitted curve at each T-row to get chain positions.

**Mathematical basis**: The underlying feature IS a smooth mathematical curve `U(T)`. Instead of detecting it point-by-point and trying to connect the dots (which is the chain linker's error-prone job), fit the curve directly to the detected points.

**Trade-offs**:
- ✅ Chains are smooth BY CONSTRUCTION — no smoothing needed
- ✅ No linking errors — clustering is global, not greedy
- ✅ Handles merge/split naturally (DBSCAN detects when clusters fork)
- ❌ Complex to implement correctly (spline fitting, cluster validation)
- ❌ DBSCAN needs careful epsilon tuning (analogous to link radius)
- ❌ Breaks the current chain data structure (would need new intermediate representation)
- ❌ Polynomial/spline may not capture some exotic feature shapes (spirals that wrap multiple times)

**Assumptions**:
1. Features are smooth continuous curves that can be well-approximated by polynomials or splines
2. DBSCAN clustering correctly separates features (may fail at merge points)
3. The performance cost of clustering + fitting is tolerable (~50K feature points)

### Proposal 5: Strip Width as the Missing Constraint (Radical, Orthogonal)

**Idea**: The problem isn't just chain position accuracy — it's that the CDT doesn't ENFORCE the mathematical feature shape in the final mesh. Even perfectly positioned chain vertices only constrain POINT positions, not the EDGE directions between them.

**Mechanism**: Instead of relying on chain edges (which zigzag because consecutive chain points in adjacent rows are at slightly different U positions), compute the **mathematical ridge direction** at each chain vertex and use it to orient constraint edges.

1. At each chain vertex, compute `dU/dT` from the parametric surface (analytically or via finite differences on the GPU)
2. Orient the chain edge to follow this mathematical direction, not just connect consecutive row points
3. This means chain edges would be TANGENT to the feature curve rather than zigzag approximations

**Trade-offs**:
- ✅ Edges follow the mathematical feature by construction
- ✅ Even with imprecise chain vertex positions, the edge direction is correct
- ❌ Requires analytical or GPU-computed tangent vectors
- ❌ May create non-manifold geometry if edge directions conflict
- ❌ Complex interaction with CDT (directed constraint edges aren't standard)

---

## Recommended Approach

**Priority order**: 3 → 1 → 2 → 4 → 5

1. **Start with Proposal 3** (eliminate `resnapChainToMeasuredPeaks`). It's zero-cost, removes a precision-degradation step, and may immediately improve results. The SG coefficient fix was correct but resnap may be re-introducing jitter by snapping to crude positions.

2. **Then Proposal 1** (tighten link radius). Quick to test — change one constant. If features are misassigning, this will show immediate improvement.

3. **If 1+3 aren't enough, Proposal 2** (Hungarian assignment). This is the principled fix for the linking problem.

4. **Proposals 4 and 5 are for the v3.0 horizon** — they're the "right" solution but require significant architecture changes.

---

## Open Questions (For Verifier)

1. **Is `CHAIN_LINK_RADIUS = 0.04` actually causing cross-assignment?** I believe so based on the math, but we need the Verifier to check: what's the typical spacing between same-kind features? If it's < 0.08 (2×link radius), cross-assignment is guaranteed.

2. **Does removing `resnapChainToMeasuredPeaks` break the `suppressDuplicateChains` roughness comparison?** Resnap makes chains "snappier" — removing it means chains have smoother but slightly off-peak positions. Does this affect which chain wins in a duplicate pair?

3. **Is the SG smoothing even needed if we fix the root cause?** If chains are correctly linked and GPU-refined, the remaining jitter is ±0.00003 U (sub-sample). Is that even visible in the mesh?

4. **Hungarian vs greedy: how many assignments actually differ?** We could instrument the current greedy to log cases where chain A and chain B both wanted the same feature. If this is rare (<1% of rows), Proposal 2 is overkill.

5. **Are the companion point cloud and chain strip expansion parameters making the jaggedness MORE visible** by increasing local mesh density around wrong chain positions?

---

## Diagnostic Instrument Proposal

Before implementing any fix, add one diagnostic pass in PEC after Step 3.6:

```typescript
// For each chain, compute max U-deviation from local linear fit
// over a sliding window of 5 points. High deviation = zigzag.
for (const chain of chains) {
    const unwrapped = unwrapChain(chain);
    let maxDev = 0;
    for (let i = 2; i < unwrapped.length - 2; i++) {
        const localMean = (unwrapped[i-2] + unwrapped[i-1] + unwrapped[i] + unwrapped[i+1] + unwrapped[i+2]) / 5;
        const dev = Math.abs(unwrapped[i] - localMean);
        maxDev = Math.max(maxDev, dev);
    }
    console.log(`Chain ${chain.points[0].row}-${chain.points[chain.points.length-1].row}: maxDev=${maxDev.toFixed(6)}, len=${chain.points.length}`);
}
```

This would tell us exactly which chains are jagged and by how much, BEFORE we try any fix.
