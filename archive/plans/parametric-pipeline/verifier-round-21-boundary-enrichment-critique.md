# Verifier Round 21 — Critique of Generator's Chain-Shadow Boundary Enrichment Proposal

Date: 2026-03-05

## Summary Verdict: ACCEPT WITH AMENDMENTS

The core insight is sound: aligning strip boundaries with feature U-positions via shadow vertices eliminates the pathological chain→grid fan pattern. The Q1b strategy (pre-inserting shadows into `buildMergedRow`) is the correct approach — it guarantees shared vertex indices across adjacent bands and prevents T-junctions. However, the implementation as specified has **three critical issues** and **four warnings** that must be addressed before the Executioner proceeds.

---

## Critique

### C1 [CRITICAL]: Shadow vertices invisible to `colHasChain` — standard cells at shadow positions

**Generator's claim**: "With shadows already in `buildMergedRow` output [...] they flow naturally into `stripBot`/`stripTop`" and the existing `colHasChain` expansion covers shadow positions.

**Actual behavior**: The `colHasChain` marking logic ([OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1039-L1086)) marks columns based on (a) chain edges, (b) chain vertices at bot row via `rowChainVerts`, (c) chain vertices at top row via `rowChainVerts`. Shadow vertices are NOT chain vertices — they're not in `rowChainVerts`. They're marked `isChain: false` in `buildMergedRow`. So a shadow vertex at U=0.5123 does NOT trigger `colHasChain` for its column.

**Consequence**: Consider a chain vertex at row j, U=0.5123. The shadow propagates to rows j-1, j, and j+1 per Phase A. On row j-1, the shadow appears in `buildMergedRow(j-1)`. But if band (j-2, j-1) has no chain edges or chain vertices near column col(0.5123), then `colHasChain[col]` = 0 for that band. The band uses **standard cell triangulation** for the cell containing the shadow. Standard cells use only the 4 corner grid vertices ([OWT lines 1176-1216](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1176-L1216)) — the shadow vertex from `buildMergedRow` is **ignored entirely**. It exists in the merged row but is never referenced by any triangle.

Now consider band (j-1, j) where the chain vertex IS present. This band's CDT strip uses `buildMergedRow(j-1)` as `stripBot`, which includes the shadow at index S. The adjacent band (j-2, j-1) uses `buildMergedRow(j-1)` as `topRow`, but processes it through standard cell triangulation, which ONLY references `(j-1)*numU + i` grid indices — never any shadow index. **Result**: the shadow vertex S appears in CDT strip boundary but NOT in any triangle of the adjacent band. T-junction on the shared row.

**Counterexample**: Style with 10 chains, chain vertex at row 200, shadow propagated to row 199. Band (198, 199) has no chains → standard cells → shadow at row 199 unused. Band (199, 200) has chains → CDT strip → shadow at row 199 in stripBot boundary. T-junction at shadow position on row 199.

**Required fix**: Shadow vertices must only be created on rows that are already within the CDT strip range (i.e., rows that have `colHasChain` marked for the shadow's column). The Phase A propagation `[row-1, row, row+1]` is too aggressive — it projects shadows onto rows that may be processed as standard cells. Instead:

Either:
- **(Fix A)** After computing `rawColHasChain` but before the band loop, filter `rowShadowUs` to only include rows/columns where `colHasChain` would be active (considering expansion). This requires two-pass logic since `colHasChain` depends on `rawColHasChain` union with adjacent bands.
- **(Fix B, simpler)** Add shadow U-positions to the effective `colHasChain` marking. After Phase A, for each shadow at row r, U=su, mark `rawColHasChain` for bands (r-1) and (r) at column `bsearchFloor(unionU, su)`. This ensures both adjacent bands use CDT at the shadow column. The expansion then widens it further.

**Fix B** is the cleaner approach. Add ~10 lines after the existing `rawColHasChain` computation:

```typescript
// Mark columns containing shadow vertices as chain-involved
for (const [row, shadowList] of rowShadowUs) {
    for (const su of shadowList) {
        const col = bsearchFloor(unionU, su);
        const gc = col < 0 ? 0 : (col >= cellsPerRow ? cellsPerRow - 1 : col);
        // Shadow at row r affects bands (r-1, r) and (r, r+1)
        if (row > 0 && row - 1 < rawColHasChain.length) rawColHasChain[row - 1][gc] = 1;
        if (row < rawColHasChain.length) rawColHasChain[row][gc] = 1;
    }
}
```

This must be inserted **after** the `rawColHasChain` population loop but **before** the Pass 2 union and band iteration.

---

### C2 [CRITICAL]: Batch 6 global dedup excludes shadow vertices — CDT output references dedup'd-away grid vertices but shadows persist as orphans

**Generator's claim**: "Shadow indices are above all existing ranges. No existing code path checks `vIdx >= totalVertexCount + topDupCount`, so shadows are invisible to [...] Batch 6 global dedup."

**Actual behavior**: Batch 6 global dedup ([OWT lines 1490-1530](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1490-L1530)) iterates `for (let v = 0; v < totalVerts; v++)` where `totalVerts = totalVertexCount`. Shadow vertices have indices >= `totalVertexCount + rowBoundaryCvCount`, so they are indeed excluded from dedup.

**The problem is different from what the Generator analyzed**. The real issue: `buildMergedRow`'s dedup pass ([OWT lines 1008-1030](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1008-L1030)) will dedup shadow vertices against chain vertices at the same U-position. When chain vertex cv at U=0.5123 and shadow at U=0.5123 are on the same row, `buildMergedRow` sorts them together and the dedup pass runs:

```typescript
if (Math.abs(result[k].u - prev.u) <= 1e-6) {
    if (!prev.isChain && result[k].isChain) {
        batch2Remap.set(result[k].idx, prev.idx);
    } else if (prev.isChain && !result[k].isChain) {
        batch2Remap.set(prev.idx, result[k].idx);
        deduped[deduped.length - 1] = result[k];
    }
```

Shadow (isChain=false) + chain vertex (isChain=true) at same U: the chain vertex gets remapped to the shadow index via `batch2Remap`. This means the chain vertex is **replaced** by the shadow in the merged row. On the row where the chain vertex lives (row j), `buildMergedRow(j)` will contain the shadow vertex index at the chain's U-position, not the chain's own vertex index.

During strip construction, when processing this merged row as `botRow`, the strip loop checks `sv.isChain` to decide promotion. The shadow has `isChain: false`, so it goes to `stripBot` (boundary) instead of `stripInteriorVerts`. **This is actually correct behavior for the shadow** — that's the whole point. But the chain vertex that was remapped to the shadow index is now **lost from the boundary row**. The chain vertex's constraint edges reference its original index, which `batch2Remap` will remap to the shadow's index. Since the shadow is a boundary vertex in stripBot, constraint edges will have an endpoint on the boundary — which changes CDT topology compared to having the endpoint promoted to interior.

**Wait** — let me re-examine. The chain vertex at row j, U=0.5123 is in `rowChainVerts`. In `buildMergedRow(j)`, the chain vertex appears first (sorted by U). Then the shadow at the same U appears. The dedup pass keeps one: if chain comes first (prev=chain, current=shadow), then `batch2Remap.set(chain.idx, shadow.idx)` and `deduped` replaces chain with shadow. If shadow comes first (prev=shadow, current=chain), then `batch2Remap.set(chain.idx, shadow.idx)`. Either way, the chain vertex index is remapped to the shadow.

But in the strip construction loop, this row is processed as either botRow or topRow. The strip loop filters by `sv.isChain`: chain vertices are promoted to interior. Since the shadow replaced the chain vertex, no promotion happens at this U — the chain vertex effectively becomes a boundary vertex. **This means the chain vertex's constraint edges now reference a boundary vertex instead of an interior vertex.** CDT handles this fine (constraint edges between boundary vertices are just boundary edges), but the promoted-interior behavior that D-Radical depends on is broken.

**Counterexample**: Chain vertex cv at row j, U=0.5123. Shadow also at row j, U=0.5123 (because Phase A projects to rows [j-1, j, j+1], including the chain's own row). `buildMergedRow(j)` dedup replaces chain with shadow. In band (j, j+1), botRow has shadow (not chain) at U=0.5123. Shadow is not promoted to interior. The chain vertex is effectively dead — it appears in no strip as an interior vertex. Its constraint edges are remapped to the shadow, which is on the boundary. CDT no longer promotes the feature vertex to interior. The feature is ON the boundary, not tracked at PROMO_EPSILON offset. This changes the entire D-Radical topology that previous rounds carefully established.

**Required fix**: Phase A must NOT create shadow vertices on the chain vertex's own row. Shadows should only be created on adjacent rows (row ± 1). On the chain's own row, the chain vertex IS the feature — it doesn't need a shadow of itself. The shadow's purpose is to provide a boundary vertex aligned with the feature on the NEIGHBORING rows where the feature is promoted to interior.

Change Phase A:
```typescript
// Project shadow U onto ADJACENT rows only (not the chain's own row)
for (const targetRow of [row - 1, row + 1]) {  // removed 'row' from the list
    if (targetRow < 0 || targetRow >= numT) continue;
    // ...
}
```

This is the single most critical fix.

---

### C3 [CRITICAL]: Vertex array returned to caller includes uninitialized shadow slots

**Generator's claim**: "Total new code: ~80 lines. No deletions."

**Actual behavior**: The `vertices` Float32Array is allocated at [OWT line 861](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L861) and **returned as-is** at [line 1680](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1680): `return { vertices, indices, ... }`. The full array, including all shadow vertex slots, is passed to `evaluatePoints()` ([ParametricExportComputer.ts line 1449](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1449)) which uploads it to the GPU for UV→3D conversion.

With the Generator's allocation `(totalVertexCount + rowBoundaryCvCount + totalShadowCount) * 3`, the array is sized for the maximum shadow count. But `nextShadowIdx` may not reach `totalVertexCount + rowBoundaryCvCount + totalShadowCount` — unused slots remain zero-initialized (`Float32Array` default). These zero-filled vertices have UV = (0, 0, 0), which evaluates to a valid 3D position at the bottom of the pot (U=0, T=0). If any triangle index accidentally references these slots, it produces a triangle stretching to the pot bottom.

More importantly: the GPU evaluates ALL vertices in the array, including unused shadow slots. The evaluate_vertices shader processes `vertexCount = combinedVerts.length / 3` vertices ([ParametricExportComputer.ts line 261](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L261)). Unused shadow vertices at (0, 0, 0) are harmlessly evaluated — they produce valid 3D positions that are never referenced. **This is wasteful but not incorrect.**

However, there's a subtler problem: the seam filter at [ParametricExportComputer.ts lines 1405-1410](potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L1405-L1410) reads `outerVerts[v0 * 3]` for chain edges. If any chain edge index is accidentally remapped to a shadow index beyond the intended range, it reads from the correct part of the array (shadow vertices have valid UV). No out-of-bounds access.

**The actual correctness issue**: If `totalShadowCount` (conservative bound) is much larger than actual shadows used, the returned `vertices` array is bloated. This flows to `combinedVerts`, to GPU upload, to the read-back `resultData` (3D positions). The `combinedIdxs` (triangle indices) only reference valid vertices, so the extra 3D positions are harmless dead data. The resulting STL file is correct but the GPU does redundant work.

**Severity downgrade**: This is a WARNING, not CRITICAL. But for production quality:

**Required fix**: After the band loop completes and before returning, trim the vertices array to actual usage:

```typescript
const actualVertexCount = nextShadowIdx; // highest shadow index allocated + 1
if (actualVertexCount < vertices.length / 3) {
    const trimmed = new Float32Array(actualVertexCount * 3);
    trimmed.set(vertices.subarray(0, actualVertexCount * 3));
    return { vertices: trimmed, indices, ... };
}
```

Alternatively, allocate a tighter bound upfront. But trimming post-hoc is simpler and handles the conservative estimate gracefully.

**Severity revised: WARNING** (not functionally broken, but wastes GPU time and memory).

---

### C4 [WARNING]: `buildMergedRow` shadow-chain coincidence dedup direction is arbitrary

**Generator's claim**: The dedup in `buildMergedRow` handles coincident shadow+chain vertices correctly.

**Actual behavior**: As analyzed in C2, the dedup keeps the grid-type vertex (shadow, `isChain: false`) and remaps the chain vertex. But the dedup direction depends on insertion order: if shadow is inserted first in the interleave loop, the shadow is `prev` and the chain vertex is `current`. The Generator's Phase C code inserts shadows in a separate `while` loop before the chain `while` loop. After the sort pass, the relative order of shadow and chain at identical U depends on their insertion order (JavaScript's `Array.sort` is not guaranteed stable for equal keys in all engines, though modern V8 is stable).

**Risk**: If sort order flips, the dedup might keep the chain vertex instead of the shadow. Since the chain vertex has `isChain: true`, it gets promoted to interior during strip construction. The shadow is remapped to the chain index. Adjacent bands reference the chain's index, which appears as an interior vertex — breaking the shared boundary guarantee.

**Required fix** (per C2 fix): Remove shadows on the chain's own row entirely (eliminating the coincidence). For adjacent rows where no chain vertex exists, no coincidence occurs.

---

### C5 [WARNING]: Shadow vertex interaction with batch2Remap when shadow coincides with grid vertex

**Generator's claim**: Phase A filters shadows coincident with grid columns: "Remove shadows that coincide with existing grid columns."

**Actual behavior**: The filter uses `bsearchFloor(unionU, su)` and checks ±1 columns. This is correct for the pre-computed shadow U-positions. But after UV-snapping (which modifies grid vertex U-positions in the `vertices` array — visible in the buildMergedRow dedup comments at [lines 993-1000](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L993-L1000)), a grid vertex may have been snapped TO a chain vertex U-position. A shadow at that same U would not be filtered (the filter checks `unionU[col]`, the pre-snap positions).

When `buildMergedRow` runs, the UV-snapped grid vertex at U=0.5123 and the shadow at U=0.5123 are within 1e-6. The dedup pass resolves this: one survives, the other is batch2Remap'd. Since both are `isChain: false`, the "both grid or both chain" branch fires: `batch2Remap.set(result[k].idx, prev.idx)` — second one remaps to first. This is functionally correct but creates a dead shadow vertex index in the batch2Remap table.

**Impact**: Low. The remapped shadow is never referenced. The surviving vertex (either grid or shadow) appears in strips correctly. No T-junction because both have the same UV position.

**Required fix**: None mandatory. The existing dedup handles this case. But for clarity, consider also checking `vertices[gridIdx * 3]` (post-snap U) in the Phase A filter.

---

### C6 [WARNING]: Performance of shadow insertion in `buildMergedRow` — called (numT × 2) times

**Generator's claim**: "Total new code: ~80 lines. No deletions."

**Actual behavior**: `buildMergedRow` is called twice per band — once for botRow, once for topRow ([OWT lines 1090-1091](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1090-L1091)). With ~408 bands, that's ~816 calls. Each call now does an additional interleave pass with shadow vertices.

**But crucially**: `buildMergedRow(j)` is called as `topRow` for band (j-1, j) and as `botRow` for band (j, j+1). These are **separate calls producing separate arrays**. The merged row for row j is computed twice. This is the existing behavior (no caching). The shadow interleave adds a small constant to each call — `shadowList` is typically 0-5 entries per row. The sort+dedup pass dominates. No performance concern.

**Impact**: Negligible. No fix needed.

---

### C7 [WARNING]: Edge verification pass misses shadow vertex edges

**Generator's claim**: "Edge verification (OWT line 1490+) uses `totalVerts = totalVertexCount` cutoff to skip topDup. Shadow indices are above this range and are also skipped, which is correct." 

**Actual behavior**: The Batch 6 global dedup at [OWT line 1490](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1490) iterates `for (let v = 0; v < totalVerts; v++)` where `totalVerts = totalVertexCount`. Shadow vertices (index >= totalVertexCount + rowBoundaryCvCount) are excluded from dedup. This means if two shadow vertices at the same UV position exist (from different chain vertices projecting to the same row at nearly-the-same U), they will NOT be deduped by Batch 6.

The Phase A dedup (`SHADOW_DEDUP_U = 1e-6`) should prevent this: it deduplicates shadow U-positions per row before allocation. Two chain vertices at U=0.5123 and U=0.5124 would be deduped to a single shadow at U=0.5123 (if within 1e-6) or kept as two shadows (if beyond 1e-6). At 1e-6 tolerance, this is fine — two shadows 1e-6 apart in U are distinct vertices.

**Concern**: Are there scenarios where two shadows end up at exactly the same UV after `buildMergedRow`'s dedup? If shadow A at U=0.51230001 and shadow B at U=0.51230002 both survive Phase A dedup (they're 1e-8 apart, within 1e-6 threshold, so one is removed). Actually wait — the dedup threshold is 1e-6, and these are within that, so only one survives. Correct.

**Real risk**: `buildMergedRow`'s sort+dedup uses 1e-6 threshold. Phase A uses 1e-6. These match. But Batch 6 uses `1e-5` quantization. A shadow at U=0.50005 and a grid vertex at U=0.50006 are distinguishable at 1e-6 but merge at 1e-5 quantization. Batch 6 would merge them — but since Batch 6 excludes shadow indices, it won't. The grid vertex stays, the shadow stays, both at nearly-the-same U. CDT may produce thin triangles between them.

**Impact**: Very edge-case. The Phase A grid-column filter should catch most of these. Residual cases produce mild quality degradation, not incorrectness.

**Required fix**: None mandatory. Consider adding shadows to the Batch 6 dedup range if quality issues arise.

---

### C8 [INFO]: Generator's metric improvement estimates are optimistic

**Generator's claim**: "The 4:1 threshold violation count should drop from 45.1% to <15%."

**Analysis**: The `45.1%` figure includes ALL chain strip triangles, not just chain→boundary fan triangles. Many violations come from companion-to-companion edges (ultra-thin T-ring shells at fraction 0.04) and chain-to-chain lateral connections. Shadows only fix the chain→boundary fan pattern. The companion shells still produce thin triangles among themselves (shell 0.04 has ring height = 0.04 × PROMO_ε × tGap ≈ 0.000005, while ring width ≈ companion spread). These aspect ratios are independent of shadow placement.

**Revised estimate**: Shadows fix the **dominant** failure mode but not the only one. Realistic expectation: 45.1% → 20-30% (not <15%). The remaining violations come from ultra-near companion shells (0.04, 0.09) and chain-to-chain connections in densely-chained regions.

**Impact**: Informational only. The fix is still the single highest-impact change. Managing expectations prevents a "it didn't work" reaction when violations drop by only 50% instead of 67%.

---

## Accepted Items

### A1: Q1b strategy (pre-insert into `buildMergedRow`) — ACCEPTED

The approach of integrating shadows into `buildMergedRow` rather than per-strip injection is correct. It guarantees shared vertex indices across adjacent bands' CDT strips. Evidence: `buildMergedRow` is called for each row independently, and both adjacent bands consume the same output array. If shadows are in the merged row, both bands have them with the same vertex indices. Verified at [OWT lines 1090-1091](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1090-L1091).

### A2: Shadow vertices as `isChain: false` — ACCEPTED

Shadows must NOT be promoted to interior (they're boundary alignment vertices, not features). Marking `isChain: false` ensures they flow into `stripBot`/`stripTop` during strip construction at [OWT lines 1218-1245](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1218-L1245). The strip construction loop correctly routes `isChain: true` to `stripInteriorVerts` and `isChain: false` to `stripBot`/`stripTop`.

### A3: Vertex index layout — ACCEPTED (with C3 amendment)

The proposed layout `[grid | chain+companion | topDup | shadow]` is clean and non-overlapping. Shadow indices are strictly above all existing ranges. No existing code path interprets indices in the shadow range as chain or grid vertices. Verified: `batch2Remap` operates on chain indices ([OWT lines 942-946](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L942-L946)), `topDupMap` operates on row-boundary chain indices ([OWT lines 883-897](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L883-L897)), and Batch 6 dedup iterates only up to `totalVertexCount` ([OWT line 1490](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1490)).

### A4: No changes needed to ChainStripTriangulator — ACCEPTED

CDT boundary construction at [ChainStripTriangulator.ts lines 212-223](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L212-L223) iterates consecutive `bot[i]`/`top[i]` pairs. Adding shadow vertices to `stripBot`/`stripTop` simply creates additional boundary edge segments. The `globalToLocal` map ([ChainStripTriangulator.ts line 160](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L160)) accepts any vertex index. The `addEdge` dedup set ([ChainStripTriangulator.ts line 205](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L205)) prevents duplicate edges. No changes needed.

### A5: Constraint edge handling unaffected — ACCEPTED

Constraint edges reference chain vertex indices (or their topDup remaps). Shadow vertices are never constraint endpoints. The constraint endpoint injection at [OWT lines 1328-1360](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1328-L1360) checks `vIdx < gridVertexCount` and `vIdx >= totalVertexCount` with chain vertex resolution via `allChainVertices[vIdx - gridVertexCount]`. Shadow indices fall in neither range (they're above `totalVertexCount + rowBoundaryCvCount`), so the injection code skips them. The code also checks if the constraint endpoint is already in `stripBot`, `stripTop`, or `stripInteriorVerts` — shadows will be in `stripBot`/`stripTop` by this point, but they're never constraint endpoints, so the check is never triggered for shadows.

### A6: P2/P3 deferral — ACCEPTED

Deferring boundary subdivision and shell rebalancing until P1 is measured is correct engineering. P1 addresses the dominant defect; measuring before stacking changes prevents debugging compound interactions.

---

## Open Questions for Generator

1. **Shadow propagation to boundary rows (row 0, row numT-1)**: Phase A propagates to `row ± 1`, but doesn't check if the target row is a boundary of the entire mesh (top/bottom of the pot). Row 0 and row numT-1 are mesh boundaries — do they participate in CDT strips? If not, shadows on those rows are wasted allocations. Low impact, but worth guarding.

2. **Seam handling**: A chain vertex at U ≈ 0 or U ≈ 1 (near the seam) creates a shadow. The shadow at U ≈ 0 on an adjacent row should be fine (seam cells are already skipped via `SEAM_GUARD`). But does the Phase A grid-column filter correctly handle U < unionU[0] or U > unionU[numU-1]? The `bsearchFloor` may return -1 for U values below the grid range.

3. **Shadow vertex count diagnostic**: The proposal should log shadow vertex statistics (allocated vs. used, per-row distribution) for debugging. A single `console.log` after Phase B would suffice.

---

## Implementation Conditions (for Executioner)

The following amendments are MANDATORY for implementation:

### Condition 1: Remove self-row shadow projection (C2 fix)
Phase A must NOT create shadows on the chain vertex's own row. Change:
```typescript
// BEFORE (Generator's proposal):
for (const targetRow of [row - 1, row, row + 1]) {
// AFTER (corrected):
for (const targetRow of [row - 1, row + 1]) {
```
This eliminates the catastrophic coincidence between chain vertex and its own shadow, preserving D-Radical promotion behavior.

### Condition 2: Mark shadow columns in `rawColHasChain` (C1 fix)
After the existing `rawColHasChain` population loop (after [OWT line 1086](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1086)) and before the Pass 2 union, add:
```typescript
for (const [row, shadowList] of rowShadowUs) {
    for (const su of shadowList) {
        const col = bsearchFloor(unionU, su);
        const gc = col < 0 ? 0 : (col >= cellsPerRow ? cellsPerRow - 1 : col);
        if (row > 0 && row - 1 < rawColHasChain.length) rawColHasChain[row - 1][gc] = 1;
        if (row < rawColHasChain.length) rawColHasChain[row][gc] = 1;
    }
}
```
This ensures both adjacent bands at a shadow row use CDT instead of standard cell triangulation.

### Condition 3: Trim or right-size the vertex array (C3 fix)
Before returning from `buildCDTOuterWall`, trim the `vertices` array to `nextShadowIdx * 3` elements (or the original `(totalVertexCount + rowBoundaryCvCount) * 3` if no shadows were created). This prevents GPU waste evaluating dead zero-filled vertices.

### Condition 4: Add shadow statistics logging
After shadow allocation (end of Phase B), log:
```typescript
console.log(`[CDT] Shadow boundary enrichment: ${totalShadowCount} shadows pre-computed, ${nextShadowIdx - (totalVertexCount + rowBoundaryCvCount)} allocated`);
```

### Condition 5: Ordering guarantee
The Phase C `buildMergedRow` integration must insert shadows with `isChain: false` and `gridCol` set to the bsearchFloor column. The existing sort+dedup handles ordering. But ensure the shadow→chain dedup direction is tested: add a diagnostic counter for shadow-chain dedup events to catch the C4 scenario (this should now be zero with the C2 fix removing self-row shadows).

---

## Validation Protocol (for Executioner)

After implementation, verify:

1. **No T-junctions**: Run a full export at d8/e4. Count non-manifold edges in the output STL. Must be 0 (same as before shadows).

2. **Shadow vertex usage rate**: Log `totalShadowCount` vs. actual shadows referenced by at least one triangle. Expect >95% usage rate (unused shadows indicate C1-type bugs).

3. **D-Radical promotion preserved**: Chain vertices on their own rows must still be promoted to interior (verify by checking `stripInteriorVerts` contains chain vertices with `isChain: true` and `promotedT` set). The C2 fix ensures shadows don't replace chain vertices on their own row.

4. **Aspect ratio improvement**: The 45.1% > 4:1 violation rate should drop. Accept any result < 35% as evidence the shadow mechanism works. Expectation: 20-30% (per C8 analysis).

5. **Edge enforcement**: The `enforced` count for chain edges should remain the same or improve (shadows don't affect constraint edges). `missing` count should not increase.

6. **STL file size**: Should increase by < 1% (shadow vertices add a few hundred vertices to a ~300K vertex mesh).

---

## Final Notes

The Generator's core idea is correct and well-motivated. The mathematical analysis of CDT behavior with aligned boundary vertices is sound. The Q1b strategy is the right approach. The three critical issues (C1, C2, C3) are implementation bugs that can be fixed with ~20 lines of code. The overall complexity estimate of "~80 lines" is reasonable after amendments.

**Overall verdict: ACCEPT WITH AMENDMENTS (C1 fix, C2 fix, C3 fix mandatory; C4-C7 monitored)**
