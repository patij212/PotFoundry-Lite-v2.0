# Verifier Round 35 — Critique of Super-Cell Fusion Proposal

Date: 2026-03-07

## Summary Verdict: ACCEPT WITH AMENDMENTS

The core idea is sound. Super-cell fusion correctly solves the cross-column chain edge enforcement problem by ensuring both endpoints appear in the same cell's bot/top edge arrays. The algorithm is simpler and more correct than the intersection vertex approach it replaces. Two minor amendments required.

---

## Assumption Verification

### A1: Chain edge endpoints are at row boundaries — CONFIRMED

Chain vertices are written to the vertex buffer at [OWT line 746](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L746): `vertices[vIdx++] = cv.t ?? activeTPositions[cv.rowIdx]`. Vertices without explicit `t` (which is all non-companion vertices — companions are filtered at [line 841](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L841)) use `activeTPositions[cv.rowIdx]`, which IS a row boundary T value by construction. Interpolated gap-fill vertices (lines 672–678) also get valid `rowIdx` and no `t`. After `batch2Remap`, endpoints become grid vertices, which are also at row boundaries. No counterexample possible.

### A2: Micro-rows limit crosses to ~1 column — PARTIAL

`insertMicroRowsForSteepCrossings` runs a **single pass** (lines 313–410). It detects `colGap > 1` and inserts ONE micro-row at tMid. After insertion, the interpolation pass produces a vertex at the midpoint U. Each sub-segment spans ~half the original column gap. For original colGap=2, halving gives ~1. But for original colGap=3, halving gives ~1.5 → sub-segments still cross >1 column. No recursive insertion occurs.

**Impact on R35**: This is NOT a flaw. Super-cell fusion handles 3+ column spans correctly via interval merge — the super-cell is just wider. The Generator's claim that "super-cells are typically 2 columns wide" is a probabilistic statement, not a guarantee. The algorithm makes no assumption about maximum width.

### A3: constrainedSweepCell works on wider cells — CONFIRMED

Verified at [lines 235–301](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L235). The function uses `indexOf` to find endpoints, sorts partitions by average U, and sweeps sub-quads left-to-right. Intermediate grid vertices in the bot/top arrays are simply additional edge vertices — `sweepQuad` (lines 196–225) is a two-pointer sweep that handles any number of edge vertices regardless of cell width. Each sub-quad between partitions is U-monotone.

Same-column chain edges from constituent cells: their endpoints are collected by `emitSuperCell`'s loop over all constituent cells' `botChainVerts`/`topChainVerts`. Verified: chain vertex assignment at [lines 839–862](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L839) places vertices in cells by `gc = bsearchFloor(unionU, cv.u)`, and both `gc0` and `gc1` are within `[cMin, cMax]` by construction.

### A4: Sort-by-U dedup preserves correctness — CONFIRMED

The dedup in `emitSuperCell` uses `Set<number>` (vertex index), not U-value. Two vertices at the same U but different indices both survive — this is correct since they may be endpoints of different chain edges. The primary duplicate source (batch2Remap'd chain vertex → grid vertex) is eliminated at [line 841](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L841): `if (batch2Remap.has(cv.vertexIdx)) continue` — merged vertices are never added to `botChainVerts`/`topChainVerts`. Near-coincident (non-merged) vertices produce zero-width sub-quads → degenerate triangles → collapsed by batch6. Harmless.

### A5: No downstream references to intersection vertices — CONFIRMED

Traced all references:
- **Batch6 dedup** ([line 1088](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1088)): `const totalVerts = totalVertexCount` — intersection vertices (≥ totalVertexCount) were already excluded
- **Chain edge verification** (lines 1158–1218): iterates `chainEdges`, which after R35 contain no intersection endpoints
- **FeatureEdgeGraph** ([line 1227](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1227)): maps `chainVertices` only — never included intersection vertices
- **Vertex trimming** ([line 1233](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1233)): `nextIntersectionIdx` becomes `totalVertexCount` → `finalVertices = vertices` → clean

---

## Additional Concerns

### Concern 1: Cross-column edge in non-super-cell cells — HARMLESS

The proposal registers the original (unsplit) edge in ALL cells `[cMin, cMax]`. For cells inside a super-cell, the emission loop skips them (`superCellCols.has(key) → continue`). Only `emitSuperCell` processes them, where both endpoints are in the edge arrays. For seam-excluded super-cells that fall back to per-cell emission, `constrainedSweepCell` gets `-1` from `indexOf` for both endpoints and silently drops the edge — same as current R34 behavior.

### Concern 2: Same-column chain edges in super-cell — CORRECT

`emitSuperCell` collects `botChainVerts` and `topChainVerts` from ALL constituent cells. Same-column chain vertices are placed in their original cell's info by the vertex assignment loop. They're correctly collected into the super-cell's edge arrays.

### Concern 3: Chain vertex at column boundary — CORRECT

`batch2Remap` at [lines 768–780](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L768) merges chain vertices within `MERGE_THRESHOLD` (1e-4) of grid columns. Merged vertices are skipped from `botChainVerts`. Chain edge endpoints are remapped to grid indices at [lines 786–794](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L786). The remapped grid vertex IS in the super-cell's edge array as an intermediate column vertex. `indexOf` finds it.

### Concern 4: chainCellCount tracking — NOTE (not a bug)

`chainCellCount += (colEnd - colStart + 1)` counts consumed grid columns, not super-cells. The diagnostic log "chain cells: N" becomes slightly misleading but functionally irrelevant. See Amendment A2 below.

### Concern 5: Batch6 dedup interaction — NO ISSUE

Batch6 operates on `[0, totalVertexCount)`. With no intersection vertices, the vertex population is unchanged. Cross-column chain edge endpoints are within this range (either chain or grid vertex indices). Batch6's remap of chainEdges at [lines 1138–1145](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1138) applies identically.

---

## Amendments Required

### A1 [NOTE]: Add super-cell diagnostic counter

The log line at ~line 1224 should report super-cell count separately. Replace the plain `chainCellCount` increment in `emitSuperCell` with a separate counter.

```typescript
let superCellCount = 0;
let superCellColumnsConsumed = 0;
// In emitSuperCell:
superCellCount++;
superCellColumnsConsumed += (colEnd - colStart + 1);
// In log:
console.log(`... super-cells: ${superCellCount} (${superCellColumnsConsumed} cols)`);
```

**Severity**: NOTE. Not required for correctness. Aids future debugging.

### A2 [WARNING]: Guard against empty super-cell edge arrays

If ALL chain vertices in a super-cell's constituent cells were batch2Remap'd to grid vertices AND no chain edges exist (edge case after dedup), `emitSuperCell` calls `sweepQuad` with `finalBot`/`finalTop` containing only grid vertices. This is correct but produces the same output as emitting standard cells individually — wasted work, no bug. However, if `uniqueEdges` is empty and `finalBot.length < 2` (degenerate), `sweepQuad` enters the while loop with `bLen = 1, tLen = 1` and immediately exits (no triangles emitted). The super-cell produces no geometry — a silent hole.

**Required fix**: After building `finalBot` and `finalTop`, add:
```typescript
if (finalBot.length < 2 || finalTop.length < 2) {
    // Degenerate super-cell (all vertices merged away). Fall back to standard cells.
    for (let c = colStart; c <= colEnd; c++) {
        emitStandardCell(band, c);
    }
    return;
}
```

**Severity**: WARNING. Unlikely to trigger in practice (a super-cell exists because cross-column edges exist, which means chain vertices exist). But the defensive guard costs 2 lines and prevents a potential hole.

---

## Accepted Items

1. **Core algorithm**: Super-cell fusion correctly solves the cross-column edge problem. Both endpoints are guaranteed to be in the super-cell's bot/top arrays (verified via A1 + vertex assignment code path).
2. **Interval merge**: Correctly handles overlapping and adjacent fusion requests.
3. **Seam guard**: Excluding seam-spanning super-cells is the right pragmatic choice.
4. **Edge dedup**: String-key dedup of chain edges in `emitSuperCell` is correct.
5. **Emission loop modification**: The `superCellCols`/`superCellStarts` lookup correctly skips interior columns and emits at super-cell start.
6. **Intersection vertex removal**: Clean deletion with no downstream breakage (A5 confirmed).
7. **Buffer sizing simplification**: Removing `maxCrossColumnVertices` is safe.

---

## Implementation Conditions for Executioner

1. Apply R35 as specified in the proposal, with the two amendments above.
2. Run the full export with diagnostic logging. Verify:
   - `missing crossRow` drops from 1772 to near 0
   - `non-manifold edges` drops significantly
   - No new holes or missing geometry
3. Run `npm run typecheck` and `npm run lint` — zero errors.
4. Run `npm test` — all OWT tests pass.
5. Add one unit test: a cross-column chain edge should produce a super-cell that enforces both endpoints as mesh edges.
