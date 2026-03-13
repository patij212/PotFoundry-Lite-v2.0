# Generator Round 11 — Chain Linking Quality

Date: 2026-03-04

## Problem Statement

Chain linking produces zigzag chains (maxConsecDelta=0.009) that oscillate between nearby features during m-transitions. This is 14× the theoretical max migration rate (~6.3×10⁻⁴/row). When CDT constraints are enforced (Round 10's fix), these zigzag chains produce degenerate triangulations.

**The critical path is: fix chain linking quality → good chains → CDT constraint enforcement produces a good mesh.**

## Root Cause Analysis

### Finding 1: Momentum Is Computed But Not Used During Normal Linking

**This is the primary bug.** In [ChainLinker.ts](../src/renderers/webgpu/parametric/ChainLinker.ts#L675):

```typescript
const matchU = ac.missCount > 0 ? ac.predictedU : ac.chain.points[ac.chain.points.length - 1].u;
```

The signed-median velocity is computed and stored in `predictedU` after every assignment (L707-733), but it's **only used as the match center when `missCount > 0`** (gap bridging). During normal row-to-row linking (`missCount === 0`), the match center is the *raw last-assigned position*, ignoring the velocity prediction entirely.

**Consequence**: If a bad assignment happens at row N (chain jumps to a nearby wrong feature), the match center for row N+1 is the *wrong position* from row N, not the momentum-corrected prediction. This means the wrong feature is the closest again, OR the chain zigzags back. Either way, momentum can't help because it's being ignored.

### Finding 2: Global Greedy "Closest First" Has an Inherent Asymmetry

The algorithm sorts ALL (chain, feature) pairs by distance and assigns greedily (L697):

```typescript
candidates.sort((a, b) => a.dist - b.dist);
```

When two features F₁ and F₂ are within 0.01 of each other (bifurcation zone), two chains C₁ and C₂ both produce candidates for both features. The one with the smallest raw distance wins, regardless of whether that assignment makes the *other* chain's best remaining option worse.

Example: C₁ at u=0.170, C₂ at u=0.173. F₁ at u=0.168, F₂ at u=0.175.
- C₁→F₁: d=0.002,  C₁→F₂: d=0.005
- C₂→F₁: d=0.005,  C₂→F₂: d=0.002
- Global optimal: C₁→F₁, C₂→F₂ (total cost 0.004)
- But C₁→F₂ and C₂→F₁ both have d=0.005 and would also be valid...

The actual failure is subtler: when features shift between rows, the greedy sort can't distinguish "Chain A should track the left feature and Chain B the right" from "both chains could grab either." The `lengthBonus` (L688) helps but is tiny (0.0001 per point, capped at 10% of radius = 0.002), and doesn't encode *which direction* each chain has been trending.

### Finding 3: The Velocity Window Is Too Short to Establish a Trend

The velocity uses a window of `min(pts.length - 1, 5)` deltas (L713). During a bifurcation at row ~100, a chain that's been tracking a vertical feature (velocity ≈ 0) has 5 recent deltas all near zero. When two features appear within 0.01 of each other, the velocity doesn't help disambiguate because it predicts "stay put" — and both features satisfy that.

The issue isn't that the velocity is wrong; it's that velocity is *uninformative* at the exact moment disambiguation matters most: when a feature has been stationary and suddenly needs to pick between two close neighbors.

## Proposals

### Proposal 1: Momentum-Aware Matching (Conservative)

**Idea**: Always use `predictedU` as the match center, not just during gap bridging. This is the simplest possible fix — just remove the conditional on line 675.

**Mechanism**: Change:
```typescript
const matchU = ac.missCount > 0 ? ac.predictedU : ac.chain.points[...].u;
```
to:
```typescript
const matchU = ac.predictedU;
```

And ensure `predictedU` is initialized = first point's U when a chain starts (it already is, L769), and updated after every assignment (it already is, L707-733).

**Why it fixes the failure mode**: Once a bad assignment happens at row N, the velocity at row N+1 will reflect the anomaly. But more importantly — this change means the matcher looks at where the chain *is going*, not just where it *was*. For a vertical feature, `predictedU ≈ lastU`, so this is a no-op for stable features. For features that are legitimately migrating (the m-transition slope), the prediction tracks the slope and biases toward the correct feature.

**However**: This alone is insufficient at bifurcation points because the velocity is ~0 (feature was stationary), so `predictedU ≈ lastU` and you're back to the same ambiguity. This is necessary but not sufficient.

**Computational cost**: Zero additional cost. This removes a branch, not adds one.

**Risk assessment**: Very low risk. The prediction is already being computed. For `missCount === 0`, `predictedU` ≈ `lastU ± velocity` which is very close to `lastU` for stable features. Worst case: prediction slightly overshoots, but the search radius already covers ±0.02.

**Testability**: Synthetic test with two close features that drift in opposite directions. Verify chains stay on their respective features with momentum vs. without.

**Assumptions**:
1. The signed-median velocity estimator is adequate for row-to-row prediction (Verifier should verify sigmal-to-noise at bifurcation)
2. `predictedU` is correctly initialized for single-point chains (it is: L769)

---

### Proposal 2: Cost-Based Bipartite Assignment with Prediction Penalty (Moderate)

**Idea**: Replace the greedy "closest-first" assignment with a scoring function that penalizes trajectory deviation. Instead of sorting by raw distance alone, the score combines spatial proximity with trajectory consistency.

**Mechanism**:

For each candidate pair (chain C, feature F at row j):

```
rawDist  = circularDistance(F.u, C.lastU)
predDist = circularDistance(F.u, C.predictedU)

score = α · rawDist + (1 - α) · predDist + β · |accel|
```

Where:
- `α` = weight on raw distance (spatial proximity), starts at 1.0 for short chains, decreases to 0.3 for chains with ≥10 points
- `predDist` = distance from the feature to the chain's *predicted* next position
- `|accel|` = magnitude of the "acceleration" this assignment would imply:
  ```
  currentVel = signedMedianVelocity(lastN deltas)
  impliedVel = circularSignedDelta(C.lastU, F.u)
  accel = impliedVel - currentVel
  ```
- `β` = acceleration penalty weight (suggested: 0.5)

**Pseudocode**:
```
for each active chain C:
    compute predicted_u from signed-median velocity
    compute current_velocity from recent deltas
    
for each candidate (C, F):
    raw_dist = circular_distance(F.u, C.last_u)
    pred_dist = circular_distance(F.u, C.predicted_u)
    implied_vel = circular_signed_delta(C.last_u, F.u)
    accel = |implied_vel - C.current_velocity|
    
    // Adaptive weighting: longer chains trust prediction more
    alpha = max(0.3, 1.0 - C.length * 0.07)  // ramps down over ~10 rows
    score = alpha * raw_dist + (1 - alpha) * pred_dist + 0.5 * accel

sort candidates by score ascending
assign greedily (each chain and feature used once)
```

**Why it fixes the failure mode**: At a bifurcation point, two features F₁ and F₂ appear near chain C₁ (which has been tracking the slowly-drifting left peak). The raw distances to both are similar (~0.005). But:
- F₁ (the correct one, drifting left) has `accel ≈ 0` because `impliedVel ≈ currentVel`
- F₂ (the new bifurcation, stationary or drifting right) has `accel > 0` because assigning it would reverse the chain's direction

The acceleration penalty breaks the tie in favor of trajectory consistency. For a chain with 10+ points, the prediction weight dominates and the chain follows its momentum.

**Computational cost**: O(C × F) per row, where C = active chains (~20) and F = features per row (~15). Same asymptotic cost as current. The per-candidate scoring adds ~5 multiplies per pair. Total per row: ~1500 multiplies. Negligible.

**Risk assessment**:
- Medium: the `α` ramp-down could over-trust early predictions for short chains. If the first 3-4 points have a noisy velocity, α=0.79 still gives 79% weight to raw distance, which is safe.
- The acceleration penalty could make it harder for chains to course-correct if they DO start on the wrong feature. But acceleration is only a penalty, not a hard threshold — a large position error (large rawDist) still dominates.
- Edge case: spiraling features with continuous acceleration. The penalty would fight this. Mitigation: `β` should be small enough that sustained acceleration only adds ~0.001 to the score.

**Testability**:
1. Unit test: two features bifurcating at row 50 (start distance 0, end distance 0.05). Verify chains track their respective features through the bifurcation.
2. Unit test: a chain with established velocity 0.001/row. Two features at +0.001 and -0.001 offset. Verify it picks the velocity-consistent one.
3. Regression: existing linking tests must pass unchanged (vertical, diagonal, gap-bridging, seam-crossing).

**Assumptions (for Verifier)**:
1. Signed-median velocity over 5 deltas is a robust estimator of feature drift direction (should be, since features move smoothly by design)
2. Acceleration penalty β=0.5 doesn't over-penalize legitimate sharp turns in spiral features (need to check: do PotFoundry features ever have discontinuous velocity?)
3. The α ramp (1.0→0.3 over 10 points) gives enough bias before bifurcation zones are reached (bifurcation happens at row ~20-50 for 264-row grids)

---

### Proposal 3: Post-Linker Zigzag Repair Pass (Conservative, Complementary)

**Idea**: After linking, scan each chain for zigzag patterns and repair them by reassigning points that violate trajectory smoothness. This is a *post-processor*, not a change to the core linker, making it safe to add alongside Proposal 1 or 2.

**Mechanism**: For each chain, detect "zigzag segments" where the second derivative (acceleration) exceeds a threshold, then try to reassign those points to alternate features from the same row.

**Algorithm**:

```
function repairChainZigzags(
    chain: FeatureChain,
    allRowFeatures: number[][],
    maxAccel: number = 0.003
): FeatureChain

    unwrapped = unwrapChain(chain)
    repaired = [...chain.points]
    
    for i = 1 to len-2:
        // Compute second derivative (acceleration)
        accel = |unwrapped[i-1] - 2*unwrapped[i] + unwrapped[i+1]|
        
        if accel > maxAccel:
            // This point is a zigzag: the chain jumped and jumped back
            // Compute what U should be for a smooth trajectory
            predicted_u = (unwrapped[i-1] + unwrapped[i+1]) / 2  // linear interp
            
            // Look for an alternate feature in this row closer to predicted
            row = chain.points[i].row
            rowFeats = allRowFeatures[row]
            best_u = repaired[i].u
            best_dist = circularDistance(best_u, wrapU(predicted_u))
            
            for feat_u in rowFeats:
                d = circularDistance(feat_u, wrapU(predicted_u))
                if d < best_dist:
                    best_dist = d
                    best_u = feat_u
            
            if best_u != repaired[i].u:
                repaired[i] = { u: best_u, row: row }
                // Update unwrapped for subsequent checks
                unwrapped[i] = liftToReference(best_u, (unwrapped[i-1]+unwrapped[i+1])/2)
    
    return { ...chain, points: repaired }
```

**Why it fixes the failure mode**: The zigzag pattern is exactly: row N correct, row N+1 wrong (jumps to nearby feature), row N+2 correct (jumps back). This produces a large second derivative at row N+1. The repair pass detects this kink, interpolates where the point *should* be, and looks for an alternative feature in that row that's closer to the interpolated position.

At a bifurcation where u₁=0.165 and u₂=0.175, if the chain was at 0.167 and jumps to 0.175 then back to 0.166, the repair sees the kink at the middle point, interpolates predicted ≈ 0.166, finds u₁=0.165 is closer than u₂=0.175, and reassigns.

**Multi-pass**: The repair can be run iteratively (2-3 passes) since fixing one zigzag point changes the context for adjacent points. Convergence is fast because each pass can only reduce or maintain the total acceleration.

**Computational cost**: O(N × F_max) per chain per pass, where N = chain length (~264 points) and F_max = max features per row (~15). For 20 chains × 3 passes: 20 × 3 × 264 × 15 ≈ 238K comparisons. Trivial.

**Risk assessment**:
- **Low risk**: This is purely additive — it doesn't change the linker, only post-processes results. Can be A/B tested trivially.
- **Risk of over-correction**: A legitimately sharp turn could be "repaired" away. Mitigation: the `maxAccel` threshold should be calibrated to the theoretical maximum migration rate. For SuperformulaBlossom, max migration is ~0.000633/row, so max accel ≈ 2 × 0.000633 = 0.00127. Setting `maxAccel = 0.003` (2.4× theoretical) gives generous headroom.
- **Risk of chain swapping**: If two nearby chains both have zigzags at the same rows, the repair pass could make them swap points. Mitigation: repair one chain at a time and mark used features. Or accept it — two chains that swap points at one row are both equally close to the feature, so the swap doesn't matter for mesh quality.
- **Risk with seam-crossing**: Must use circular arithmetic throughout. The unwrapped chain handles this.

**Testability**:
1. Synthetic test: chain with known zigzag pattern [(0.17, 0), (0.18, 1), (0.165, 2), (0.18, 3), (0.17, 4)]. Provide alternate features. Verify repair picks the smoother path.
2. Golden test: perfect chain (linear slope). Verify repair is a no-op.
3. Seam test: zigzag near u=0/1 boundary. Verify circular arithmetic works.
4. Convergence test: run 5 passes, verify output stabilizes after 2-3.

**Assumptions (for Verifier)**:
1. The linear interpolation `(u[i-1] + u[i+1]) / 2` is an adequate predictor for the correct feature position (should be, since features move smoothly)
2. `maxAccel = 0.003` is the right threshold — above noise, below real features (need to verify against actual feature acceleration statistics)
3. The repair pass doesn't create new zigzags by changing one point's context for its neighbors (the multi-pass convergence should handle this)
4. Alternate features exist in the row (they do — the wrong chain presumably stole the right feature, which means the right feature is in the row's feature list)

## Recommended Approach

**All three proposals are complementary and should be implemented together:**

1. **Proposal 1 (momentum-aware matching)**: One-line fix, zero risk, necessary but not sufficient. **Do first.**

2. **Proposal 2 (cost-based scoring)**: Fixes the root cause at the assignment level. The acceleration penalty and prediction weighting prevent bifurcation zigzags from happening in the first place. **Core fix.**

3. **Proposal 3 (zigzag repair)**: Safety net that catches any remaining zigzags from edge cases the scoring function doesn't fully handle. Also retrofits quality onto chains from the secondary pass (which uses a smaller radius and might have different failure modes). **Defense in depth.**

Implementation order: 1 → 3 → 2. Reason: Proposal 1 is trivial, Proposal 3 is safe to add and test independently, and Proposal 2 is the most invasive change to the core matcher and benefits from the safety net already being in place.

**Expected outcome**: Combining Proposals 1+2 should reduce maxConsecDelta from 0.009 to ≤0.002 at the bifurcation zone. Proposal 3 as a post-pass should mop up any remaining outliers to ≤0.001. After WH smoothing (λ=50), the expected final maxConsecDelta should be well below 0.001.

## Open Questions

1. **Feature acceleration statistics**: What is the actual maximum |du²/dt²| for SuperformulaBlossom features during m-transitions? This calibrates the acceleration penalty (β in Proposal 2) and the zigzag threshold (maxAccel in Proposal 3). The Verifier should compute this analytically from the superformula derivative.

2. **Hungarian algorithm vs. greedy**: Proposal 2 still uses greedy assignment. A full optimal bipartite matching (Hungarian, O(n³)) would produce globally optimal assignments but costs ~3375× more per row for 15 features. Is this worth it? My instinct: no, because the scoring function already disambiguates the cases where greedy fails. But the Verifier should assess.

3. **Secondary pass interaction**: The secondary pass uses `CHAIN_LINK_RADIUS * 0.7 = 0.014`. Does Proposal 2's scoring work well with smaller radii? The α ramp-down might need adjustment since secondary chains are shorter.

4. **Spiral features**: Do any PotFoundry styles have features with sustained non-zero acceleration (i.e., curved trajectories, not just linear drift)? If so, Proposal 2's acceleration penalty needs a cap, and Proposal 3's `maxAccel` needs to be calibrated per-style.

5. **Interaction with WH smoothing**: After Proposals 1-3 reduce pre-smooth maxConsecDelta to ~0.001-0.002, is WH smoothing (λ=50) still needed, or does it now over-smooth? The Verifier should check whether λ should be reduced (e.g., to 10-20) or removed entirely once chain quality improves.
