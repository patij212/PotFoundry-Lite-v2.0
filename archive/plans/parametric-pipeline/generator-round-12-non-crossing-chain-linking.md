# Generator Round 12 — Non-Crossing Chain Linking

Date: 2026-03-05

## Problem Statement

All three Round 11 proposals were implemented: always-momentum matching (Proposal 1), cost-based scoring with acceleration penalty (Proposal 2), and post-linker zigzag repair (Proposal 3). Despite this, chain linking still produces zigzag chains with `maxConsecDelta=0.008735` and 207K inverted triangles. The current metrics:

- 20 chains, 264 rows, 4133 features
- `minSameKindSpacing = 0.000196` (1.6 samples apart at 8192-sample resolution)
- `maxConsecDelta = 0.008735` (14× theoretical max feature migration rate)
- 207K inverted triangles

**Why the Round 11 fixes failed**: The scoring improvements (α ramp, acceleration penalty, momentum) all operate on the **cost function** — they make the greedy sort *more likely* to pick the right assignment. But the fundamental mechanism is still a **greedy sorted scan**: candidates are sorted by score, then assigned first-come-first-served. When two same-kind features are 0.000196 apart and scores differ by ~1e-10 due to floating-point noise, the sort order is effectively random. No amount of scoring refinement can fix a mechanism that breaks ties arbitrarily when scores are numerically tied.

The repair pass (Proposal 3) is a bandaid — it detects and fixes zigzags after they occur. But it can't repair all patterns (single zigzag points are easy; multi-row oscillations where the "wrong" feature is also a valid same-kind feature are harder).

**The fundamental insight**: Zigzag is exactly a **crossing** — chain A's U jumps right past chain B's position, then jumps back left. If we enforce that chains **never cross**, zigzags become structurally impossible. This is not a scoring improvement; it's a topological constraint.

## Root Cause: Concrete Zigzag Trace Through Current Code

### Setup

Row j, two active chains tracking same-kind (peak) features:
- Chain C₁: last assigned U=0.17000, velocity≈0 (vertical feature), predictedU≈0.17000
- Chain C₂: last assigned U=0.17020, velocity≈0 (vertical feature), predictedU≈0.17020

Row j+1 features (peaks only, after kind separation):
- F₁ at U=0.16990
- F₂ at U=0.17030

### Trace Through `linkFeatureChainsCore` (lines 665-700)

**Step 1**: Build candidate pairs.

| Candidate | rawDist | predDist | accel | α | score | score-lengthBonus |
|-----------|---------|----------|-------|---|-------|-------------------|
| C₁→F₁ | 0.00010 | 0.00010 | ~0 | 0.30 | 0.00010 | 0.000080 |
| C₁→F₂ | 0.00030 | 0.00030 | ~0 | 0.30 | 0.00030 | 0.000280 |
| C₂→F₁ | 0.00030 | 0.00030 | ~0 | 0.30 | 0.00030 | 0.000280 |
| C₂→F₂ | 0.00010 | 0.00010 | ~0 | 0.30 | 0.00010 | 0.000080 |

With velocity≈0: `predDist ≈ rawDist`, `accel ≈ 0`. The score degenerates to `rawDist`. All the scoring sophistication (α ramp, acceleration penalty, momentum) collapses to zero contribution because the chain has no directional history. The lengthBonus is identical for both chains (same length). The acceleration penalty is ~0 for all candidates because `currentVel ≈ 0` and `impliedVel ≈ 0` (features are within 0.0003 of chain positions).

**Step 2**: Sort by score ascending.

```
[C₁→F₁ (0.000080), C₂→F₂ (0.000080), C₁→F₂ (0.000280), C₂→F₁ (0.000280)]
```

The first two candidates have **identical scores** (0.000080). JavaScript's `Array.sort` is not guaranteed to be stable across engines, and even with stable sort, the order depends on which candidate was pushed first — which depends on the iteration order over `activeChains` (chains) × `rowFeats` (features).

**Step 3**: Assign closest-first.

If C₁→F₁ sorts first: Assign C₁→F₁, then C₂→F₂. ✓ Correct.
If C₂→F₂ sorts first: Assign C₂→F₂, then C₁→F₁. ✓ Also correct.

**But now consider row j+2**, where floating-point scoring produces a different tie-break:

Row j+2 features: F₁=0.16985, F₂=0.17035

If the tie breaks differently here → C₁ grabs F₂ (0.17035) instead of F₁ (0.16985).
C₁'s chain: [..., 0.17000, 0.16990, 0.17035] — **zigzag!** A jump of 0.0004 right.
C₂'s chain: [..., 0.17020, 0.17030, 0.16985] — **also zigzags!** A jump of 0.0004 left.

The chains crossed each other.

### Why Scoring Can't Fix This

For velocity≈0 and features within 0.0003:
- `rawDist` difference between correct and wrong: ~0.0002
- `predDist` difference: ~0.0002 (prediction is ~0 for both)
- `accel` difference: ~0.0002 (negligible because `currentVel ≈ 0`)
- Net score difference: `0.3 × 0.0002 + 0.7 × 0.0002 + 0.3 × 0.0002 ≈ 0.0003`

This 0.0003 score gap is within floating-point accumulation error. The scoring formula involves ~6 multiplications, ~3 additions, and 1 sort comparison per candidate. With `double` precision, representational error of ~1e-16 per operation accumulates to ~1e-15 after 10 operations. For scores of magnitude ~1e-4, relative error is ~1e-11 — enough to flip a 0.0003 gap? No. But the real issue is that the gap is **objectively tiny**: both assignments are almost equally good by any distance metric. The scoring can't say "C₁ should stay left of C₂" because it has no concept of ordering.

### Why Non-Crossing Fixes This

With chains sorted by U: C₁ (0.17000) < C₂ (0.17020).
With features sorted by U: F₁ (0.16985) < F₂ (0.17035).

The **only** non-crossing assignment is: C₁→F₁, C₂→F₂.
The crossing assignment (C₁→F₂, C₂→F₁) is **structurally forbidden**, regardless of scores.

No ties to break. No sort instability. No floating-point ambiguity. Correct by construction.

## Proposal: Non-Crossing Dynamic Programming Matching

### Core Idea

Replace the greedy sorted-scan assignment (lines 697-702 of ChainLinker.ts) with a non-crossing bipartite matching solved by O(K×M) dynamic programming.

**Invariant**: If chains are sorted by U position, their assigned features must be in the same order. A chain to the "left" always matches a feature to the "left" of any feature matched by a chain to its "right."

**Physical justification**: Parametric surface features (peaks, valleys of the superformula) do not cross each other in U-space as T varies. They can merge (converge and disappear) or split (bifurcate into new features), but two features never swap positions. Therefore, chains tracking these features should never cross.

### Algorithm

#### Step 1: Circular Linearization

The chains live on a circular U-space [0, 1). To apply the non-crossing DP, we need a linear ordering. Pick a "cut point" where no chains or features exist, then unwrap everything to [0, 1) relative to that cut.

```
function findCircularCut(chainUs: number[]): number
    // Sort chain U positions
    sorted = chainUs.slice().sort((a,b) => a - b)
    K = sorted.length
    
    // Find the largest circular gap between consecutive chains
    bestGap = 0, bestMid = 0
    for i = 0 to K-1:
        next = sorted[(i + 1) % K]
        curr = sorted[i]
        gap = (i === K - 1) ? (1 - curr + next) : (next - curr)
        if gap > bestGap:
            bestGap = gap
            if i === K - 1:
                bestMid = ((curr + next + 1) / 2) % 1
            else:
                bestMid = (curr + next) / 2
    
    return bestMid
```

Then shift all positions: `shifted(u) = (u - cutPoint + 1) mod 1`.

After shifting, all chain positions are clustered in a contiguous region of [0, 1), and the cut point maps to 0 (or 1). The sorted order is now the "correct" linear order.

#### Step 2: Sort Chains and Features by Shifted U

```
chainOrder = argsort(shiftedChainUs)    // indices into activeChains
featOrder  = argsort(shiftedFeatUs)     // indices into rowFeats
```

K = len(chainOrder), M = len(featOrder).

#### Step 3: Build Cost Matrix

For each (chain index i in chainOrder, feature index j in featOrder):

```
cost[i][j] = 
    if circularDistance(rowFeats[featOrder[j]], ac.predictedU) >= searchRadius:
        +∞   (pair not within linking radius → invalid)
    else:
        computeScore(activeChains[chainOrder[i]], rowFeats[featOrder[j]], rowIndex)
        - MATCH_BONUS
```

Where `computeScore` is the existing scoring function (α·rawDist + (1-α)·predDist + β·|accel|) and `MATCH_BONUS = 1.0`.

The MATCH_BONUS ensures matching is always preferred over skipping when a valid pair exists. Since scores are typically < 0.05, each match contributes approximately -0.95 to total cost. This makes the DP lexicographically optimize: maximize number of matches first, then minimize total score among maximum-cardinality matchings.

#### Step 4: Non-Crossing DP

```
// dp[i][j] = minimum total cost of non-crossing assignment
//            using chains 0..i-1 and features 0..j-1
dp = new Float64Array((K+1) * (M+1))   // initialized to 0
from = new Uint8Array((K+1) * (M+1))   // backtrace: 0=skip_feat, 1=skip_chain, 2=match

for i = 1 to K:
    for j = 1 to M:
        // Option A: skip feature j (keep chain assignments from dp[i][j-1])
        best = dp[(i)*(M+1) + (j-1)]
        bestChoice = 0   // skip_feat
        
        // Option B: skip chain i (keep feature assignments from dp[i-1][j])
        val = dp[(i-1)*(M+1) + j]
        if val < best:
            best = val
            bestChoice = 1   // skip_chain
        
        // Option C: match chain i to feature j (non-crossing guaranteed
        //           because all prior matches are to chains < i and features < j)
        if cost[i-1][j-1] < +∞:
            val = dp[(i-1)*(M+1) + (j-1)] + cost[i-1][j-1]
            if val < best:
                best = val
                bestChoice = 2   // match
        
        dp[i*(M+1) + j] = best
        from[i*(M+1) + j] = bestChoice
```

#### Step 5: Backtrace

```
matches: Array<{chainIdx: number, featIdx: number}> = []
i = K, j = M
while i > 0 and j > 0:
    choice = from[i*(M+1) + j]
    if choice === 2:       // match
        matches.push({chainIdx: chainOrder[i-1], featIdx: featOrder[j-1]})
        i--; j--
    elif choice === 1:     // skip chain
        i--
    else:                  // skip feature
        j--

// Reverse for forward order (optional, doesn't affect correctness)
matches.reverse()
```

#### Step 6: Apply Assignment

```
usedChains = new Set(matches.map(m => m.chainIdx))
usedFeats  = new Set(matches.map(m => m.featIdx))

// Extend matched chains (same as current code, lines 703-745)
for {chainIdx, featIdx} of matches:
    ac = activeChains[chainIdx]
    ac.chain.points.push({ u: rowFeats[featIdx], row: j })
    // Update predictedU, missCount = 0, etc. (unchanged)

// Handle unmatched chains (missCount++, close if > MAX_MISS_COUNT)
// Handle unmatched features (start new chains)
// (All unchanged from current code, lines 747-778)
```

### Detailed Pseudocode for Full Replacement

This replaces lines 662-778 of `linkFeatureChainsCore` (the inner loop body after the `rowFeats.length === 0` early-exit), keeping everything else unchanged:

```typescript
// ============================================================
// NON-CROSSING MATCHING (replaces greedy sorted scan)
// ============================================================

// Step 1: Circular linearization — find cut point in largest gap
const chainUs = activeChains.map(ac => ac.predictedU);
const K = activeChains.length;
const M = rowFeats.length;

// Sort chain U positions to find largest gap
const sortedChainUs = chainUs.slice().sort((a, b) => a - b);
let bestGap = 0, cutU = 0;
for (let ci2 = 0; ci2 < K; ci2++) {
    const nextIdx = (ci2 + 1) % K;
    const curr = sortedChainUs[ci2];
    const next = sortedChainUs[nextIdx];
    const gap = ci2 === K - 1 ? (1 - curr + next) : (next - curr);
    if (gap > bestGap) {
        bestGap = gap;
        // Cut point = midpoint of largest gap
        cutU = ci2 === K - 1
            ? ((curr + next + 1) / 2) % 1
            : (curr + next) / 2;
    }
}

// Shift all positions relative to cut point
function shiftU(u: number): number {
    return ((u - cutU) % 1 + 1) % 1;
}

// Step 2: Sort chains and features by shifted U
const chainOrder: number[] = Array.from({length: K}, (_, i) => i);
chainOrder.sort((a, b) => shiftU(chainUs[a]) - shiftU(chainUs[b]));

const featOrder: number[] = Array.from({length: M}, (_, i) => i);
featOrder.sort((a, b) => shiftU(rowFeats[a]) - shiftU(rowFeats[b]));

// Step 3: Compute cost matrix (only valid pairs within search radius)
const MATCH_BONUS = 1.0;
const INF = 1e9;
const costMatrix = new Float64Array(K * M).fill(INF);

for (let ci2 = 0; ci2 < K; ci2++) {
    const ac = activeChains[chainOrder[ci2]];
    const matchU = ac.predictedU;
    const searchRadius = ac.missCount > 0 ? MOMENTUM_LINK_RADIUS : linkRadius;

    for (let fi = 0; fi < M; fi++) {
        const featU = rowFeats[featOrder[fi]];
        let rawDist = Math.abs(featU - matchU);
        if (rawDist > 0.5) rawDist = 1 - rawDist;
        if (rawDist >= searchRadius) continue;

        // Compute score using existing scoring logic (α/β/accel)
        const pts = ac.chain.points;
        let score: number;
        if (pts.length < 2) {
            score = rawDist;
        } else {
            const predDist = circularDistance(featU, ac.predictedU);
            const window = Math.min(pts.length - 1, 5);
            const deltas: number[] = [];
            for (let k = pts.length - window; k < pts.length; k++) {
                const rs = pts[k].row - pts[k - 1].row;
                if (rs > 0) {
                    let du = (pts[k].u - pts[k - 1].u) / rs;
                    if (du > 0.5) du -= 1;
                    if (du < -0.5) du += 1;
                    deltas.push(du);
                }
            }
            deltas.sort((a, b) => a - b);
            const currentVel = deltas.length > 0
                ? deltas[Math.floor(deltas.length / 2)]
                : 0;
            const lastPt = pts[pts.length - 1];
            const rowGap = j - lastPt.row;
            let impliedDu = featU - lastPt.u;
            if (impliedDu > 0.5) impliedDu -= 1;
            if (impliedDu < -0.5) impliedDu += 1;
            const impliedVel = rowGap > 0 ? impliedDu / rowGap : impliedDu;
            const accel = Math.abs(impliedVel - currentVel);
            const alpha = Math.max(0.3, 1.0 - pts.length * 0.07);
            score = alpha * rawDist + (1 - alpha) * predDist
                    + ACCEL_PENALTY_WEIGHT * accel;
        }

        costMatrix[ci2 * M + fi] = score - MATCH_BONUS;
    }
}

// Step 4: Non-crossing DP
// dp[i][j] = min cost using chains 0..i-1, features 0..j-1
const dpSize = (K + 1) * (M + 1);
const dp = new Float64Array(dpSize);  // initialized to 0
const from = new Uint8Array(dpSize);  // 0=skip_feat, 1=skip_chain, 2=match

for (let i = 1; i <= K; i++) {
    for (let jj = 1; jj <= M; jj++) {
        const idx = i * (M + 1) + jj;
        // Option A: skip feature jj
        let best = dp[i * (M + 1) + (jj - 1)];
        let bestChoice = 0;
        // Option B: skip chain i
        const valB = dp[(i - 1) * (M + 1) + jj];
        if (valB < best) { best = valB; bestChoice = 1; }
        // Option C: match chain i to feature jj (non-crossing)
        const c = costMatrix[(i - 1) * M + (jj - 1)];
        if (c < INF) {
            const valC = dp[(i - 1) * (M + 1) + (jj - 1)] + c;
            if (valC < best) { best = valC; bestChoice = 2; }
        }
        dp[idx] = best;
        from[idx] = bestChoice;
    }
}

// Step 5: Backtrace to recover assignment
const usedChains = new Set<number>();
const usedFeats = new Set<number>();
let bi = K, bj = M;
while (bi > 0 && bj > 0) {
    const choice = from[bi * (M + 1) + bj];
    if (choice === 2) {
        const ci2 = chainOrder[bi - 1];
        const fi = featOrder[bj - 1];
        usedChains.add(ci2);
        usedFeats.add(fi);
        bi--; bj--;
    } else if (choice === 1) {
        bi--;
    } else {
        bj--;
    }
}

// Step 6: Apply assignment (extend matched chains, handle unmatched)
const newActive: ActiveChain[] = [];
for (const ci2 of usedChains) {
    // (extend chain, update predictedU — same as current lines 703-745)
}
// (unmatched chains: missCount++, retire if > MAX — same as current)
// (unmatched features: start new chains — same as current)
```

### Complexity Analysis

Per row:
- Circular cut: O(K log K) for sort, O(K) for gap scan
- Sort chains/features: O(K log K + M log M)
- Cost matrix: O(K × M) score computations (identical to current)
- DP: O(K × M) — two nested loops, constant work per cell
- Backtrace: O(K + M)

**Total per row**: O(K × M) where K ≈ 10 same-kind chains, M ≈ 10 features.
**Total for 264 rows**: ~26,400 operations — trivially fast.

**Comparison with current**: The current approach is O(C log C) for sorting candidates, where C = K × M ≈ 100. The DP is O(K × M) = O(100). Both are negligible. The DP is actually *cheaper* because it avoids the sort.

### Why This Is THE Algorithm (Not Three Options)

1. **Hungarian algorithm** (O(K³)): Optimal bipartite matching but doesn't enforce non-crossing. Would need to add non-crossing as a constraint, which transforms it into a harder problem. The DP directly encodes non-crossing. Also, Hungarian requires a complete cost matrix (dummy rows/columns for unequal sizes), adding complexity. The DP handles K ≠ M natively.

2. **Rank-order matching**: Sort both by U, match by positional rank. This is the special case of non-crossing DP where the DP always matches (never skips), which fails when K ≠ M (different feature counts between rows). The DP generalizes rank-order matching by allowing insertions/deletions.

3. **Non-crossing DP**: Combines optimal matching, non-crossing constraint, and unequal-size handling in one clean algorithm. This is the right tool.

## What Becomes Unnecessary

### 1. `repairChainsZigzags` — Remove Entirely

Zigzags are structurally impossible with non-crossing matching. The repair function's raison d'être is eliminated. If chains are ordered and maintain ordering, the second-derivative test will never trigger.

**However**: Keep the function in the codebase for one release cycle as a diagnostic (log if any points would have been repaired). If the count is always 0, remove it in a subsequent PR.

### 2. `lengthBonus` — Remove from Scoring

The length bonus was a hack to give longer chains priority in the greedy sort. With non-crossing DP, there's no priority ambiguity — the ordering constraint determines which chain gets which feature. The scoring only needs to reflect how well a (chain, feature) pair fits; relative priority between chains is handled by topology.

### 3. `smoothChainPath` / `whittakerSmooth` — Reduce Aggressiveness

With clean chains, the Whittaker smoothing can use a lower λ (e.g., λ=10-20 instead of 50). The smoother no longer needs to compensate for structural zigzags; it only needs to handle sample-resolution jitter (~0.000122 U per sample).

**Recommendation**: After implementation, measure `maxConsecDelta` pre-smooth. If it's already < 0.002, reduce λ to 20 and re-measure post-smooth.

### 4. `suppressDuplicateChains` — Likely Still Needed

Duplicate chains (two chains tracking the same feature) can still arise from the secondary pass. Keep this function.

### 5. `filterLowConfidenceChains` — Still Needed

Short/noisy chains from detection noise still need filtering. But the roughness threshold (`MAX_CHAIN_ROUGHNESS = 0.008`) may be reducible since chains are smoother.

## Edge Cases and Handling

### A. Circular Space

**Handled by Step 1** (circular cut). The cut point is placed in the largest gap between chain positions. For K=10 evenly-spaced chains at 0.05, 0.15, ..., 0.95, each gap is 0.10. The cut goes in one of these gaps (e.g., between 0.95 and 0.05), and all positions are shifted by the cut point.

**Edge case**: All chains within a small arc (e.g., converging near the pot base). The largest gap may be > 0.8. The cut is in that gap, and all chains/features are in the remaining 0.2 range. The DP operates on this compressed linear range, which is correct.

**Edge case**: A single chain (K=1). No ordering constraint needed. The DP degenerates to: match the chain to the closest valid feature. Same result as greedy.

### B. Feature Count Changes (Bifurcation: 6→10 peaks)

**Handled natively by the DP**. When M > K (more features than chains), some features go unmatched and start new chains. When K > M (fewer features than chains), some chains go unmatched and increment missCount. The non-crossing constraint ensures the matched subset preserves ordering.

**Example**: 6 chains at [0.00, 0.167, 0.333, 0.500, 0.667, 0.833] (6-fold symmetry). 10 features at [0.00, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90] (10-fold).

With `CHAIN_LINK_RADIUS = 0.02`, the valid pairs are:
- Chain 0.00 → Feat 0.00 (d=0.00) ✓
- Chain 0.50 → Feat 0.50 (d=0.00) ✓
- All other pairs have d > 0.02, so they're invalid.

DP assigns: 2 matches, 4 unmatched chains (missCount++), 8 new chain starts. This is correct — the m-transition genuinely moves feature positions, and old chains can't track the new positions.

### C. Feature Crossing (Features Swapping U Positions)

**Question from Verifier Round 11**: "Do SuperformulaBlossom features ever cross each other in U-space?"

**Answer**: No. The superformula polar extrema at $\theta_k = 2\pi k / m$ shift continuously as m changes, but maintain their cyclic order. The extrema slide along θ but never overtake each other. This is provable: for $r(\theta) = |cos(m\theta/4)/a|^{n_2} + |sin(m\theta/4)/b|^{n_3}$, the angular positions of extrema are monotonic functions of m.

For other PotFoundry styles (Spiral, Wave, Petal), features also don't cross — they can merge, split, or shift, but two distinct same-kind features at different angular positions don't swap positions.

**If crossing ever did occur**: The non-crossing DP would force one chain to "die" (not match any feature) and a new chain would start at the crossed position. This produces a clean chain break rather than zigzag. The post-processing `suppressDuplicateChains` would handle any resulting short chain fragments. This is strictly better than zigzag artifacts.

### D. Momentum (Gap-Bridging Chains with missCount > 0)

Gap-bridging chains use `MOMENTUM_LINK_RADIUS` (wider search). The DP handles this by using the per-chain `searchRadius` in the cost matrix computation. A chain with `missCount > 0` has more valid pairs than one with `missCount = 0`, but they're still subject to the non-crossing constraint.

**Edge case**: A gap-bridging chain's `predictedU` has drifted (due to momentum extrapolation) so far that it crosses another active chain's position. The non-crossing DP would prevent this crossing, potentially leaving the gap-bridging chain unmatched. This is correct — if the prediction crosses other chains, the prediction is likely wrong, and the chain should close.

### E. Secondary Linking Pass

The secondary pass (lines 828-868) calls `linkFeatureChainsCore` on residual features with tighter parameters. The non-crossing DP applies identically. Since secondary features are sparse, the DP typically degenerates to independent 1-chain-1-feature matches (no crossing possible).

## Risk Assessment

### Low Risk

1. **Output format unchanged**: `FeatureChain[]` with `ChainPoint[]` — identical to current output.
2. **Performance**: O(K × M) per row, K ≈ M ≈ 10. ~100 ops per row. Negligible.
3. **Scoring unchanged**: The per-pair score computation is identical. Only the assignment logic changes.
4. **Backward compatible**: For well-separated features (spacing >> link radius), non-crossing DP produces the exact same result as greedy — every greedy assignment is non-crossing when there's no ambiguity.

### Medium Risk

5. **Circular cut heuristic**: If chains are on exactly opposite sides of the circle (largest gap = 0.5 — possible for K=2), any cut works. For K=1, no cut needed. But for pathological arrangements where features are evenly spaced at 0.5/K and the cut bisects a chain-feature pair, the cut might be suboptimal. **Mitigation**: The cut is placed at the midpoint of the largest gap, which is always between features (not on a feature). With 10+ chains, the largest gap is ~0.10, providing ample clearance.

6. **Features at the seam (U ≈ 0 or 1)**: The cut point might be near U=0 if that's where the largest chain gap is. Shifting by `cutU ≈ 0` is a no-op. Shifting by `cutU ≈ 0.5` moves everything half-circle. Both are correct as long as `shiftU` wraps properly.

### Near-Zero Risk

7. **The DP has no tuning parameters**. It's an exact algorithm. No thresholds, no heuristics, no convergence criteria. It either finds the optimal non-crossing matching or it doesn't (it always does — the DP is exhaustive over the O(2^(K+M)) possible matchings).

## Expected Impact on Metrics

| Metric | Current | Expected | Rationale |
|--------|---------|----------|-----------|
| maxConsecDelta (pre-smooth) | 0.008735 | < 0.001 | No zigzag → delta = feature detection noise only |
| maxConsecDelta (post-smooth) | ? | < 0.0005 | WH smoother needs less aggressive λ |
| Inverted triangles | 207K | < 10K | Clean chains → clean CDT constraints → no degenerate tris |
| Missing chain edges | ~487 | < 50 | No crossing constraints → no edge swallowing |
| zigzag repairs (Proposal 3) | >0 | 0 | Zigzags structurally impossible |

## Open Questions

1. **Cut point stability**: Should the cut point be recomputed every row (adapting to chain drift), or computed once from the initial chain positions? Recomputing per-row is safer but adds O(K log K) per row. My recommendation: recompute per row — the cost is negligible and it handles chains that merge near the seam.

2. **Interaction with `linkFeatureChains` two-pass structure**: The primary pass produces chains, then the secondary pass recovers residual features. With non-crossing DP, the primary pass should produce cleaner chains with fewer misassignments, meaning fewer residual features for the secondary pass. The secondary pass might produce fewer or no chains. Is this desirable? (Yes — fewer secondary chains means the primary pass is working correctly.)

3. **Empirical validation of MATCH_BONUS = 1.0**: With scores of magnitude ~0.001 to 0.05, a MATCH_BONUS of 1.0 is 20-1000× larger. This strongly favors matching over skipping. Is there a scenario where skipping *should* be preferred even when a valid pair exists within radius? (I don't think so — the radius filter already rejects bad pairs.)

4. **Performance of `Float64Array` allocation**: The DP allocates two arrays of size (K+1)×(M+1) ≈ 121 per row. For 264 rows, that's ~64K floats = 512KB. This is trivial. But if allocation overhead matters, a pre-allocated buffer (max size, reused across rows) would eliminate GC pressure.

5. **Post-implementation λ tuning**: With cleaner chains, should WH λ be reduced from 50 to 20? This is an empirical question for after implementation. Deferred.
