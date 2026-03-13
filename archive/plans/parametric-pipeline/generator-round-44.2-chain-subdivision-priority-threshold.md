# Generator Round 44.2 — Fix Chain Edge Subdivision Priority and Threshold

Date: 2026-03-08

## Problem Statement

R44 unblocked chain edges from subdivision but achieved only 42 splits out of 6614 chain edges. Two root causes:

1. **Threshold mismatch**: `avgGridEdge` (0.772mm) is computed from horizontal grid edges. Chain edges are primarily vertical (~0.424mm). The feature threshold `0.75 × 0.772 = 0.579mm` exceeds most chain edge lengths → 5930 of 6614 filtered out.
2. **Priority starvation**: Edges sorted by length descending. Chain edges at ~0.424mm sort to the END behind interior (≤1.389mm), boundary (≤0.926mm), and cross-edges (≤0.579mm). By the time chain candidates are reached, `modifiedTris` blocks 322 of 684 candidates, `touchesProtectedPatch` blocks 320 more. Only 42 survive.

**Net effect**: Chain edges — the most important edges for ridge resolution — are the LAST to be processed and the FIRST to be blocked.

## Root Cause Analysis

### Threshold geometry

The `avgGridEdge` sampling at [MeshSubdivision.ts](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L291-L310) loops over horizontal edges only:

```typescript
const v0 = j * outerW + i;
const v1 = j * outerW + i + 1;  // same row, adjacent column → horizontal
```

For a pot with circumference ~150mm and ~685 columns: horizontal spacing ≈ 0.219mm per column, but the 3D edge length includes vertical extent from the pot's curvature, yielding `avgGridEdge ≈ 0.772mm`.

Chain edges connect the same chain vertex at row `j` to row `j+1`:
- Vertical component: `potHeight / (outerH - 1) ≈ 100mm / 263 ≈ 0.380mm`
- Horizontal component: WH-smoothed U oscillation ≈ `2π × R × 0.001 ≈ 0.19mm`
- 3D length: `√(0.380² + 0.19²) ≈ 0.424mm`

Feature threshold: `0.75 × 0.772 = 0.579mm`. Chain edges at 0.424mm are 27% below threshold.

### Priority ordering

At [line ~425](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L425):
```typescript
edgesToSplit.sort((a, b) => b.len2 - a.len2);
```

The sorted order puts chain edges dead last. The Phase A loop processes edges in this order, marking triangles in `modifiedTris`. By the time chain edges are reached, their adjacent triangles are already claimed by splits of longer edges.

### Phantom sub-edge pressure

The R37 phantom system splits ~1970 chain edges into ~3940 sub-edges (each ~0.39mm). These phantom sub-edges are even shorter and share triangles with each other, creating dense `modifiedTris` clusters that block adjacent chain-edge splits.

---

## Proposals

### Proposal 1: Chain-Edge-First Priority with Dedicated Threshold (RECOMMENDED)

**Idea**: Process chain edges in a separate priority pass BEFORE the general edge sort, using a threshold derived from vertical grid spacing instead of horizontal.

**Mechanism**: Split Phase A into two sub-phases:
- **Phase A1 (chain edges)**: Process only chain edges, using a chain-specific threshold computed from vertical grid spacing. These get first access to `modifiedTris` — no starvation.
- **Phase A2 (all other edges)**: Process remaining edges (interior, boundary, cross-edges) with existing thresholds and sort order. Chain-edge-modified tris are already in `modifiedTris`, so non-chain edges naturally deconflict.

**Mathematical basis**: The chain-specific threshold samples VERTICAL grid edges (same column, adjacent rows) to compute `avgVerticalEdge`. Chain edges are primarily vertical, so `avgVerticalEdge` is the geometrically correct reference. The CHAIN_SCALE factor (0.5 is proposed) then determines what fraction of chain edges qualify.

**Threshold computation** (new code, inserted after the existing horizontal sampling):
```typescript
// ── 1b. Compute average VERTICAL grid edge length ────────────
let vertEdgeLenSum = 0;
let vertEdgeCount = 0;
{
    const sampleCols = Math.min(50, outerW);
    for (let i = 0; i < sampleCols; i++) {
        for (let j = 0; j < outerH - 1 && j < 10; j++) {
            const v0 = j * outerW + i;
            const v1 = (j + 1) * outerW + i;  // ← VERTICAL edges
            const dx = resultData[v0 * 3] - resultData[v1 * 3];
            const dy = resultData[v0 * 3 + 1] - resultData[v1 * 3 + 1];
            const dz = resultData[v0 * 3 + 2] - resultData[v1 * 3 + 2];
            vertEdgeLenSum += Math.sqrt(dx * dx + dy * dy + dz * dz);
            vertEdgeCount++;
        }
    }
}
const avgVerticalEdge = vertEdgeCount > 0 ? vertEdgeLenSum / vertEdgeCount : avgGridEdge;
const CHAIN_SCALE = 0.50;
const chainSubdivThreshold2 = (avgVerticalEdge * CHAIN_SCALE) ** 2;
```

**Expected avgVerticalEdge**: For ~100mm height with 263 rows, vertical grid edge ≈ 0.380mm. But 3D includes radial extent from pot profile → `avgVerticalEdge ≈ 0.40–0.50mm`. With CHAIN_SCALE = 0.50: threshold = 0.20–0.25mm. Nearly ALL chain edges at ~0.424mm exceed this → 6000+ candidates.

**Phase A1 loop** (inserted before the existing Phase A sort-and-loop):
```typescript
// ── 5a. Phase A1: Chain edges first (priority pass) ──────────
const chainEdgesToSplit: SplitEdge[] = [];
const nonChainEdgesToSplit: SplitEdge[] = [];

for (const se of edgesToSplit) {
    if (constraintEdgeSet.has(se.ek)) {
        chainEdgesToSplit.push(se);
    } else {
        nonChainEdgesToSplit.push(se);
    }
}

// Chain edges sorted by length descending (longest chain edges first)
chainEdgesToSplit.sort((a, b) => b.len2 - a.len2);

// Budget cap: chain edge splits limited to 1× chain edge count
// (each chain edge → 2 new tris, so 6614 chain edges → max +13228 tris)
const chainSplitBudget = Math.min(chainEdgesToSplit.length, constraintEdgeSet.size);
let chainSplitsApplied = 0;

for (const se of chainEdgesToSplit) {
    if (splitsToApply.length >= maxSplits) break;
    if (chainSplitsApplied >= chainSplitBudget) break;

    if (modifiedTris.has(se.tris[0]) || modifiedTris.has(se.tris[1])) continue;

    // ... existing opp-vertex extraction ...
    // ... existing touchesProtectedPatch check ...

    splitsToApply.push({ se, opp0, opp1 });
    modifiedTris.add(se.tris[0]);
    modifiedTris.add(se.tris[1]);
    chainSplitsApplied++;
}

// ── 5b. Phase A2: Non-chain edges (existing behavior) ────────
nonChainEdgesToSplit.sort((a, b) => b.len2 - a.len2);
for (const se of nonChainEdgesToSplit) {
    if (splitsToApply.length >= maxSplits) break;
    if (modifiedTris.has(se.tris[0]) || modifiedTris.has(se.tris[1])) continue;
    // ... same logic as current Phase A ...
}
```

**Files affected**: `MeshSubdivision.ts` only

**Trade-offs**:
- (+) Fixes BOTH root causes in one change
- (+) No multi-pass subdivision; single pass with prioritized ordering
- (+) Triangle budget is bounded: ≤ constraintEdgeSet.size extra splits
- (+) Existing non-chain subdivision is untouched in behavior (just runs second)
- (+) Protected-vertex checks still apply — phantom corridor is respected
- (-) Chain edges that share a triangle with another chain edge still lose one of the pair to `modifiedTris`. For a typical chain with vertices at adjacent rows, consecutive chain edges share exactly one triangle. This means alternating chain edges will be split (every other one), not all of them. Expected: ~50% of 6614 = ~3300 splits (still 78× improvement over R44's 42).

**Assumptions** (for Verifier to attack):
1. `avgVerticalEdge` correctly represents the length scale of chain edges.
2. CHAIN_SCALE = 0.50 produces a threshold below most chain edges but above trivially short phantom sub-edges.
3. The alternating `modifiedTris` block pattern (consecutive chain edges share a triangle) limits splits to ~50% of chain edges, which is sufficient improvement.
4. The `chainSplitBudget` cap prevents runaway triangle growth.
5. Non-chain edges processed after chain edges will not suffer meaningful quality loss from the priority reordering.
6. Existing `touchesProtectedPatch` logic remains correct and sufficient for phantom corridor protection.

---

### Proposal 2: Chain Edge Threshold Fix Only (Conservative)

**Idea**: Keep unified sort order but fix the threshold by using `avgVerticalEdge` for chain edges.

**Mechanism**: In section 4 (collect long edges), use `chainSubdivThreshold2` when `isChainEdge` is true:
```typescript
const threshold = isChainEdge
    ? chainSubdivThreshold2
    : (isFeatureEdge ? featureSubdivThreshold2
       : (isBoundaryEdge ? boundarySubdivThreshold2 : subdivThreshold2));
```

**Trade-offs**:
- (+) Minimal code change (3 lines for threshold computation, 1 line for threshold selection)
- (+) Fixes Root Cause 1 (threshold mismatch) completely
- (-) Does NOT fix Root Cause 2 (priority starvation). Chain edges at ~0.424mm will still sort to the end of the list behind longer non-chain edges, and `modifiedTris` will still block most of them.
- (-) Expected improvement: maybe 200-400 splits instead of 42 (edges that survive modifiedTris because their triangles happen to not overlap with earlier splits). Still far from the 3000+ target.

**Assumptions** (for Verifier to attack):
1. Fixing the threshold alone is insufficient because priority starvation is the dominant blocking factor (322 blocked by modifiedTris vs 5930 blocked by threshold in R44).
2. Even with correct thresholds, the sort puts chain edges last and modifiedTris blocks most of them.

---

### Proposal 3: Interleaved Priority Queue (Moderate Complexity)

**Idea**: Instead of two separate phases, use a single priority queue that interleaves chain and non-chain edges by alternating picks.

**Mechanism**: Sort chain edges and non-chain edges separately by length descending. Then merge them in an interleaved pattern: for every 1 non-chain edge, pick 2 chain edges (or adjust ratio dynamically based on remaining counts).

**Trade-offs**:
- (+) More balanced triangle distribution across both categories
- (+) Chain edges get regular access instead of all-first or all-last
- (-) More complex merge logic
- (-) The interleaving ratio is a new tunable with no obvious correct value
- (-) Still subject to modifiedTris blocking, just distributed differently

**Not recommended**: Proposal 1 (chain-first) is simpler and more effective. Chain edges are the highest-priority edges by the project's design goals ("fingerprint on a knife edge"). Giving them first priority is architecturally sound, not just a hack.

---

## Recommended Approach

**Proposal 1: Chain-Edge-First Priority with Dedicated Threshold.**

Rationale:
1. It fixes BOTH root causes simultaneously.
2. It's architecturally aligned — chain edges are THE feature that determines ridge quality. Processing them first is the correct priority, not a workaround.
3. The `modifiedTris` alternation pattern (~50% split rate) is a natural consequence of the shared-triangle topology. The result (3300 chain edge splits → 4× resolution) is dramatically better than the current 42 splits.
4. The budget cap prevents unbounded triangle growth.
5. Non-chain edges processed second will find fewer available triangles, but that's correct — chain edge quality matters more than interior smooth-region subdivision.

### Expected Results

| Metric | R44 (current) | R44.2 (proposed) |
|--------|---------------|------------------|
| Chain edges in map | 6614 | 6614 |
| Chain edge candidates | 684 | ~6500+ |
| Chain edges split | 42 | ~3300 |
| Protected rejects | 320 | ~320 (unchanged) |
| modifiedTris blocks | 322 | ~2900 (alternating pattern) |
| New triangles from chain splits | 84 | ~6600 |
| Non-chain splits (approx) | ~800 | ~500 (reduced by modifiedTris pressure) |
| Total triangle increase | ~1684 | ~7600 |

Ridge resolution improvement: from 1 chain edge per row-pair (~0.424mm) to 1 chain edge per half-row-pair (~0.212mm) for the ~50% that are split. The unsplit alternating edges remain at 0.424mm but their visual impact is reduced because adjacent edges are finer.

## Open Questions

1. **CHAIN_SCALE value**: I propose 0.50. Should it be lower (0.35) to catch phantom sub-edges too? Or higher (0.65) to be more conservative? The R44 diagnostic showed chain edge min length ~0.424mm. At CHAIN_SCALE=0.50 with avgVerticalEdge≈0.45mm, threshold=0.225mm. All regular chain edges qualify. Phantom sub-edges at ~0.39mm also qualify. This seems right — phantom sub-edges SHOULD be eligible for subdivision since they trace the same feature.

2. **Budget cap value**: I propose `constraintEdgeSet.size` (= total chain + phantom edges). An alternative is `constraintEdgeSet.size * 0.6` to account for the modifiedTris alternation and leave more room for non-chain splits. The Verifier should assess whether the triangle count impact (~6600 new tris from chains) is acceptable.

3. **modifiedTris alternation**: With consecutive chain edges sharing a triangle, every-other-edge blocking is expected. Could a chain-specific `modifiedTris` set (separate from the global one) bypass this? I believe NO — the modifiedTris set exists to prevent two splits from modifying the same triangle. Splitting two edges that share a triangle would corrupt the index buffer. The alternation is a correct topological constraint, not a bug.

4. **Impact on non-chain edge subdivision quality**: Non-chain edges (interior, boundary, cross) get processed after chain edges, with more modifiedTris entries blocking them. The question is whether this degrades smooth-region mesh quality. Argument for "no": smooth regions have gently curving surfaces where long edges are less harmful. Chain-strip regions have sharp ridges where long edges cause visible serration. The priority ordering matches the quality-impact profile.

5. **avgVerticalEdge sampling edge cases**: The vertical sampling uses `(j+1) * outerW + i`. If the pot has very few rows (outerH < 10), the sample size is small. For a standard pot with 263 rows and 685 columns, sampling 50 columns × 10 rows = 500 edges is robust. The Verifier should confirm that the grid vertex layout `v = row * outerW + col` holds for the parametric pipeline.
