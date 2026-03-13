# Generator Round 51 — Chain Birth/Death Tracking + Mesh Topology
Date: 2026-03-09

## Executive Summary

Two interconnected problems degrade PotFoundry's export quality:

**Problem A**: Chains 0-3 (partial, 46-119 rows) have avgUErr 50-270× worse than stable chains 4-16 because the chain linker has NO mechanism for handling feature birth/death at m-transition zones. The DP matcher connects dying features to strengthening ones, creating chains that jump between distinct mathematical features.

**Problem B**: The outer wall tessellator produces 39% aspect-ratio violations (>4:1) with slivers up to 3515:1 because `sweepQuad` uses a position-based two-pointer advance that creates thin triangles when chain vertices lie near grid column boundaries, and the fan diagonal strategy in `constrainedSweepCell` creates extreme-aspect sub-quads.

---

## Problem A: Chain Birth/Death at Feature Transition Zones

### Root Cause Analysis

#### What happens mathematically

The SuperformulaBlossom interpolates `m` from `m_base=6` at bottom (row 0) to `m_top=10` at top (row ~264). The superformula `r(θ) = |cos(m·θ/4)|^n2 + |sin(m·θ/4)|^n3` has:
- **m=6**: 3 peaks + 3 valleys per revolution (same-kind spacing = 1/3 ≈ 0.333 U)
- **m=10**: 5 peaks + 5 valleys per revolution (same-kind spacing = 1/5 = 0.200 U)

During transition, 2 new peaks and 2 new valleys must be BORN. These emerge as:
1. A flat shoulder develops on the radius profile (new peak amplitude ≈ 0)
2. The shoulder grows into a detectable feature (prominence crosses `minProminence`)
3. The new feature strengthens while the parent feature potentially shifts or weakens

#### Where the current code fails

**File**: [ChainLinker.ts](../src/renderers/webgpu/parametric/ChainLinker.ts), `linkFeatureChainsCore()` lines 719-1005.

The core linking loop has three failure modes at birth/death zones:

**Failure 1: Dying feature attracts nascent feature's chain**

At line 842:
```typescript
const searchRadius = ac.missCount > 0 ? MOMENTUM_LINK_RADIUS : linkRadius;
```

When a dying feature fades below prominence threshold, it stops appearing in `rowFeats`. The chain accumulates `missCount`. With `MAX_MISS_COUNT=6` and `MOMENTUM_LINK_RADIUS = linkRadius * 1.5 = 0.03 U`, a dying chain can reach out ±0.03 U — more than enough to grab a newly-born feature at a nearby position. The momentum prediction (`predictedU`) was computed from the dying feature's trajectory, but the newly-born feature is at a fundamentally different U position.

**Failure 2: Non-crossing DP matcher can't represent bifurcation**

At lines 808-910, the non-crossing DP matching between K active chains and M row features enforces a strict monotonic ordering. When a single parent peak splits into two child peaks (feature birth), the DP must assign one child to the parent's chain and leave the other as an unmatched feature (starting a new chain). But which child IS the parent? The DP uses cost scoring (lines 848-881), which considers:
- `rawDist`: circular distance from feature to chain's last position
- `predDist`: distance from feature to momentum-predicted position  
- `accel`: implied velocity change

At the bifurcation point, BOTH children are equidistant from the parent. The DP picks one based on numerical noise — no physically meaningful criterion for which child inherits the parent identity.

**Failure 3: No prominence/amplitude tracking in chain state**

The `ActiveChain` interface (line 726) stores:
```typescript
interface ActiveChain {
    chain: FeatureChain;
    missCount: number;
    predictedU: number;
}
```

There is NO tracking of the feature's amplitude, prominence, or radius. The linker is blind to whether a feature is growing, stable, or dying. A chain tracking a fading feature has the same priority as one tracking a strong feature.

#### Impact quantified from D1 diagnostic

| Chain | Rows | avgUErr | Status |
|-------|------|---------|--------|
| 0 | 46 | 0.001626 | **SATURATED** — tracking wrong feature |
| 1 | 119 | 0.000497 | Drifting — likely jumped at birth zone |
| 2 | 83 | 0.000290 | Moderate — partial birth/death confusion |
| 3 | 75 | 0.000420 | Moderate — partial birth/death confusion |
| 4-16 | ~264 each | 0.000006-0.000043 | **PERFECT** — stable features |

Chains 0-3 have 46-119 rows (17-45% of full pot height), consistent with covering only the transition zone where birth/death occurs.

---

### Proposals

#### Proposal 1: Prominence-Gated Chain Extension (Conservative)

**Idea**: Track per-chain feature prominence history. When extending a chain, require the candidate feature's prominence to be consistent with the chain's recent history. Dying features (prominence → 0) can't jump to strong new features.

**Mechanism**:

1. **Extend `ActiveChain` with prominence tracking**:
```typescript
interface ActiveChain {
    chain: FeatureChain;
    missCount: number;
    predictedU: number;
    // NEW:
    recentProminence: number[];    // Rolling window of last N prominences
    medianProminence: number;      // Running median prominence
    prominenceDecaying: boolean;   // True if prominence trend is negative
}
```

2. **During DP cost scoring** (line 848+), add a prominence consistency penalty:
```
// Current typed features include prominence data
// Lookup candidate feature's prominence from allRowTypedFeatures[j]
score += PROMINENCE_MISMATCH_PENALTY * |log(candidateProminence / chainMedianProminence)|
```

When `prominenceDecaying` is true AND `candidateProminence > 2 × chainMedianProminence`, the candidate is clearly a different (stronger) feature — apply heavy penalty or reject.

3. **After extending a chain**, update prominence tracking:
```
ac.recentProminence.push(featureProminence);
if (recentProminence.length > PROMINENCE_WINDOW) shift();
recalculate medianProminence and prominenceDecaying
```

**Mathematical basis**: Feature birth/death is fundamentally a prominence event. A dying feature's prominence decreases monotonically toward zero. A nascent feature's prominence increases from zero. The prominence trajectories are anti-correlated. Tracking prominence history distinguishes "this is my feature fading" from "this is a different feature growing."

**Files affected**:
- [ChainLinker.ts](../src/renderers/webgpu/parametric/ChainLinker.ts): `linkFeatureChainsCore()` — add prominence to ActiveChain, modify cost scoring
- Requires `allRowTypedFeatures` to be passed through to the linker (currently only `allRowFeatures: number[][]` is passed, losing prominence data)

**Trade-offs**:
- (+) Surgical: only adds prominence lookup to cost function
- (+) Uses data already computed by `detectRowFeaturesV16`
- (-) Requires plumbing `FeaturePoint[][]` through `linkFeatureChains` → `linkFeatureChainsCore`
- (-) Prominence threshold tuning needed (what's "too different"?)

**Assumptions** (for Verifier to attack):
1. Feature prominence changes monotonically during birth/death (is this true for all styles?)
2. The `FeaturePoint.prominence` field uses absolute radius-space prominence (mm), which is comparable across rows at different heights
3. Passing `allRowTypedFeatures` to the linker doesn't break the kind-separated linking in `linkFeatureChainsByKind`

#### Proposal 2: Expected Feature Count Tracking (Moderate)

**Idea**: For each row, compute the expected number of same-kind features based on the interpolated `m` value. When the detected count exceeds the expected count, new features are being born. When it drops below, features are dying. Use this to:
- Flag transition zones explicitly
- In transition zones, use tighter link radius to prevent cross-feature jumping
- Allow chains to die gracefully instead of searching wider with momentum

**Mechanism**:

1. **Pre-compute expected feature count per row**:
```typescript
function expectedFeatureCount(t: number, m_base: number, m_top: number): number {
    const m = m_base + (m_top - m_base) * t;  // simplified; actual interpolation may be non-linear
    return Math.round(m / 2);  // m/2 peaks, m/2 valleys for even m
}
```

2. **Classify rows into zones**: For each row band, compare `detectedCount` vs `expectedCount(t)`:
   - `|detected - expected| ≤ 1`: **Stable zone** — normal linking
   - `detected > expected + 1`: **Birth zone** — new features emerging
   - `detected < expected - 1`: **Death zone** — features merging/dying

3. **In birth/death zones, modify linking parameters**:
   - Reduce `linkRadius` to `CHAIN_LINK_RADIUS * 0.5` (prevent far reaches)
   - Set `MAX_MISS_COUNT = 1` (let dying chains die quickly)
   - Disable momentum prediction (don't extrapolate through transitions)

4. **Mark chains born in transition zones** with a `birthZone: boolean` flag for downstream quality gating.

**Mathematical basis**: The superformula's feature count is a deterministic function of `m`. The interpolated `m` at each T row is known from the style parameters. This gives ground-truth expectations that can gate the linker's behavior.

**Files affected**:
- [ChainLinker.ts](../src/renderers/webgpu/parametric/ChainLinker.ts): `linkFeatureChainsCore()` — add zone classification, conditional parameters
- Caller must provide `m_base` and `m_top` (or a function mapping T → expected count)
- Style registry must expose the `m` interpolation parameters

**Trade-offs**:
- (+) Uses mathematical ground truth, not heuristics
- (+) General: works for any style that can report expected feature count
- (-) Not all styles have a simple `m(t)` interpolation — some have product formulas, wave interference, etc.
- (-) The exact row where birth occurs depends on prominence threshold, not just `m` — there's a lag between the mathematical change and detectable emergence
- (-) Requires plumbing style-specific parameters into the chain linker

**Assumptions** (for Verifier to attack):
1. `m(t)` is available or computable for all styles that create birth/death transitions
2. The detection prominence threshold creates a predictable lag between `m` change and feature appearance (is this ≤3 rows or could it be ≥10 rows?)
3. Reducing link radius in transition zones won't break chains that legitimately drift during transitions
4. Product styles (HarmonicRipples) don't violate the simple `m/2` feature count rule

#### Proposal 3: Post-Linking Per-Vertex Validation (Moderate-Radical)

**Idea**: After chain linking is complete, validate each chain vertex against the original per-row probe data. For each vertex, independently re-detect the nearest same-kind extremum in the original radius profile and compare to the chain's assigned U. If the chain's U is tracking a different feature than the nearest one, flag or repair the vertex.

**Mechanism**:

1. **For each chain vertex `(row, u, kind)`**:
   a. Look up `allRowTypedFeatures[row]` for same-kind features
   b. Find the nearest same-kind feature to `u`
   c. Compute the distance `d = circularDistance(u, nearestSameKind.u)`
   d. If `d > VALIDATION_THRESHOLD` (e.g., 0.003 U ~ half the typical inter-feature spacing for m=10):
      - The chain vertex is likely tracking the wrong feature
      - Record: `{ chainId, pointIdx, assignedU: u, nearestCorrectU: nearestSameKind.u, distance: d }`

2. **Identify contiguous segments of "wrong" vertices** within each chain. If a segment:
   - Is longer than `MIN_WRONG_SEGMENT = 3` rows
   - Has consistent re-assignment direction (all shifted toward the same new feature)
   → This is a chain that jumped to a different feature. **Split the chain** at the transition point.

3. **For isolated wrong vertices** (< 3 consecutive):
   → These are zigzag artifacts in the transition zone. **Repair** by reassigning to the nearest same-kind feature (same as `repairChainsZigzags` but with an external ground-truth comparison rather than internal second-derivative).

4. **For chain segments in death zones** (where the chain's original feature has disappeared):
   → The chain should END here. The "nearest same-kind feature" is a different feature entirely. **Truncate the chain** at the last row where its original feature still exists.

**Implementation detail — "original feature identification"**:

To know which feature a chain is "supposed" to track, use the chain's stable region (the middle 60% of the chain, where avgUErr is low). Compute the mean U position and mean prominence in this region. This is the chain's "identity." In the birth/death zones (first/last 20% of chain), compare each vertex's assigned feature against the identity. If the feature's U deviates from the chain's identity trajectory (linear extrapolation from stable region) by more than `2 × maxStableError`, it's tracking a wrong feature.

**Mathematical basis**: The stable core of each chain correctly identifies which mathematical feature the chain represents. Vertices outside the stable core can be validated against this identity. Birth/death zones are exactly where the chain's identity starts to diverge from the actual feature assignment.

**Files affected**:
- [ChainLinker.ts](../src/renderers/webgpu/parametric/ChainLinker.ts): New function `validateAndRepairChains()`, called after `linkFeatureChainsByKind` and before `filterLowConfidenceChains`
- Requires both `allRowFeatures` and `allRowTypedFeatures` as input

**Trade-offs**:
- (+) Works for ANY style — no style-specific parameters needed
- (+) Can split chains at exact transition row (not approximate)
- (+) Uses the chain's own stable core as ground truth — self-calibrating
- (+) Can be added as a post-processing step without modifying the core linker
- (-) Requires a "stable core" definition that works for short chains
- (-) For chains entirely in the transition zone (no stable core), this approach can't validate
- (-) Splitting chains produces shorter chains that may fail `MIN_CHAIN_LENGTH` filter

**Assumptions** (for Verifier to attack):
1. Every chain has a "stable core" (middle 60%) with consistent feature tracking — what about chains that are entirely in the transition zone?
2. Linear extrapolation from the stable core accurately predicts where the feature should be at birth/death boundaries
3. Splitting a chain produces sub-chains long enough to be useful (≥ `MIN_CHAIN_LENGTH = 10`)
4. The nearest same-kind feature in the probe data is always the "correct" one for chains that stay in their stable zone (could there be probe-level errors that confuse this?)

#### Proposal 4: Amplitude Decay Detection + Graceful Chain Termination (Radical)

**Idea**: Treat chain tracking as a Bayesian estimation problem. Each chain has a "belief" about its feature's amplitude and position. When the belief score drops below a threshold, terminate the chain instead of letting it wander.

**Mechanism**:

1. **Extend `ChainPoint` with feature metadata**:
```typescript
interface ChainPointExtended extends ChainPoint {
    prominence: number;     // From FeaturePoint
    confidence: number;     // From FeaturePoint
    radius: number;         // From FeaturePoint
}
```

2. **At each row**, when the DP matcher assigns feature `f` to chain `c`:
   a. Compute a **matching quality score**:
   ```
   Q = w_pos × (1 - rawDist/maxDist) 
     + w_prom × prominenceSimilarity(chain, feature)
     + w_conf × feature.confidence
   ```
   b. Maintain a rolling `qualityScore` for each chain (exponential moving average)
   c. If `qualityScore < DEATH_THRESHOLD` for 2+ consecutive rows → **terminate chain**

3. **When a chain terminates**, all unmatched features in that row become candidates for new chains. This ensures the nascent feature (which was being pulled by the dying chain) gets its own chain starting cleanly.

4. **DEATH_THRESHOLD tuning**: Analyze the quality score distribution of stable chains (4-16) to find the natural baseline, then set threshold at 2σ below.

**Mathematical basis**: Feature birth/death manifests as a measurable quality degradation in the matching: prominence drops, confidence drops, cost score increases. By tracking this degradation, the linker can preemptively terminate dying chains before they corrupt nascent features.

**Files affected**:
- [ChainLinker.ts](../src/renderers/webgpu/parametric/ChainLinker.ts): `linkFeatureChainsCore()` — major rework of ActiveChain state, cost computation, and termination logic
- [types.ts](../src/renderers/webgpu/parametric/types.ts): Extended `ChainPoint` interface

**Trade-offs**:
- (+) Most robust solution — handles arbitrary feature topology changes
- (+) Self-calibrating through rolling quality score
- (-) Largest code change — touches the core linking loop extensively
- (-) Quality score weighting needs empirical tuning
- (-) Risk of premature chain termination for features that are just temporarily weak

**Assumptions** (for Verifier to attack):
1. Feature prominence/confidence are available at matching time (requires plumbing `FeaturePoint` into the linker)
2. The quality score transition from "alive" to "dying" is sharp enough that a threshold reliably separates them
3. Premature termination of a healthy chain (false positive death detection) is recoverable via the secondary linking pass

---

### Recommended Approach for Problem A

**Phase 1**: Implement **Proposal 1 (Prominence-Gated Extension)** + **Proposal 3 (Post-Linking Validation)**

Rationale:
- Proposal 1 is the smallest change to prevent the most egregious errors (dying chain grabbing strong new feature). It requires plumbing `FeaturePoint[][]` into the linker, which is needed by any solution.
- Proposal 3 runs AFTER linking and catches anything Proposal 1 missed. It can split/truncate chains at exact transition rows. It's a safety net that doesn't require modifying the core DP matcher.
- Together they handle both the "don't let dying chains jump" (Proposal 1) and "fix chains that already jumped" (Proposal 3) aspects.

**Phase 2** (if Phase 1 insufficient): Add **Proposal 2 (Expected Feature Count)** for styles where `m(t)` is known. This provides the strongest prevention but requires style-specific parameter access.

**Defer**: Proposal 4 is the most thorough but also the riskiest (modifying the core loop extensively). Only pursue if Proposals 1+3 prove inadequate.

---

## Problem B: Mesh Topology Quality

### Root Cause Analysis

#### Root Cause B1: sweepQuad position-based advance creates slivers

**File**: [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts), `sweepQuad()` lines 213-259.

The two-pointer sweep advances whichever side (bot or top) has the nearer next vertex by U position:

```typescript
if (botNextU < topNextU - SWEEP_EPS) {
    emitTriCCW(buf, bot[bi], bot[bi + 1], top[ti], verts);
    bi++;
} else if (topNextU < botNextU - SWEEP_EPS) {
    emitTriCCW(buf, top[ti], top[ti + 1], bot[bi], verts);
    ti++;
} else {
    // Tie-break: use min-angle criterion
    ...
}
```

The tie-break zone (`SWEEP_EPS = 1e-8`) is far too tight. Consider a chain vertex at U=0.1501 and a grid column at U=0.1500. The difference is 0.0001 U — far above 1e-8 — so the sweep treats them as clearly separated. This creates two triangles: one an extreme sliver between U=0.1500 and U=0.1501, and one nearly the full cell width.

**The min-angle criterion at line 241-256 should be the DEFAULT diagonal choice** for all quad cells, not just when vertices are within 1e-8 of each other. The position-based advance is a valid optimization only when the two candidates are far apart (and quality doesn't matter).

#### Root Cause B2: chainFanQuad creates extreme-aspect sub-quads

**File**: [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts), `constrainedSweepCell()` lines 345-362, 376-388.

When a chain edge partitions a cell into sub-quads, the R41 `chainFanQuad` path handles 2×2 sub-quads:

```typescript
if (subBot.length === 2 && subTop.length === 2 && !prevIsChainEdge) {
    // Fan from chain edge
    emitTriCCW(buf, subBot[0], subBot[1], subTop[0], verts);
    emitTriCCW(buf, subTop[0], subBot[1], subTop[1], verts);
    fanDiagEdges.push([subBot[1], subTop[0]]);
}
```

This creates a DETERMINISTIC diagonal (chain_bot → grid_top) regardless of the sub-quad's geometry. When the chain vertex is very close to the grid column (e.g., 0.0001 U separation), both triangles have one edge that is 0.0001 U wide and another that spans the full cell width (perhaps 0.005 U) — a 50:1 aspect ratio.

The chain vertex merge threshold (`MERGE_THRESHOLD = 1e-4` at line 864) is supposed to catch this, but chain vertices at 1.1×MERGE_THRESHOLD to 10×MERGE_THRESHOLD still produce extreme slivers without being merged.

#### Root Cause B3: No post-emission quality pass

The tessellator emits triangles in a single sweep with no opportunity to improve quality afterward. Poor diagonal choices become permanent. The `ChainStripOptimizer` operates on the mesh AFTER OWT, but it's constrained by `constraintEdgeSet` and `chainAdjacentVertices` from modifying the most problematic triangles.

#### Root Cause B4: Grid columns don't account for chain vertex positions

**File**: [GridBuilder.ts](../src/renderers/webgpu/parametric/GridBuilder.ts), `mergeFeaturePositions()` lines 80-135.

The feature-position injection adds columns at chain positions with FLANK_OFFSET companions:
```typescript
const flankDist = avgSpacing * FLANK_OFFSET;  // 0.3 × avg spacing
```

But this happens at GRID CONSTRUCTION time, before chain linking. The features injected here come from the curvature profile, not from the actual chain vertex positions. After linking, chain vertices may be at slightly different positions than the curvature-detected features. The gap between the final chain vertex U and the nearest grid column determines the sliver severity.

#### Alternating vertex distance pattern (0.42mm / 0.16mm)

This pattern comes from the grid construction: the CDF-adaptive grid places columns at curvature-weighted positions, and feature injection adds 3 positions per feature (feature + 2 flanks). The flanking companions at `±0.3 × avgSpacing` create the alternating near/far pattern:
```
[grid] ... [leftFlank] === 0.3×spacing === [feature] === 0.3×spacing === [rightFlank] ... [grid]
```
The feature-to-flank gaps (0.16mm ≈ 0.3×spacing) alternate with flank-to-grid gaps (0.42mm ≈ 0.7×spacing).

---

### Proposals

#### Proposal B1: Widen sweepQuad Quality Zone (Conservative)

**Idea**: Replace the `SWEEP_EPS = 1e-8` tie-break threshold with a much larger quality zone. Within this zone, always use the min-angle criterion for diagonal choice.

**Mechanism**:

Replace lines 230-258 with:
```typescript
// Quality-aware diagonal choice: ALWAYS use min-angle when vertices are close
const uRange = Math.abs(botNextU - topNextU);
const QUALITY_ZONE = avgColumnSpacing * 0.5;  // Half the average column spacing

if (uRange < QUALITY_ZONE) {
    // Both advances are viable — pick diagonal with better min angle
    const minA = minAngle2D(...);  // bot advance
    const minB = minAngle2D(...);  // top advance
    if (minA >= minB) { ... bi++; } else { ... ti++; }
} else if (botNextU < topNextU) {
    ... bi++;
} else {
    ... ti++;
}
```

The `avgColumnSpacing` can be passed as a parameter or computed as `1.0 / numU`.

**Files affected**: [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts), `sweepQuad()`

**Trade-offs**:
- (+) Simple, surgical change
- (+) Provably improves minimum angle in tie-break situations
- (-) min-angle computation adds ~50 trig operations per quad (minor perf impact)
- (-) Doesn't fix the fundamental problem of chain vertices creating slivers

**Assumptions**:
1. The 2D UV-space min-angle criterion correctly predicts 3D mesh quality (circumferential stretch means UV angles ≠ 3D angles — is this close enough?)
2. Performance impact of per-quad min-angle computation is acceptable

#### Proposal B2: Adaptive Merge Threshold for Near-Grid Chain Vertices (Conservative)

**Idea**: Increase `MERGE_THRESHOLD` or add a secondary "soft merge" zone where chain vertices very close to grid columns are pulled onto the grid column.

**Mechanism**:

1. **Increase `MERGE_THRESHOLD` from 1e-4 to match grid-visible sliver threshold**:
```typescript
const ASPECT_SAFE_MERGE = avgColumnSpacing * 0.05;  // 5% of column spacing
const MERGE_THRESHOLD = Math.max(1e-4, ASPECT_SAFE_MERGE);
```

At 200 columns, avgSpacing = 0.005, so ASPECT_SAFE_MERGE = 0.00025 U ≈ 0.075mm. This catches chain vertices within 0.075mm of a grid column and merges them, preventing all slivers narrower than this.

2. **For merged vertices**, the chain vertex U is snapped to the grid column U. Record the original U for potential re-snap in downstream GPU evaluation.

3. **Guard against over-merging**: Only merge if the chain vertex is closer to this grid column than to ANY other chain vertex on the same row (prevents collapsing two chain vertices onto the same grid column).

**Files affected**: [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts), `batch2Remap` construction (lines 850-870)

**Trade-offs**:
- (+) Eliminates extreme slivers at their source
- (+) Small code change
- (-) Moves chain vertex off its precise position (slight ridge accuracy loss)
- (-) The "right" threshold depends on grid density, which varies per style

**Assumptions**:
1. Moving a chain vertex by up to 0.00025 U (≈0.075mm) doesn't visibly degrade ridge fidelity
2. The downstream GPU re-snap (Phase 2) can recover the position for interpolated vertices, but primary vertices would stay at the snapped position

#### Proposal B3: Column Insertion at Chain Vertex U Positions (Moderate)

**Idea**: After chain linking, inject grid columns at the actual chain vertex U positions (not just the curvature feature positions). This ensures every chain vertex falls exactly on a grid column, eliminating the chain-to-grid gap that causes slivers.

**Mechanism**:

1. **After `linkFeatureChainsByKind`**, collect all unique chain vertex U positions:
```typescript
const chainUs = new Set<number>();
for (const chain of meshChains) {
    for (const pt of chain.points) {
        chainUs.add(pt.u);
    }
}
```

2. **Re-generate** `unionU` by merging chain vertex Us into the existing CDF-adaptive grid:
```typescript
unionU = mergeFeaturePositions(cdfGrid, [...chainUs], /*isPeriodic=*/true).positions;
```

3. This makes every chain vertex coincide with a grid column. The `batch2Remap` merge (1e-4 threshold) will catch them all, making chain vertices grid-resident. No slivers.

4. **Column budget guard**: If adding all chain vertex U positions would exceed the column budget, use only unique U positions (across all chains) that are more than `MIN_U_SEPARATION` from existing grid columns.

**Mathematical basis**: The fundamental cause of slivers is the gap between chain vertex U and grid column U. Making them identical eliminates the gap. The CDF-adaptive grid already supports feature injection via `mergeFeaturePositions` — this just uses post-linking positions instead of pre-linking curvature positions.

**Files affected**:
- Pipeline orchestrator (ParametricExportComputer.ts): Move grid generation AFTER chain linking, or add a grid-refinement step after linking
- [GridBuilder.ts](../src/renderers/webgpu/parametric/GridBuilder.ts): `mergeFeaturePositions()` — no change needed, it already handles this

**Trade-offs**:
- (+) Root-cause elimination: no gap → no slivers
- (+) Uses existing infrastructure (`mergeFeaturePositions`)
- (+) Every chain vertex becomes a grid vertex — simplifies downstream processing
- (-) Adds columns (increases triangle count). For 17 chains × 30 unique Us ≈ 510 extra columns max (but many overlap with existing grid)
- (-) Requires reordering the pipeline: grid generation currently happens in Step 2 before chain linking in Step 3. Either move grid generation later or add a refinement pass.
- (-) Changes the grid topology, which affects every downstream step

**Assumptions**:
1. The pipeline can be reordered so grid generation happens after chain linking (or a refinement pass is feasible)
2. Adding ~100-500 extra columns is within the column budget
3. Feature-injection companions (FLANK_OFFSET) should also be added at chain vertex positions for surrounding curvature resolution

#### Proposal B4: Quality-Aware Fan Diagonal in constrainedSweepCell (Conservative)

**Idea**: Replace the deterministic `chainFanQuad` diagonal choice with a quality-aware choice using the min-angle criterion, similar to the tie-break in `sweepQuad`.

**Mechanism**:

Replace lines 345-362 (left-chain fan) and 376-388 (right-chain fan):
```typescript
// BEFORE: deterministic fan
emitTriCCW(buf, subBot[0], subBot[1], subTop[0], verts);
emitTriCCW(buf, subTop[0], subBot[1], subTop[1], verts);

// AFTER: quality-aware diagonal choice
const minAngleA = minAngle2D(
    verts[subBot[0]*3], verts[subBot[0]*3+1],
    verts[subBot[1]*3], verts[subBot[1]*3+1],
    verts[subTop[0]*3], verts[subTop[0]*3+1]);
const minAngleB = minAngle2D(
    verts[subTop[0]*3], verts[subTop[0]*3+1],
    verts[subBot[1]*3], verts[subBot[1]*3+1],
    verts[subTop[1]*3], verts[subTop[1]*3+1]);

// Diagonal A: subBot[1] → subTop[0] (original fan)
const diagMinA = Math.min(minAngleA, minAngleB);

// Diagonal B: subBot[0] → subTop[1] (alternative)
const minAngleC = minAngle2D(
    verts[subBot[0]*3], verts[subBot[0]*3+1],
    verts[subBot[1]*3], verts[subBot[1]*3+1],
    verts[subTop[1]*3], verts[subTop[1]*3+1]);
const minAngleD = minAngle2D(
    verts[subBot[0]*3], verts[subBot[0]*3+1],
    verts[subTop[0]*3], verts[subTop[0]*3+1],
    verts[subTop[1]*3], verts[subTop[1]*3+1]);
const diagMinB = Math.min(minAngleC, minAngleD);

if (diagMinA >= diagMinB) {
    emitTriCCW(buf, subBot[0], subBot[1], subTop[0], verts);
    emitTriCCW(buf, subTop[0], subBot[1], subTop[1], verts);
    fanDiagEdges.push([subBot[1], subTop[0]]);
} else {
    emitTriCCW(buf, subBot[0], subBot[1], subTop[1], verts);
    emitTriCCW(buf, subBot[0], subTop[1], subTop[0], verts);
    fanDiagEdges.push([subBot[0], subTop[1]]);
}
```

**Files affected**: [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts), `constrainedSweepCell()`

**Trade-offs**:
- (+) Direct fix for the fan diagonal sliver issue  
- (+) Respects the min-angle quality criterion already used in sweepQuad tie-break
- (+) No architectural changes
- (-) Fan diagonals are recorded in `fanDiagEdges` for constraint protection. The CSO depends on knowing which diagonal was chosen. Need to ensure the alternative diagonal is also protected.
- (-) 2D UV min-angle may disagree with 3D quality at high circumferential stretch

**Assumptions**:
1. The CSO's `constraintEdgeSet` correctly protects whichever fan diagonal is chosen (not just the original deterministic one)
2. R46 constraint protection logic doesn't assume a specific diagonal orientation

#### Proposal B5: Post-Tessellation Diagonal Flip Pass (Moderate)

**Idea**: After `buildCDTOuterWall` emits all triangles, perform a local quality improvement pass that flips diagonals of poor-quality triangle pairs (quadrilateral flip).

**Mechanism**:

1. **Build adjacency**: From the index buffer, build a half-edge or face-adjacency structure
2. **For each internal edge** (shared by two triangles), compute the min-angle of both triangles. Then compute the min-angle of the two triangles formed by flipping the diagonal. If the flipped configuration has a HIGHER minimum angle, flip.
3. **Constraint guard**: Don't flip edges in `constraintEdgeSet` or `fanDiagEdges` or `chainEdges`
4. **Iterate** until no more beneficial flips (typically converges in 2-3 passes)

This is essentially a 2D Delaunay-like local optimization on the UV mesh.

**Files affected**: New function in [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts) or a separate module, called after `buildCDTOuterWall`

**Trade-offs**:
- (+) Post-hoc quality improvement without changing tessellation logic
- (+) Guaranteed to improve min-angle (each flip improves; convergence is monotone)
- (-) Needs adjacency structure (memory + construction cost)
- (-) The existing CSO already does something similar but with different constraints and 3D quality awareness. Risk of conflict or redundant work.
- (-) Doesn't fix the root cause — just patches the symptoms

**Assumptions**:
1. The CSO doesn't already handle this adequately (is it being blocked from flipping the worst edges?)
2. Building face adjacency for ~1M triangles is fast enough (should be ~100ms)
3. The constraint sets correctly prevent flipping edges that must be preserved

---

### Recommended Approach for Problem B

**Phase 1**: Implement **Proposal B1 (Wider Quality Zone in sweepQuad)** + **Proposal B4 (Quality-Aware Fan Diagonal)**

These are the two most surgical changes that directly address the worst slivers:
- B1 fixes the standard quad diagonal choice, reducing aspect-ratio violations in plain grid cells
- B4 fixes the chain-adjacent fan diagonal choice, addressing the 38.6% sliver rate in chain-strip triangles

Both use the `minAngle2D` function already available in the file. Total code change: ~40 lines.

**Phase 2**: Implement **Proposal B2 (Adaptive Merge Threshold)** to catch residual near-grid slivers that B1/B4 don't eliminate.

**Phase 3** (if needed): Implement **Proposal B3 (Column Insertion at Chain Vertex U)** for root-cause elimination. This is the most impactful but requires pipeline reordering.

**Defer**: Proposal B5 (post-tessellation flip) is redundant with the CSO and risks conflicts.

---

## Risk Assessment

### Problem A Changes

| Risk | Severity | Mitigation |
|------|----------|------------|
| Plumbing `FeaturePoint[][]` through linker breaks kind separation | Medium | `linkFeatureChainsByKind` already splits by kind before calling `linkFeatureChainsCore` — prominence data follows the same split |
| Proposal 1 prominence penalty is too aggressive, killing short chains | Medium | Only penalize when `prominenceDecaying && candidateProminence > 2×median`; don't penalize strengthening chains |
| Proposal 3 validation falsely identifies correct chains as wrong | Low | Only split chains where ≥3 consecutive vertices fail validation; isolated failures are likely noise |
| Stable chains 4-16 are affected by prominence gating | **Critical** | Guard: chains with ≥200 rows and roughness <0.001 bypass prominence gating entirely |

### Problem B Changes

| Risk | Severity | Mitigation |
|------|----------|------------|
| B1 wider quality zone makes sweep order non-deterministic | Low | Non-determinism is limited to quality-equivalent choices; min-angle picks the better one |
| B4 alternative diagonal breaks CSO constraint protection | Medium | Update `fanDiagEdges` to record whichever diagonal is actually chosen; verify CSO reads from this array |
| B2 over-merging collapses distinct chain vertices | Medium | Guard: only merge if chain vertex is closer to grid column than to any other chain vertex |
| B3 pipeline reordering breaks grid-dependent steps | High | Only attempt in Phase 3 after B1+B4+B2 prove insufficient; requires careful integration testing |

---

## Implementation Order

```
Phase 1A: Plumb FeaturePoint[][] into chain linker  
   └→ Modify linkFeatureChainsCore signature, linkFeatureChains, linkFeatureChainsByKind
   └→ No behavior change — just data threading
   
Phase 1B: Prominence-gated chain extension (Proposal 1)
   └→ Depends on 1A
   └→ Add prominence tracking to ActiveChain
   └→ Add prominence mismatch penalty to DP cost function

Phase 1C: Post-linking chain validation (Proposal 3)
   └→ Independent of 1B
   └→ New function validateAndRepairChains()
   └→ Called after linkFeatureChainsByKind, before filterLowConfidenceChains

Phase 1D: sweepQuad quality zone (Proposal B1)
   └→ Independent of all above
   └→ Modify sweepQuad() tie-break threshold

Phase 1E: Quality-aware fan diagonal (Proposal B4)
   └→ Independent of all above
   └→ Modify constrainedSweepCell() fan emission

Phase 2A: Adaptive merge threshold (Proposal B2)
   └→ After Phase 1D/1E results are evaluated
   └→ Modify MERGE_THRESHOLD computation

Phase 2B: Expected feature count (Proposal 2)
   └→ After Phase 1B/1C results are evaluated
   └→ Requires style parameter access — larger plumbing change
```

Phases 1D and 1E (mesh topology) are independent of Phases 1A-1C (chain tracking) and can be implemented in parallel.

---

## Validation Protocol

### Problem A Validation

1. **D1 diagnostic comparison**: Run export with SuperformulaBlossom, capture per-chain avgUErr/maxUErr. Expected:
   - Chains 0-3 (birth/death zone): avgUErr drops from 0.000290-0.001626 to <0.000100
   - Chains 4-16 (stable): avgUErr unchanged (≤0.000043)
   - No new chains with avgUErr > 0.000100

2. **Chain count stability**: Same number of final chains after filtering (±2 is acceptable due to birth/death splitting)

3. **Visual regression**: Export STL, inspect in slicer at transition zone. No visible ridge discontinuities at feature birth/death rows.

4. **Cross-style validation**: Run on 3+ styles with different m-transitions (if any) to ensure generality.

### Problem B Validation

1. **Aspect ratio distribution**: Compute aspect ratio of all triangles. Expected:
   - Violations >4:1: drop from 39% to <15%
   - Max aspect ratio: drop from 3515:1 to <100:1
   - No new degenerate triangles

2. **Min-angle distribution**: Compute minimum interior angle of all triangles. Expected:
   - Triangles with min-angle <5°: drop from current rate to <5%
   - Median min-angle: increase

3. **Chain edge enforcement**: All chain edges remain enforced as mesh edges (0 missing chain edges)

4. **Vertex distance pattern**: For stable chains, vertex distance alternation (0.42/0.16mm) should become more uniform or the extreme ratios should decrease.

5. **Watertightness**: STL export produces manifold mesh with 0 boundary edges (existing test coverage).

---

## Open Questions

1. **Cross-style generality of birth/death**: Is SuperformulaBlossom the ONLY style with m-transition birth/death? What about WaveInterference, HarmonicRipples, or other product styles? Does the linker encounter birth/death in these styles too?

2. **R48 diagnostic validity at birth/death zones**: The R48 diagnostic finds the nearest same-kind extremum and measures distance. At birth/death zones, the nearest extremum may be a NEWLY BORN feature that the chain shouldn't be tracking. Should the R48 diagnostic be modified to only search for features matching the chain's identity?

3. **ChainStripOptimizer interaction with B4**: The CSO currently knows about `fanDiagEdges` from R46. If B4 changes which diagonal is chosen, does the CSO's `isChainGridEdge` check (which gates CSO flips of chain↔grid edges) need updating? The CSO should read `fanDiagEdges` from OWT output, which B4 updates — is this the actual code path?

4. **Performance budget for min-angle computation**: The `minAngle2D` function uses `Math.acos` (expensive). For ~500K quad cells with B1's wider quality zone, this adds ~1M acos calls. Is this within the perf budget, or should we use a cos-comparison approximation (compare `cos(angle)` instead of `angle` to avoid acos)?

5. **2D vs 3D angle quality**: All min-angle computations use 2D UV coordinates. At high circumferential stretch (e.g., belly of a pot), the U-direction is stretched by R(t)/Rmin. A triangle that looks isosceles in UV may be extremely elongated in 3D. Should the quality criterion use stretch-corrected coordinates? The `estimateCircumferentialStretch` function is already available in OWT.
