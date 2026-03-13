# Verifier Round 41 — Critique of Proposal 2B (Feature-Aware Subdivision Threshold)
Date: 2026-03-08

## Summary Verdict: ACCEPT WITH AMENDMENTS (1 correction, 1 recommendation)

Proposal 2B is **sound**. Every assumption checked out against the actual source code. The Generator has identified exactly the right integration point — the subdivision pass at [MeshSubdivision.ts](../../src/renderers/webgpu/parametric/MeshSubdivision.ts) — and the fan arm detection via index range XOR is correct and complete. The budget concern raised by the Generator turns out to be a non-issue upon close analysis. I have one factual correction and one implementation recommendation; neither blocks the design.

---

## Assumption Verification

### A1 ✅ CONFIRMED: Fan arms are NOT in `protectedStripVertices`

**Generator's claim**: "Normal chain cell vertices (chain vertices and their grid corners) are NOT in `protectedStripVertices`. Only R37/R38 phantom crossing anchors and companions are."

**Actual behavior**: Verified at [OuterWallTessellator.ts:L1090](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1090): `protectedStripVertices` is created as an empty `Set<number>()`. The only mutations are:

| Line | What's added |
|------|-------------|
| [L1263](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1263) | `crossing.anchorIdx` — phantom crossing anchor |
| [L1265](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1265) | `crossing.leftCompanionIdx` — R38 left companion |
| [L1268](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1268) | `crossing.rightCompanionIdx` — R38 right companion |

No regular chain vertices (indices `gridVertexCount` .. `totalVertexCount-1`) and no grid corner vertices (indices `0` .. `gridVertexCount-1`) are ever added. The set flows through the return value at [L1808](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1808) and is passed to subdivision as `protectedVertices` at [ParametricExportComputer.ts:L1613](../../src/renderers/webgpu/ParametricExportComputer.ts#L1613).

**Minor note**: The Generator cited "L1094-L1100" for the population site. The actual lines are L1090 (creation) and L1263-L1268 (population inside the crossings loop). Cosmetic inaccuracy; doesn't affect the correctness of the claim.

**Verdict**: CONFIRMED. `touchesProtectedPatch` at [MeshSubdivision.ts:L395-L400](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L395) will NOT block fan arm splits in normal chain cells.

---

### A2 ✅ CONFIRMED: Fan arms are in the candidate set

**Generator's claim**: "Chain cell triangles are identified as chain-strip triangles by `identifyChainStripTriangles`. Their edges are in `subEdgeToTris` and eligible for splitting."

**Actual behavior**: `identifyChainStripTriangles` at [MeshSubdivision.ts:L216-L243](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L216-L243) uses hybrid detection:

```typescript
// Classic index-based detection
if (a >= outerGridVertexCount || b >= outerGridVertexCount || c >= outerGridVertexCount) {
    csTriSet.add(t);
    continue;
}
// UV-proximity detection (v20.x)
if (chainAdjacentVertices && (...))
```

Any triangle with at least one chain vertex (index >= `outerGridVertexCount`) is identified as chain-strip. A fan arm triangle by definition has at least one chain vertex, so it's always in `csTriSetNow`.

The edges of these triangles are indexed at [L328-L336](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L328-L336):

```typescript
for (const t of csTriSetNow) {
    const a = combinedIdxs[t], b = combinedIdxs[t + 1], c = combinedIdxs[t + 2];
    for (const ek of [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]) {
        if (!subEdgeToTris.has(ek)) subEdgeToTris.set(ek, []);
        subEdgeToTris.get(ek)!.push(t);
    }
}
```

Fan arm edges (mixed grid/chain) are in `subEdgeToTris`. They pass the splitting eligibility test at [L365-L366](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L365) if `tris.length === 2` (shared by exactly two triangles) and not in `constraintEdgeSet` (not a chain edge).

**Verdict**: CONFIRMED. Fan arms are correctly indexed and eligible for splitting.

---

### A3 ✅ CONFIRMED: `isFanArm` detection is correct

**Generator's claim**: "`(v0 < outerGridVertexCount) !== (v1 < outerGridVertexCount)` correctly identifies fan arms. Batch2Remap'd chain vertices have grid indices, so merged vertices are correctly excluded."

**Actual behavior**: The XOR correctly identifies edges with exactly one grid endpoint and one non-grid endpoint. Three cases to verify:

**Case 1 — Normal fan arm (chain vertex ↔ grid corner)**: Chain vertex has index ∈ [`gridVertexCount`, `totalVertexCount`), grid corner has index ∈ [0, `gridVertexCount`). The XOR evaluates `true`. ✅

**Case 2 — Batch2Remap'd chain vertex**: At [OuterWallTessellator.ts:L828-L839](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L828-L839), chain vertices within `MERGE_THRESHOLD` (1e-4) of a grid column are remapped to grid indices. After remapping, the index buffer uses the grid index. An "edge" from this merged vertex to an adjacent grid corner is grid→grid, so the XOR evaluates `false`. ✅ **This is correct**: the merged vertex sits AT the grid corner (within 0.1mm in UV), so no stretching occurs and no subdivision is needed.

**Case 3 — Phantom vertices**: Phantom vertices (R37/R38) have indices ∈ [`totalVertexCount`, `totalVertexCount + phantomVertexCount`). Since `totalVertexCount > gridVertexCount`, these indices are >= `outerGridVertexCount`. A phantom→grid edge is correctly classified as a fan arm. However, phantom crossing anchors and companions are in `protectedStripVertices`, so `touchesProtectedPatch` blocks their splits. Unprotected phantom vertices (if any) would be eligible for feature-threshold splitting — this is reasonable since they're artificially inserted vertices that may create stretched edges.

**Case 4 — Batch6Remap (global dedup)**: At [OuterWallTessellator.ts:L1644-L1670](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1644-L1670), the batch6 dedup resolves UV-coincident vertices, preferring grid indices as canonical. After this pass, chain vertices at exact grid positions get grid indices in the index buffer. Same effect as batch2Remap — correctly excluded from fan arm detection.

**Verdict**: CONFIRMED. The detection is correct for all vertex categories.

---

### A4 ✅ CONFIRMED: FEATURE_SCALE = 0.75 is conservative enough

**Generator's claim**: "Sub-triangles of ~0.375 grid cell width — well above degenerate threshold."

**Analysis**: After splitting a fan arm at the 0.75× threshold:
- The two resulting sub-edges are each ~0.375× `avgGridEdge` in length.
- The `modifiedTris` guard at [L390](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L390) prevents cascade: each triangle participates in at most one split per pass.
- At typical `avgGridEdge` ≈ 1.0mm, the sub-edges are ~0.375mm — well above any degenerate threshold.
- The threshold hierarchy is monotonically ordered: feature (0.75×) < boundary (1.2×) < interior (1.8×). An edge classified as a fan arm gets the most aggressive threshold. This is correct because fan arms are the edges most likely to produce chord error.

**Counterexample search**: Can `FEATURE_SCALE = 0.75` create degenerate triangles? A fan arm of length exactly 0.75× `avgGridEdge` would be split into two ~0.375× sub-edges. The opposing edge of the original triangle (the grid edge or another fan arm) is typically ~1.0× `avgGridEdge`. The resulting aspect ratio is ~0.375/1.0 ≈ 0.375:1 — not great but not degenerate. No counterexample found.

**Verdict**: CONFIRMED. The threshold is safe.

---

### A5 ✅ CONFIRMED (with factual correction): Budget is sufficient

**Generator's claim**: "maxSplits = floor(csTriSetNow.size × 0.5)"

**Actual code at [MeshSubdivision.ts:L392](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L392)**:

```typescript
const maxSplits = Math.floor((csTriSetNow.size + boundaryTrisAdded) * 0.5);
```

### C1 [NOTE]: Generator's budget formula is slightly wrong

The budget includes `boundaryTrisAdded` — the standard-grid triangles that share edges with chain-strip triangles (indexed in the second pass at [L344-L356](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L344-L356)). This makes the budget **more generous** than the Generator assumed. The Generator's concern about budget exhaustion is therefore a non-issue for an additional reason beyond the one I'll describe next.

**The real budget analysis**: Each split operation consumes exactly 2 triangles (both marked in `modifiedTris`). The maximum theoretical number of splits is `relevantTriCount / 2`. The budget `maxSplits = floor(relevantTriCount * 0.5)` is exactly this theoretical maximum. **The budget can never be the binding constraint before `modifiedTris` exhaustion.** Even with the lower 0.75× feature threshold qualifying many more edges, the budget cap is identical to the physical limit. The Generator's suggestion to increase the budget to 0.75 is unnecessary.

**Why the budget appears tight but isn't**: The sort-by-length-descending at [L385](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L385) ensures the longest (most problematic) edges are split first. The `modifiedTris` guard prevents two splits from sharing a triangle. In practice, high-priority splits (longest fan arms) consume their triangle pairs first, and the diminishing returns of shorter fan arms are naturally handled by the triangle availability constraint — NOT by the budget cap.

**Verdict**: CONFIRMED — budget is always sufficient. The formula in the proposal document should be corrected for accuracy. **No code change needed.**

---

### A6 ✅ CONFIRMED: Edge sorting is correct

**Generator's claim**: "`edgesToSplit.sort((a, b) => b.len2 - a.len2)` means longest fan arms get split first."

**Actual code at [MeshSubdivision.ts:L385](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L385)**:

```typescript
edgesToSplit.sort((a, b) => b.len2 - a.len2);
```

Descending sort by squared 3D length. Longest edges first. ✅

**Verdict**: CONFIRMED.

---

## Interaction with Proposal 1 (chainFanQuad)

**Finding**: `chainFanQuad` does not exist in the codebase. No matches for `chainFanQuad`, `fanQuad`, `fan_quad`, or `FanQuad` anywhere in `potfoundry-web/src/**`. Proposal 1 has not been implemented.

**Interaction analysis**: Proposal 2B is fully independent of Proposal 1. It operates on the existing mesh structure where fan arms arise naturally from CDT tessellation of chain cells (via `constrainedSweepCell` → `sweepQuad`). The subdivision pass is topology-agnostic — it doesn't know or care how triangles were produced.

If/when Proposal 1 (chainFanQuad) IS implemented:
1. Fan diagonals would replace `sweepQuad`'s alternating diagonals with chain-oriented ones
2. These fan triangles are still standard mesh triangles at subdivision time
3. Fan arms (chain→grid edges) would still be correctly detected by the XOR check
4. Fan diagonals themselves (chain→chain edges within the cell) would NOT be classified as fan arms (both endpoints >= `outerGridVertexCount`), which is correct — they're intra-strip edges using the interior threshold
5. Fan diagonals that are actual chain edges would be in `constraintEdgeSet` and protected from splitting, which is correct

**Verdict**: No interaction concerns. Proposals 1 and 2B are independent. Both can be implemented and verified separately.

---

## #1 Failure Mode

### The Most Likely Failure: `modifiedTris` saturation in dense chain regions

**Severity**: MINOR (quality degradation, not a correctness bug)

**Scenario**: In densely featured regions where 3+ chains run parallel within a few grid cells, many fan arms qualify for splitting. The `modifiedTris` guard prevents two splits from sharing a triangle. With the lower 0.75× threshold, more fan arms qualify. Adjacent fan arms often share a triangle — if the first split claims both triangles of that edge, the second fan arm's triangles are marked as modified, and it gets skipped.

**Impact**: Some medium-length fan arms near densely-packed features don't get split in the single subdivision pass. The surface quality improvement is partial rather than complete.

**Mitigation**: The sort-by-length-descending ensures the most egregious fan arms (longest ones, highest chord error) are split first. The skipped edges are shorter and contribute less visual error. This is the correct degradation mode — graceful quality falloff, not an abrupt cliff.

**Why NOT critical**: 
- The mesh remains manifold and watertight
- No T-junctions are created (splits always process both adjacent triangles)
- The existing quality level is maintained; only the improvement delta is partial
- A second subdivision pass (if ever needed) could catch the residual edges

---

## Budget Analysis

**Conclusion**: The budget is a non-binding constraint.

| Parameter | Formula | Typical value (20 chains, 243 rows) |
|-----------|---------|--------------------------------------|
| `csTriSetNow.size` | Style-dependent | ~10,000 chain-strip tris |
| `boundaryTrisAdded` | Edge-sharing grid tris | ~2,000–4,000 |
| `maxSplits` | `floor((10000 + 3000) * 0.5)` | ~6,500 |
| Fan arm edges exceeding 0.75× | ~60–80% of ~19,440 total fan edges | ~12,000–15,000 edges |
| Edges with `tris.length === 2` | Subset of above | ~8,000–10,000 |
| Actual splits (modifiedTris-limited) | Each consumes 2 tris from pool | ~3,000–5,000 |

The bottleneck is `modifiedTris` (triangle availability), not `maxSplits` (budget cap). Even in the worst case, the budget of ~6,500 exceeds the triangle-limited maximum of ~5,000–6,500.

The Generator's suggestion to increase the budget multiplier from 0.5 to 0.75 is unnecessary. **Do not change the budget formula.**

---

## Amendments

### Amendment A1 [CORRECTION]: Fix budget formula in documentation

The proposal document states `maxSplits = floor(csTriSetNow.size × 0.5)` in multiple places. The actual formula at [MeshSubdivision.ts:L392](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L392) is:

```typescript
const maxSplits = Math.floor((csTriSetNow.size + boundaryTrisAdded) * 0.5);
```

The Generator must use the correct formula in implementation-facing documentation. This is a documentation-only correction — no code change.

### Amendment A2 [RECOMMENDATION]: Hoist `featureThreshold2` outside the loop

The Generator's pseudo-code computes `featureThreshold2` inside the edge evaluation loop:

```typescript
// Inside the loop:
const featureThreshold2 = (avgGridEdge * 0.75) ** 2;
```

This should be hoisted to the same location as `subdivThreshold2` and `boundarySubdivThreshold2` (around [L306-L307](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L306-L307)):

```typescript
const subdivThreshold2 = (avgGridEdge * 1.8) ** 2;
const featureSubdivThreshold2 = (avgGridEdge * 0.75) ** 2;   // ← add here
```

This is standard constant hoisting. The Executioner would almost certainly do this naturally, but stating it explicitly avoids any ambiguity.

---

## Accepted Items

| Item | Evidence |
|------|----------|
| isFanArm detection via index-range XOR | Verified against batch2Remap (L828-L839), batch6Remap (L1644-L1670), phantom vertex indices (L793+) |
| FEATURE_SCALE = 0.75 | Safe: sub-edges ~0.375× avgGridEdge, no degenerate counterexample found |
| Integration at L370-L385 threshold selection | Clean insertion point: add one `if` branch before the existing boundary/interior ternary |
| ~12 lines of code change | Realistic estimate for constant + threshold branch + stats logging |
| No changes to OWT, PEC calling code, or cell architecture | Confirmed: only MeshSubdivision.ts changes |
| T-junction safety | Confirmed: subdivision always processes both triangles sharing the split edge |
| Protected corridor interaction | Correct: phantom anchors/companions are blocked by `touchesProtectedPatch`; normal chain cells are unaffected |

---

## Open Questions Resolved

### Q1 (Budget scaling): RESOLVED — No change needed
The budget is non-binding. See Budget Analysis above.

### Q2 (FEATURE_SCALE as config parameter): No preference
Hard-coding 0.75 is consistent with the existing hard-coded 1.8× and 1.2×. If the value needs tuning, it can be extracted later. No action needed at implementation time.

### Q3 (Super-cell fan arm exception): RESOLVED — No exception needed
Super-cell phantom regions are already densely populated by R37 band-splitting infrastructure. The phantom vertices themselves handle the density problem in those regions. Blocked fan arm splits there cause no visible quality loss. Adding a "split-only" exception would require careful reasoning about subsequent optimizer passes — not worth the complexity.

### Q4 (Proposal 1 interaction): RESOLVED — No interaction
See "Interaction with Proposal 1" section above.

---

## Implementation Conditions for the Executioner

1. Add `featureSubdivThreshold2 = (avgGridEdge * FEATURE_SCALE) ** 2` alongside the existing thresholds at ~L307. Use `FEATURE_SCALE = 0.75` as a named constant.

2. In the edge evaluation loop (~L370-L382), insert fan arm detection BEFORE the existing boundary/interior check:
   ```typescript
   const isFanArm = (v0 < outerGridVertexCount) !== (v1 < outerGridVertexCount);
   const isBoundaryEdge = (csTriSetNow.has(tris[0]) !== csTriSetNow.has(tris[1]));
   const threshold = isFanArm
       ? featureSubdivThreshold2
       : (isBoundaryEdge ? boundarySubdivThreshold2 : subdivThreshold2);
   ```

3. Add `featureThreshold: number` to `SubdivisionStats` interface, populate it, and log it in PEC alongside the existing threshold stats.

4. **Do NOT change the `maxSplits` formula.** The current budget is sufficient.

5. **Do NOT add `FEATURE_SCALE` to `SubdivisionParams`.** `outerGridVertexCount` is already present; no new parameters are needed.

6. **Validation protocol**: After implementation, run an export on the "Gothic" style (high feature count) and verify:
   - The subdivision stats log shows a new `featureThreshold` value
   - `candidates` count increases compared to pre-change (more edges exceed the lower threshold)
   - `splitCount` may increase modestly (bounded by `modifiedTris` exhaustion, not budget)
   - No new TypeScript errors (`npm run typecheck`)
   - All existing tests pass (`npm test`)
