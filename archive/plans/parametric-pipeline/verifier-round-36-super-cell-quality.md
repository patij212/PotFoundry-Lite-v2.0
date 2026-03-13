# Verifier Round 36 — Critique of Generator Super-Cell Triangle Quality Fix

Date: 2026-03-07

## Summary Verdict: ACCEPT WITH AMENDMENTS

Proposals 1 (UV Delaunay tie-break) and 2 (super-cell vertex marking) are **sound** and should proceed. Proposal 4 (guard relaxation) contains **two CRITICAL logic errors** and must be reworked before implementation. Proposals 3 and 5 are correctly deprioritized.

---

## Critique

### C1 [CRITICAL]: Proposal 4 Aspect Ratio Guard — Logic Reversal

**Generator's claim**: "Currently rejects if `newAspect > 12.0 && newAspect > curAspect`. For super-cell tris starting at `37:1`, this means ANY flip that produces `> 12:1` is rejected even if it's a massive improvement (37 → 13)."

**Actual behavior** ([ChainStripOptimizer.ts line 621](../../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L621)):
```typescript
if (newAspect > 12.0 && newAspect > curAspect) {
    csAspectRejects++;
    continue;
}
```

The condition is a **logical AND**. For the 37:1 → 13:1 case:
- `newAspect > 12.0` → `13 > 12` → **true**
- `newAspect > curAspect` → `13 > 37` → **false**
- Result: `true && false` → **false** → guard PASSES, flip IS ALLOWED

The Generator reads `&&` as if it were `||`. The current guard **already allows all improving flips**. It only rejects when the new aspect ratio is BOTH above 12 AND worse than current. The scenario the Generator claims is blocked (37→13) is in fact perfectly allowed.

**The proposed replacement is actually STRICTER:**
```typescript
if (newAspect > curAspect * 0.8) continue;  // proposed for super-cell
```
For 37:1 → 30:1: `30 > 37 × 0.8 = 29.6` → **REJECTED** (a 19% improvement, blocked!)
For 37:1 → 20:1: `20 > 29.6` → **REJECTED** (a 46% improvement, blocked!)
For 37:1 → 10:1: `10 > 29.6` → ALLOWED

Compare with current guard for the same cases:
- 37→30: `30 > 12` true AND `30 > 37` false → ALLOWED ✓
- 37→20: `20 > 12` true AND `20 > 37` false → ALLOWED ✓
- 37→10: `10 > 12` false → ALLOWED ✓

**Impact**: The proposed "relaxation" would reject improving flips that the current guard allows. This is the opposite of the stated intent. If deployed, super-cell quality would get **worse**, not better.

**Required fix**: Remove the aspect ratio modification from Proposal 4 entirely. The current guard is already correctly permissive for improving flips. If the Generator believes aspect ratio guards are too strict, they must identify a specific case where `newAspect > 12 && newAspect > curAspect` incorrectly rejects a beneficial flip. I see no such case — the guard only blocks flips that *increase* aspect ratio above 12.

---

### C2 [CRITICAL]: Proposal 4 Angle Floor — Allows Worsening Below Floor

**Generator's claim**: "If current min-angle is already below floor, any improvement is welcome."

**Generator's proposed code**:
```typescript
if (flipMin < MIN_ANGLE_FLOOR && flipMin < curMin && curMin >= MIN_ANGLE_FLOOR) continue;
```

**Current code** ([ChainStripOptimizer.ts line 613](../../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L613)):
```typescript
if (flipMin < MIN_ANGLE_FLOOR && flipMin < curMin) continue;
```

**Analysis of the "both below floor" case** (curMin = 1.5°, MIN_ANGLE_FLOOR ≈ 2.3°):

| Scenario | Current guard | Proposed guard |
|---|---|---|
| curMin=1.5°, flipMin=1.8° (improving) | `1.8 < 2.3` true AND `1.8 < 1.5` **false** → PASS ✓ | `1.8 < 2.3` true AND `1.8 < 1.5` false → PASS ✓ |
| curMin=1.5°, flipMin=1.2° (worsening) | `1.2 < 2.3` true AND `1.2 < 1.5` **true** → REJECT ✓ | `1.2 < 2.3` true AND `1.2 < 1.5` true AND `1.5 >= 2.3` **false** → PASS ✗ |

The current code **already allows improving flips below floor** (row 1). The proposed change removes the protection against **worsening flips below floor** (row 2). A flip that degrades from 1.5° to 1.2° would be allowed — the opposite of "any improvement is welcome."

**Impact**: Would allow the optimizer to create worse triangles in already-bad regions. Could increase sliver count instead of reducing it.

**Required fix**: Remove the angle floor modification from Proposal 4 entirely. The current guard is correctly designed: it blocks worsening below floor while allowing improvement below floor.

---

### C3 [WARNING]: Proposal 2 False Positives at Cell Boundaries (A6)

**Generator's claim**: "No false positives: we won't accidentally mark standard-cell vertices as chain-adjacent."

**Actual situation**: Every chain cell shares vertices with adjacent standard cells. For example, chain cell at (band, col=5) marks `BL = grid[band][5]` as chain-adjacent. The standard cell at (band, col=4) has `BR = grid[band][5]` — the same vertex. Both triangles of the standard cell touch this vertex, so both are added to `chainStripTriSet`.

**Consequence**: Standard-cell triangles at chain-cell boundaries will be pulled into the chain-strip optimizer. These triangles already had their diagonals set by `flipEdges3D` (which runs first, [ParametricExportComputer.ts line 1514-1518](../../src/renderers/webgpu/ParametricExportComputer.ts#L1514)). The chain-strip optimizer could re-flip them.

In practice, the interference is bounded:
1. The chain-strip optimizer only flips when quality improves.
2. Boundary edges (shared with non-chain-strip tris) have only 1 entry in `edgeToTris` → cannot be flipped.
3. Only the diagonal between two now-chain-strip boundary tris (both from the same standard cell) could be re-flipped.

**Severity**: Low. The worst case is a small number of boundary cell diagonals being re-flipped by `optimizeChainStrips` after `flipEdges3D` already optimized them. Since both optimizers use 3D quality criteria, the net effect is likely neutral or slightly positive.

**Required fix**: No code fix needed, but **document the interference** in a comment where `chainAdjacentGridVerts` is populated:
```typescript
// NOTE: Boundary vertices shared with adjacent standard cells will pull
// those standard-cell triangles into chainStripTriSet. This is acceptable:
// boundary edges with standard-only neighbors are 1-entry in edgeToTris
// and cannot be flipped. Only quad diagonals of standard cells where BOTH
// tris touch a chain-adjacent vertex can be re-flipped by optimizeChainStrips.
```

---

### C4 [WARNING]: Proposal 4 Row-Span Relaxation Effectively Disables Guard (A7)

**Generator's claim**: Row-span relaxation from `2.5 × maxSingleRowTSpan` to `3.5 × maxSingleRowTSpan` for super-cell tris.

**Analysis**: The `rowSpanExceeds` function checks whether any new triangle's T-span exceeds the limit. The 4 vertices involved are from two adjacent triangles sharing an edge. These vertices span at most ~2 row bands (2 × `maxSingleRowTSpan`). An edge flip using the same 4 vertices cannot create a triangle spanning more than the bounding box of all 4 vertices. Since 2 × `maxSingleRowTSpan` < 3.5 × `maxSingleRowTSpan`, the relaxed guard **always passes**.

This effectively disables the row-span guard for super-cell edges. Whether this is a problem depends on whether the row-span guard catches real issues for these triangles:

- For typical pottery geometry with smooth curvature, flipping a diagonal within a 2-row-band quad is safe.
- For chain vertices that deviate from row boundaries, the T-span might exceed 2 rows in unusual geometry.

**Severity**: Moderate. If the guard is effectively disabled and the original 2.5x was already generous, the relaxation adds risk without clear benefit.

**Required fix**: If keeping the relaxation, use `Math.min(origTExtent * 1.2, maxSingleRowTSpan * 3.0)` instead of a flat `3.5x` limit. This ties the relaxation to the actual extent of the vertices involved rather than an arbitrary multiple.

---

### C5 [NOTE]: Proposal 1 Tie-Break Impact Assessment (A1)

**Generator's claim**: "The tie-break case is responsible for a significant fraction of slivers."

**Evidence reviewed**: In `sweepQuad` ([OuterWallTessellator.ts line 201](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L201)), the tie-break fires when `botNextU ≈ topNextU`. For super-cells spanning columns 3-5, intermediate grid vertices at column 4 have identical U on both bot and top edges. So roughly half the diagonal choices in a super-cell with grid vertices involve exact U-ties.

However, the tie-break only affects diagonal choice — it doesn't cause slivers by itself. Slivers arise from the super-cell geometry: chain vertices close to grid vertices, non-uniform vertex spacing, and multi-column spans creating elongated triangles. The diagonal choice exacerbates or mitigates this, but isn't the root cause.

**Verdict**: PARTIAL. The tie-break contributes to sliver count but is not the primary driver. The primary driver is the lack of any optimization pass on all-grid-vertex super-cell tris (Root Cause 1, which Proposal 2 addresses). Proposal 1 is still worth doing as a "better starting point" but expectations should be tempered.

**Estimated impact**: 10-20% sliver reduction (Generator claims 30-50%). The tie-break only affects cells passing through `sweepQuad`, and only at tie points. Many slivers come from geometric constraints (chain vertex positions) that no diagonal choice can fix.

---

### C6 [NOTE]: UV-Delaunay as 3D Proxy (A2)

**Generator's claim**: "UV-Delaunay is a reasonable proxy for 3D quality."

**Analysis**: On pottery surfaces, the UV→3D mapping has moderate, smooth distortion. The circumferential stretch factor varies from 1.0 (narrowest) to R_max/R_min (widest). For most PotFoundry styles, R_max/R_min ≈ 1.5-3.0, meaning UV distances can underestimate 3D distances by up to 3× at the widest point.

UV-Delaunay maximizes the minimum angle *in UV*, not in 3D. On high-curvature regions, this proxy could pick the wrong diagonal occasionally. However:
1. The 3D optimizer (`optimizeChainStrips`) runs afterwards and can correct UV→3D mismatches.
2. Any systematic choice (like the current `<=` bias) is worse than a geometry-aware heuristic, even an imperfect one.

**Verdict**: CONFIRMED as reasonable, not optimal. The two-layer approach (UV-Delaunay initial + 3D flip optimization) is sound engineering.

---

### C7 [NOTE]: Numerical Stability of `minAngle2D` (A3)

**Generator's proposed `minAngle2D` implementation** uses edge-length checks (`< 1e-12`) and clamped `acos` (`Math.max(-1, Math.min(1, ...))`) to handle degeneracy.

**Analysis**: UV coordinates in OWT are in [0, 1] range. Typical grid spacing is ~0.00173 (1/577 columns). Chain vertices may be closer to grid vertices but are at least at `batch2Remap` dedup precision (1e-5). Edge lengths of 1e-5 squared = 1e-10, well above the 1e-12 threshold. The `acos` clamp handles floating-point rounding correctly.

**Verdict**: CONFIRMED. No numerical issues expected for the actual data ranges.

---

### C8 [NOTE]: `chainAdjacentVertices` Completeness (A4)

**Generator's claim**: The set correctly identifies all grid vertices in super-cells/chain-cells.

**Evidence**: In `emitSuperCell` ([OuterWallTessellator.ts lines 1095-1140](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1095)):
- `botEdge` is built from BL + intermediate grid vertices + chain vertices + BR
- `topEdge` same for top row
- After sort + dedup → `finalBot` and `finalTop`
- The proposed code collects `v < gridVertexCount` from final arrays

For a super-cell spanning columns 3-5:
- Bot edge contains: `grid[band][3], grid[band][4], grid[band][5], grid[band][6]` plus chain verts
- Top edge contains: `grid[band+1][3], grid[band+1][4], grid[band+1][5], grid[band+1][6]` plus chain verts

All grid vertices within the super-cell ARE in the edge arrays. The super-cell is a quad with straight bot/top edges — there are no "interior" grid vertices outside the edges.

**Regarding batch2Remap**: If `batch2Remap` maps chainVertIdx → gridVertIdx, the grid vertex index replaces the chain index in the array. The `v < gridVertexCount` check still catches it. If `batch6Remap` operates (global dedup pass, [OWT line 1214](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1214)), it happens on the `indices` Uint32Array AFTER `buildCDTOuterWall` returns — it doesn't affect `finalBot`/`finalTop` during emission.

**One subtlety**: The `chainAdjacentGridVerts` set should be populated using the vertex indices **before** batch6Remap. After batch6Remap rewrites the index buffer, some chain vertex indices may be remapped to grid indices. The set would then miss marking those newly-mapped grid vertices. However, `optimizeChainStrips` runs after batch6Remap, so the indices it sees are the remapped ones. This means a vertex that was originally a chain vertex (index ≥ gridVertexCount) may now appear as a grid vertex after remap, but it's NOT in `chainAdjacentGridVerts` AND it's not ≥ outerGridVertexCount. It falls through both detection paths.

**But wait** — `optimizeChainStrips` has index-based detection too: `if (a >= outerGridVertexCount || ...)`. After batch6Remap, the chain→grid remapped index IS < outerGridVertexCount, so it's missed by index detection. And if it's not in `chainAdjacentVertices` (built pre-remap), it's missed by UV-proximity detection too.

**Impact**: Low. Batch6Remap only fires for vertices that are at the same UV position as a grid vertex (within 1e-5). These are essentially the same vertex. The triangle formed by this vertex is geometrically identical to a standard-cell triangle and doesn't need chain-strip optimization.

**Verdict**: CONFIRMED with the caveat above (low-impact edge case, no fix needed).

---

### C9 [NOTE]: Line Count Estimate (A11)

**Generator's claim**: ~70 lines total.

**Actual estimate**:
- Phase 1 (P2): `chainAdjacentGridVerts` declaration (1), population in emitChainCell (4), population in emitSuperCell (6), interface change (1), return value change (1), PEC destructure (1), PEC optimizeChainStrips param (1), PEC optimizeBoundaryDiagonals param (1) = **~16 lines**
- Phase 2 (P1): `minAngle2D` function (15), `sweepQuad` replacement (20) = **~35 lines**
- Phase 3 (P4): Even after removing the broken parts (C1, C2), the row-span relaxation adds ~8 lines + `isSuperCellEdge` detection ~3 lines = **~11 lines**

**Total: ~62 lines** (less than claimed, since P4 is stripped). If P4 is reworked, add ~5 lines for the fixed version.

**Verdict**: CONFIRMED — estimate is reasonable. If anything, slightly generous given P4 cuts.

---

### C10 [NOTE]: Combined Impact Prediction (A12)

**Generator's claim**: Sliver rate 25.9% → 5-10%.

**Analysis**: The two confirmed-sound proposals address:
- **P2 (vertex marking)**: Makes all-grid-vertex super-cell tris visible to optimizer. This is the highest-impact change. Estimated to expose ~30-40% of currently-invisible slivers to optimization.
- **P1 (Delaunay tie-break)**: Improves initial diagonal quality at tie points. Reduces sliver generation at source by ~10-20%.

However, `optimizeChainStrips` has structural limitations:
1. **Boundary-only adjacency**: Interior edges between chain-strip and standard-grid tris can't be flipped. The newly-visible super-cell tris will have MANY boundary edges (every edge shared with a standard cell).
2. **Guard strictness**: Even with P4 fixes, the row-span and edge-length guards block some beneficial flips.
3. **Fixed iteration order**: May miss optimal flip sequences.

**Revised estimate**: P1 + P2 together → sliver rate drops from 25.9% to **15-20%**. Adding a correct P4 → **12-17%**. Getting to < 10% likely requires Proposal 3 (local Delaunay in OWT) or Proposal 5 (non-quad flipEdges3D).

**Verdict**: PARTIAL. 5-10% is overly optimistic. 12-20% is realistic for P1+P2.

---

### C11 [NOTE]: Standard Cells and `sweepQuad` (A10)

**Generator's claim**: "Standard cells don't call `sweepQuad`."

**Evidence**: `emitStandardCell` ([OuterWallTessellator.ts lines 997-1036](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L997)) directly computes cross products and pushes two triangles. It never calls `sweepQuad`. The main emission loop ([OWT line ~1196](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1196)) dispatches to `emitSuperCell`, `emitChainCell`, or `emitStandardCell` with no other path.

Note: `emitChainCell` calls `sweepQuad` (for cells with chain vertices but no chain edges) or `constrainedSweepCell` (which internally calls `sweepQuad` on sub-quads). `emitSuperCell` does the same.

**Verdict**: CONFIRMED. Proposal 1's Delaunay tie-break affects only chain-cells and super-cells, not standard cells.

---

### C12 [WARNING]: Generator Proposes Passing `chainAdjacentVertices` to `optimizeBoundaryDiagonals`

The Generator mentions passing `chainAdjacentVertices` to `optimizeBoundaryDiagonals` as a secondary step. The `BoundaryDiagonalParams` interface already includes `chainAdjacentVertices?: Set<number>` ([ChainStripOptimizer.ts line 93](../../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L93)), and the function already handles it ([CSO line ~856](../../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L856)):

```typescript
if (bdChainAdjacentVerts &&
    (bdChainAdjacentVerts.has(a) || bdChainAdjacentVerts.has(b) || bdChainAdjacentVerts.has(c))) {
    return t;
}
```

Currently, `optimizeBoundaryDiagonals` is called without this param ([PEC line 1548-1556](../../src/renderers/webgpu/ParametricExportComputer.ts#L1548)). Passing it is trivially safe since the code already handles it.

**Verdict**: CONFIRMED. This is a free win — include in Phase 1 alongside the `optimizeChainStrips` parameter addition.

---

## Accepted Items

1. **Proposal 1 (UV Delaunay tie-break in `sweepQuad`)**: Sound approach. The `minAngle2D` implementation is numerically stable. The epsilon zone (`1e-8`) is appropriate for UV coordinates in [0,1]. The tie-break only activates when `|botNextU - topNextU| < ε`, preserving the forced-advance behavior for clear winners.

2. **Proposal 2 (Super-cell vertex marking)**: Highest-impact change with lowest risk. Uses existing `chainAdjacentVertices` infrastructure in `ChainStripFlipParams` ([CSO line 52](../../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L52)) and `BoundaryDiagonalParams` ([CSO line 93](../../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L93)). Both `optimizeChainStrips` and `optimizeBoundaryDiagonals` already have code to handle the set.

3. **Root Cause Analysis**: The Generator correctly identifies that all-grid-vertex super-cell tris are invisible to all 4 optimization passes. This is the primary quality gap. The analysis of `quadMap = -1` skipping in `chainDirectedFlip` ([MeshOptimizer.ts line ~140](../../src/renderers/webgpu/parametric/MeshOptimizer.ts#L140)), `flipEdges3D` ([MO line ~380](../../src/renderers/webgpu/parametric/MeshOptimizer.ts#L380)), and `optimizeBoundaryDiagonals` ([CSO line ~840](../../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L840)) is accurate.

4. **Chain edge constraint preservation**: Correctly argued that none of the proposals affect constraint edge enforcement. `sweepQuad` creates triangles (doesn't flip edges), `constrainedSweepCell` uses chain edges as partition boundaries, and `optimizeChainStrips` has explicit `constraintEdgeSet.has(ek)` guards.

5. **Phase ordering (P2 → P1 → P4)**: Correct. P2 has the highest impact/risk ratio and should go first.

6. **Rejection of Proposals 3 and 5**: Correctly argued. P3 is redundant if P1+P2 work, and P5 creates a competing system.

---

## Open Questions for Generator

1. **Proposal 4 intent**: Given the two logic errors (C1, C2), what specific guard behavior were you trying to change? The current guards already allow improving flips. What scenario produces a reject that you believe should be an accept?

2. **Boundary edge fraction**: What fraction of newly-visible super-cell tri edges (from P2) are boundary edges (shared with standard-grid tris)? If > 50%, `optimizeChainStrips` reach is limited even with P2. This would strengthen the case for Proposal 3 as a necessary supplement.

3. **Diagnostic counter**: The Generator asks whether "all-grid-vertex super-cell tris" are > 30% of super-cell tris. This should be measured with a diagnostic counter during implementation. Add `let allGridSuperCellTris = 0;` and increment it when a super-cell tri has all vertices < gridVertexCount.

---

## Implementation Conditions (if ACCEPT)

### Phase 1: Proposal 2 (Super-Cell Vertex Marking) — PROCEED AS WRITTEN

Implement exactly as specified in Generator's Steps 1.1–1.6 with these additions:

1. Add the boundary warning comment from C3 to `chainAdjacentGridVerts` population.
2. Also pass `chainAdjacentVertices` to `optimizeBoundaryDiagonals` (Generator mentions this; make sure it happens).
3. Add a diagnostic `console.log` for `chainAdjacentGridVerts.size` and the resulting `chainStripTriCount` increase.

**Validation**: `chainStripTriCount` in optimizer output must increase (more tris visible). If it doesn't, investigate whether batch6Remap is stripping vertex indices.

### Phase 2: Proposal 1 (UV Delaunay Tie-Break) — PROCEED AS WRITTEN

Implement exactly as specified in Generator's Steps 2.1–2.2. The `minAngle2D` implementation is sound. The epsilon value of `1e-8` is appropriate.

**Validation**: Run `sweepQuad` unit tests. Update expected triangle orders if the tie-break changes output. Verify winding correctness is preserved (it should be — `emitTriCCW` handles winding independently).

### Phase 3: Proposal 4 (Guard Relaxation) — REWORK REQUIRED

**Remove the aspect ratio change entirely** (C1). The current guard is correctly permissive.

**Remove the angle floor change entirely** (C2). The current guard already allows improving flips below floor.

**The row-span relaxation MAY proceed** with amendment (C4): use `Math.min(origTExtent * 1.2, maxSingleRowTSpan * 3.0)` instead of a flat `3.5x`. This keeps the relaxation tied to actual vertex geometry.

**Alternative for Phase 3**: If the Generator cannot identify specific guard rejections blocking beneficial flips, defer Phase 3 entirely. Run P1+P2 first, measure results, then decide if further guard tuning is needed based on the new `csRowSpanRejects`/`csEdgeLenRejects`/`csAspectRejects` counts.

### Validation Protocol (All Phases)

| Metric | Baseline | After P2 | After P1+P2 | Threshold |
|---|---|---|---|---|
| Chain edges enforced | 6172/6172 | 6172/6172 | 6172/6172 | 0 missing |
| chainStripTriCount | current | **must increase** | same or higher | — |
| Sliver rate (AR > 4:1) | 25.9% | < 23% | < 20% | < 20% |
| min_angle | 1.7° | > 2° | > 5° | > 5° |
| max_aspect | 37.1:1 | < 35:1 | < 25:1 | < 25:1 |
| Cross-row triangles | 46 | ≤ 46 | ≤ 46 | ≤ 46 |
| Non-manifold edges | 2 | ≤ 2 | ≤ 2 | ≤ 2 |
| All tests (1879) | pass | pass | pass | pass |

---

## Summary of Verdicts by Assumption

| ID | Assumption | Verdict | Severity |
|---|---|---|---|
| A1 | Tie-break causes significant slivers | **PARTIAL** | NOTE — impact overestimated, still worth doing |
| A2 | UV-Delaunay reasonable 3D proxy | **CONFIRMED** | — |
| A3 | minAngle2D numerically stable | **CONFIRMED** | — |
| A4 | chainAdjacentVertices complete | **CONFIRMED** | — |
| A5 | UV-proximity detection works | **CONFIRMED** | — |
| A6 | No false positives | **PARTIAL** | WARNING — boundary interference exists, low severity |
| A7 | Row-span 3.5x safe | **PARTIAL** | WARNING — effectively disables guard |
| A8 | Aspect ratio 80% safe | **REFUTED** | CRITICAL — logic reversed, change is stricter not relaxed |
| A9 | Angle floor change safe | **REFUTED** | CRITICAL — allows worsening flips below floor |
| A10 | Standard cells skip sweepQuad | **CONFIRMED** | — |
| A11 | ~70 lines total | **CONFIRMED** | NOTE — reasonable estimate |
| A12 | 25.9% → 5-10% | **PARTIAL** | NOTE — 15-20% more realistic for P1+P2 |
