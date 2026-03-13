# Executioner Review — R34 Cell-Local Quad Splitting

Date: 2026-03-07

## Verdict: FEASIBLE WITH NOTES

The plan is implementable as specified with the Verifier's mandatory amendments (A1–A4). I found **3 critical corrections** to Generator line numbers, **1 blocking dependency issue** (cdt2d cannot be removed), and **2 integration-level surprises** that the plan doesn't mention. None are showstoppers. The changeset is large but atomic — it replaces one self-contained triangulation strategy with another, touching the same file boundaries.

---

## Line Number Verification

The Generator's proposal references specific OWT line numbers from before R31-R33 modifications. I verified every cited reference against the current codebase (OWT = 2040 lines, CST = 648 lines).

| Generator Reference | Cited Lines | Actual Lines (Current) | Status |
|---|---|---|---|
| Section 1: Chain vertex creation | ~446–560 | **446–558** | ✅ Accurate (off by 2 at end) |
| Chain edge recording | ~553 | **553–558** (push at 556) | ✅ Accurate |
| Row-gap interpolation | ~504–535 | **504–535** | ✅ Accurate |
| Section 1.5: Companion generation | ~566–830 | **563–830** (start offset 3) | ⚠️ Minor drift — starts at companion const declarations line 563 |
| `interiorByBand` construction | ~840–860 | **838–858** | ⚠️ Minor drift (-2) |
| Shadow boundary enrichment | ~870–915 | **865–912** | ⚠️ Minor drift (-5 to -3) |
| Vertex buffer allocation | ~900–950 | **916–956** (allocation) + **957–973** (topDupMap) | ⚠️ Shifted +16–23 |
| `topDupMap` / `topDupReverse` | ~946–960 | **957–973** | ⚠️ Shifted +11 |
| Shadow vertex allocation | ~961–975 | **976–991** | ⚠️ Shifted +15 |
| `rowChainVerts` construction | ~980–995 | **993–1002** | ⚠️ Shifted +13 |
| `rawColHasChain` computation | ~1120–1195 | **1131–1202** | ⚠️ Shifted +7–11 |
| `colHasChain` expansion | ~1230–1250 | **1230–1245** | ✅ Accurate |
| `emitStandardCell()` definition | ~1255–1290 | **1253–1290** | ✅ Accurate |
| `buildMergedRow()` function | ~1035–1115 | **1035–1121** | ✅ Accurate |
| `batch2Remap` declaration | ~1032 | **1032** | ✅ Exact |
| Main cell loop start | ~1295 | **1292** (seam check) → **1305** (colHasChain branch) | ✅ Close |
| Chain strip detection loop | ~1300–1800 | **1305–1800** | ✅ Accurate |
| `triangulateChainStrip()` call | ~1790 | **1790** | ✅ Exact |
| Cross-cell edge count | ~1830 | **1806–1816** | ⚠️ Shifted -14 |
| Batch 2 remap on allChainEdges | ~1835 | **1822–1831** | ⚠️ Shifted -13 |
| Batch 6 global dedup | ~1810–1860 | **1835–1894** | ⚠️ Shifted +25 on start |
| Chain edge verification | ~1860–2000 | **1900–1997** | ⚠️ Shifted +40 |
| Final result assembly | ~2020–2040 | **2028–2040** | ✅ Accurate |

**Summary**: Most references are within ±15 lines of actual. The largest drifts are in the post-emission sections (batch6, edge verification) where ±25-40 lines of shift have accumulated from R31-R33. No reference is wrong enough to cause an implementation error — the blocks are identifiable by their content, not line numbers alone.

---

## Deletion Boundary Map

### Block 1: Section 1.5 — Companion Generation System
**Current lines: 563–858**
**Must delete**: Lines 563–858 entirely (296 lines)

Contents:
- `companionVertices` array and all constants (SEAM_COMPANION_GUARD, COMPANION_DEDUP_THRESHOLD, ASPECT_MATCH_FACTOR, etc.) — lines 563–585
- `constraintsByBand` spatial index — lines 597–611
- `isNearConstraintEdge()` — lines 614–632
- `tryEmitCompanion()` — lines 635–652
- `emitRungs()` — lines 655–682
- `emitUGradedFan()` — lines 685–751
- Spatial-bucket dedup system (`companionBuckets`, `isDuplicate2D`, `addToBuckets`) — lines 754–796
- Companion generation loop — lines 800–830
- `allChainVertices` / `allChainEdges` assembly — lines 832–833

**Interleaved dependencies**:
- `allChainVertices` (line 832) is used extensively below. After deletion, `allChainVertices === chainVertices` (no companions). The declaration `const allChainVertices = chainVertices;` or direct use of `chainVertices` replaces it.
- `allChainEdges` (line 833) is just `chainEdges`. Same alias, can be collapsed.

**Risk**: LOW — this is a self-contained block that feeds exclusively into the CDT strip system.

### Block 2: `interiorByBand` Construction
**Current lines: 838–858**
**Must delete**: Lines 838–858 (21 lines)

Contents: Buckets 2D interior companion vertices by T-position band for CDT.

**Interleaved dependencies**: `interiorByBand` is referenced only at line 1581 (collecting interior companions for CDT strip). Deleted with the strip system.

**Risk**: LOW — pure CDT feeder.

### Block 3: Shadow Boundary Enrichment
**Current lines: 862–912 (rowShadowUs filtering + totalShadowCount)**
**Must delete**: Lines 862–912 (51 lines)

Contents: `rowShadowUs` filtering against grid columns, `totalShadowCount` calculation.

**Interleaved dependencies**:
- `rowShadowUs` is referenced in `buildMergedRow()` (line 1084, shadow vertex insertion) and at line 1193 (marking shadow columns in `rawColHasChain`). Both are deleted.
- `totalShadowCount` feeds vertex buffer sizing (line 920). Buffer sizing changes.
- `shadowVertexMap` (lines 976–991) is used in `buildMergedRow()` — also deleted.

**Risk**: LOW — fully contained in the strip system path.

### Block 4: Vertex Buffer Oversizing (companion/shadow/topDup slack)
**Current lines: 916–991**
**Must modify (not fully delete)**: The vertex allocation at line 920 includes companion, shadow, and boundary companion slack. The `topDupMap`, `topDupReverse`, and shadow vertex sections are deletable.

Specific deletions within this block:
- `rowBoundaryCvCount` calculation (line 919) — DELETE
- `boundaryCompanionSlack` (line 922) — DELETE
- `totalShadowCount` in allocation formula (line 923) — MODIFY: allocate only `gridVertexCount + chainVertices.length + crossColumnSlack`
- `topDupMap` / `topDupReverse` / `nextDupIdx` (lines 957–973) — DELETE (66 lines including duplicate vertex emission)
- Shadow vertex allocation loop (lines 976–991) — DELETE

**Keep**: Grid vertex emission loop (lines 926–932) and chain vertex emission loop (lines 935–940). Both are unchanged.

**Risk**: MEDIUM — buffer sizing must be correct. New formula: `gridVertexCount + chainVertices.length + maxCrossColumnVertices` where `maxCrossColumnVertices = chainEdges.length * 3` (conservative upper bound).

### Block 5: `rawColHasChain` / `colHasChain` / Expansion System
**Current lines: 1131–1245**
**Must delete**: Lines 1131–1245 (115 lines)

Contents:
- `rawColHasChain` per-band bitmap construction (1131–1180)
- Shadow column marking in `rawColHasChain` (1184–1196)
- `colHasChain` union pass (1204–1228)
- Horizontal expansion (1230–1245)

**Interleaved dependencies**: `colHasChain` drives the strip detection loop (line 1305 `if (!colHasChain[i])`). This is replaced by `cellChainMap.has(key)`.

**Risk**: LOW — self-contained strip detection preprocessing.

### Block 6: `buildMergedRow()` Function
**Current lines: 1035–1121**
**Must delete**: Lines 1035–1121 (87 lines)

Contents: Interleaves grid and chain vertices into merged rows for CDT strips.

**CRITICAL dependency**: `batch2Remap` is populated inside this function (lines 1055–1056, 1104–1112). The Verifier's Amendment A1 requires extracting the merge-detection logic into a standalone pre-pass BEFORE `cellChainMap` construction. The `buildMergedRow` function also performs shadow vertex insertion and sort+dedup — these are strip-specific and can be deleted.

**Risk**: HIGH — `batch2Remap` extraction is mandatory (A1). The pre-pass must scan `rowChainVerts` against `unionU` with threshold and populate `batch2Remap` before `cellChainMap` construction.

### Block 7: Strip Detection and Assembly Loop
**Current lines: 1305–1800**
**Must delete**: Lines 1305–1800 (496 lines)

Contents:
- `segStart/segEnd` contiguous segment detection
- Band span narrowing (`segBandMin/segBandMax`)
- Row emission for non-strip bands
- `stripBot/stripTop/stripInteriorVerts` assembly
- Boundary companion injection (R31)
- Boundary column constraints (R31)
- Crossing constraint detection (P5)
- `triangulateChainStrip()` call

**Interleaved dependencies**:
- `emitStandardCell()` is defined inside this block (lines 1253–1290, inside the `for (let bandStart = ...)` loop). **CRITICAL**: `emitStandardCell` will be extracted and reused, not deleted.
- The loop structure `for (let bandStart = ...)` at line 1218 is the outer windowing loop. With per-band CDT (MAX_CDT_BANDS=1), this is effectively `for (let j = 0; j < totalBands; j++)`. The new cell loop replaces the inner `while (i < cellsPerRow)` loop.

**Risk**: MEDIUM — the `emitStandardCell` definition must be preserved and possibly moved up. Currently it closes over `vertices`, `indexBuf`, `quadMap`, `numU`, `windingFixCount` — all of which remain available in the replacement.

### Block 8: `buildMergedRow` and row-level diagnostics
**Lines 993–1030**: `rowChainVerts` construction, `totalCells`, `indexBuf`, `quadMap` initialization, diagnostic counters.
**Keep most of this**: `rowChainVerts` is still needed for `batch2Remap` pre-computation and `cellChainMap` construction. `totalCells`, `indexBuf`, `quadMap` are keep. Most diagnostic counters can be simplified.

Remove: `chainStripStats = createEmptyStats()` (line 1011), `rowBandEdges` map (lines 1015–1027) — partially keep, needed for cellChainMap edge registration.

---

## Amendment Implementation Details

### A1 [MANDATORY]: Pre-compute batch2Remap before cellChainMap

**Exact insertion point**: After line 1002 (end of `rowChainVerts` construction), before `cellChainMap` construction.

**Variables needed**:
- `rowChainVerts` — available (built at lines 993–1002) ✅
- `unionU` — function parameter ✅
- `chainVertices` — available (built in Section 1) ✅
- `bsearchFloor` — imported ✅
- `gridVertexCount` — computed at line 441 ✅
- `numU` — computed at line 441 ✅

**New threshold constant**: 1e-4 (Verifier recommendation A2-Option B: keep at 1e-4 and accept 2-5° min angles).

However, examining the current `buildMergedRow` code more carefully (lines 1045–1056), the merge logic is:
```typescript
if (Math.abs(chainList[ci].u - unionU[i]) <= 1e-6) {
    // ... merge
    batch2Remap.set(chainList[ci].vertexIdx, gridIdx);
}
```

The pre-computation must iterate `rowChainVerts` per row, compare each chain vertex U against `unionU[col]` and `unionU[col+1]`:

```typescript
const MERGE_THRESHOLD = 1e-4; // R34: coarsened from 1e-6
const batch2Remap = new Map<number, number>();

for (const [row, chainList] of rowChainVerts) {
    for (const cv of chainList) {
        const col = bsearchFloor(unionU, cv.u);
        // Check left column
        if (col >= 0 && col < numU && Math.abs(cv.u - unionU[col]) <= MERGE_THRESHOLD) {
            batch2Remap.set(cv.vertexIdx, row * numU + col);
        }
        // Check right column
        else if (col + 1 < numU && Math.abs(cv.u - unionU[col + 1]) <= MERGE_THRESHOLD) {
            batch2Remap.set(cv.vertexIdx, row * numU + (col + 1));
        }
    }
}
```

**Verification**: `unionU`, `chainVertices`, `bsearchFloor` are all available at the insertion point. ✅

### A2 [MANDATORY]: Revise min-angle claim

The Verifier recommends Option B: keep threshold at 1e-4 and document ~2-5° worst case. **No code change needed** — documentation only. The implementation should use `MERGE_THRESHOLD = 1e-4`.

### A3 [MANDATORY]: Maintain quadMap for chain cells

**Implementation**: In `emitChainCell()`, set `quadMap[band * cellsPerRow + col] = indexBuf.length` at the START of emission (before pushing any triangles). This records the offset to the first chain-cell triangle.

**Alternatively**: Set to `-1` to match current CDT behavior. The mesh optimizer (`ChainStripOptimizer.ts`) works on the full index buffer and doesn't use `quadMap` for chain cells — it uses the chain edge graph. The boundary diagonal optimizer uses `quadMap` to locate standard cells for diagonal flipping. Setting chain cells to `-1` is safe and consistent with current behavior.

**Recommendation**: Set `quadMap[band * cellsPerRow + col] = -1` for chain cells, matching current convention. The standard cell path (`emitStandardCell`) continues to set `quadMap[quadIdx] = triBase`. This is the lowest-risk approach.

### A4 [MANDATORY]: Handle batch2Remap'd chain edge endpoints

**Implementation location**: During `cellChainMap` construction, after batch2Remap pre-computation.

**Two-part implementation**:

1. **Remap chain edge endpoints** (before cellChainMap edge registration):
```typescript
for (let e = 0; e < chainEdges.length; e++) {
    const [v0, v1] = chainEdges[e];
    const m0 = batch2Remap.get(v0);
    const m1 = batch2Remap.get(v1);
    if (m0 !== undefined || m1 !== undefined) {
        chainEdges[e] = [m0 ?? v0, m1 ?? v1];
    }
}
```

**Verification**: `chainEdges` is declared at line 451 as `const chainEdges: Array<[number, number]> = [];`. This is a plain array of tuples — **mutable**. Elements can be replaced in place via index assignment. ✅

2. **Handle grid-corner chain edge endpoints in constrainedSweepCell**: When a remapped endpoint IS a cell corner (BL, BR, TL, TR), `bot.indexOf(v0)` will find it at position 0 or `bot.length-1`. This is the standard partition boundary case — the chain edge goes from a corner to a mid-edge point, producing one triangle on the short side and a sub-quad on the other. The sweep handles this correctly (fan from single point on one edge).

---

## Integration Risks

### Risk 1: `allChainVertices` vs `chainVertices` (MODERATE)

Post-deletion, `allChainVertices` (currently `[...chainVertices, ...companionVertices]`) becomes just `chainVertices`. The code below Section 1.5 extensively uses `allChainVertices`:
- `rowBandEdges` construction (line 1015): `allChainVertices[v0 - gridVertexCount]` — must become `chainVertices[v0 - gridVertexCount]`
- `rawColHasChain` (line 1151): same pattern — deleted with Block 5
- Strip assembly (line 1356+): deleted with Block 7
- Cross-cell edge count (line 1806): `allChainVertices[v0 - gridVertexCount]` — must update
- Edge verification (line 1900+): `allChainVertices` extensively — must update
- `chainVertexChainIds` (line 2007): iterates `allChainVertices` — must update

**Solution**: After deleting companions, declare `const allChainVertices = chainVertices;` as a simple alias for minimum code churn in the post-emission sections. Or do a find-replace of `allChainVertices` → `chainVertices`.

### Risk 2: `topDupMap` / `topDupReverse` Removal Impact (MODERATE)

These maps are used for:
1. Vertex buffer allocation of duplicate indices (lines 957–973) — DELETED
2. Strip top-row assembly (line 1451, `topDupMap.get(sv.idx)`) — DELETED
3. Constraint remapping in strip assembly (lines 1559–1573) — DELETED
4. Edge verification: `topDupReverse` aliases (lines 1908–1921) — **MUST SIMPLIFY**
5. `chainVertexChainIds` mapping (lines 2010–2013) — **MUST REMOVE topDup entries**
6. `inverseRemap` construction (line 1956–1958) — **MUST REMOVE topDup entries**

Without `topDupMap`, the cell-local system uses the SAME chain vertex index in adjacent bands. This is correct because cell-local triangulation shares grid vertices at cell boundaries by construction — there's no CDT-level non-manifold risk.

**Solution**: Remove all `topDupMap`/`topDupReverse` references. The edge verification section simplifies significantly — no alias expansion needed.

### Risk 3: `cdt2d` Dependency — CANNOT Be Removed (CRITICAL CORRECTION)

**The Generator proposes removing the `cdt2d` npm dependency. This is WRONG.**

`cdt2d` is imported by TWO files:
1. `ChainStripTriangulator.ts` (line 22) — being deleted ✅
2. `src/utils/geometry/ConstrainedTriangulator.ts` (line 5) — **NOT BEING DELETED** ❌

`ConstrainedTriangulator.ts` uses `cdt2d` at lines 1379–1389 for general-purpose constrained Delaunay triangulation (cap geometry, base geometry). This is completely outside the parametric pipeline.

**Resolution**: Keep `cdt2d` in `package.json`. Only remove the import from `ChainStripTriangulator.ts` (by deleting the file). Also keep `src/types/cdt2d.d.ts`.

### Risk 4: `segmentsCross` is Retained (NO RISK)

`segmentsCross` (line 140) is a top-level function used only in the crossing constraint removal block (line 1764). The crossing constraint removal is deleted with Block 7. However, `segmentsCross` is a standalone utility with no side effects — it can be left in place or deleted. Recommend: leave it for now, clean up in a future pass if ESLint flags it as unused.

**CORRECTION**: ESLint will flag it as unused if no code references it. Must either delete it or add an `// eslint-disable-next-line` or mark as `@internal`. Better to delete it since `npm run lint` must be clean.

### Risk 5: `rowBandEdges` Map (MODERATE)

The current `rowBandEdges` map (lines 1015–1027) indexes chain edges by row band. The cellChainMap construction ALSO needs to index chain edges by row band. The Generator's proposal rebuilds this logic inside the cellChainMap construction loop.

**Recommendation**: Keep the `rowBandEdges` construction code (or a simplified version) and use it as the data source for `cellChainMap.chainEdges`. Don't rebuild the `(cv0, cv1)` lookup twice.

### Risk 6: `emitStandardCell` Scoping (LOW)

Currently `emitStandardCell` is defined **inside** the `for (let bandStart = ...)` loop (line 1253). It closes over:
- `vertices` — function-level scope ✅
- `indexBuf` — function-level scope ✅
- `quadMap` — function-level scope ✅
- `numU` — function-level scope ✅
- `windingFixCount` — declared at line 1007, function-level scope ✅

The function can be moved up to any point after these variables exist (after line 1007). The new cell loop will call `emitStandardCell(band, col)` with the same semantics.

### Risk 7: `chainStripConfig` Parameter Becomes Dead (LOW)

`buildCDTOuterWall` takes `chainStripConfig: ChainStripConfig` as parameter 7. After R34, this parameter is unused (no CDT, no expansion, no density multiplier). However:
- The caller in `ParametricExportComputer.ts` (line 1320) constructs and passes this object.
- `PipelineStageConfig` in `types.ts` has 5 chain-strip fields (lines 111–119).

**Resolution options**:
1. Keep the parameter but ignore it (backward compatible, zero caller changes)
2. Remove parameter + update caller + update `PipelineStageConfig` type (clean but wider blast radius)

**Recommendation**: Option 1 for this round. Deprecate the parameter with a comment. Clean up in a follow-up.

### Risk 8: `ChainStripOptimizer` Still Referenced (LOW)

`ParametricExportComputer.ts` imports `optimizeChainStrips` and `computeChainStrip3DQuality` from `ChainStripOptimizer.ts` (lines 78–83). These are post-tessellation optimization passes that operate on the index buffer and vertex buffer generically — they don't depend on CDT or ChainStripTriangulator. They should continue to work unchanged on the new cell-local triangulated mesh.

`ChainStripOptimizer.ts` does NOT import from `ChainStripTriangulator.ts`. ✅ No impact.

---

## Implementation Sequence

The changeset must be atomic — the pipeline should not be in a broken intermediate state. Recommended execution order:

### Phase 1: Add New Code (non-breaking additions)

1. **Pre-compute batch2Remap** (Amendment A1)
   - Insert after line 1002 (end of `rowChainVerts` construction)
   - ~15 lines of new code
   - Apply batch2Remap to `chainEdges` array (A4 part 1)
   - ~8 lines of new code

2. **Build `cellChainMap`** (new data structure)
   - Insert after batch2Remap pre-computation
   - Use `rowChainVerts` for vertex assignments
   - Use `rowBandEdges` (or inline equivalent) for edge assignments
   - Sort chain vertices within each cell by U
   - ~60 lines of new code

3. **Implement `emitTriCCW()`** (new helper)
   - Top-level function or local function
   - Cross-product winding check, 3 index pushes
   - ~15 lines

4. **Implement `sweepQuad()`** (new triangulation primitive)
   - Two-pointer sweep with `emitTriCCW`
   - ~30 lines

5. **Implement `constrainedSweepCell()`** (partition + sweep)
   - Chain edge partition logic + per-sub-quad `sweepQuad` calls
   - ~50 lines

6. **Implement `emitChainCell()`** (cell-local dispatch)
   - Build bot/top edge arrays, dispatch to sweepQuad or constrainedSweepCell
   - Handle cross-column intersection vertices (create them, add to vertex buffer)
   - Set `quadMap[...] = -1` for chain cells (A3)
   - ~60 lines

### Phase 2: Replace Cell Loop (swap in new code, swap out old)

7. **Move `emitStandardCell()` definition** above the cell loop
   - Currently inside the `for (let bandStart = ...)` loop body
   - Move to function-level scope (after line 1007)
   - No semantic change — same closures

8. **Replace the main cell loop**
   - Delete: `rawColHasChain`, `colHasChain`, expansion (Block 5: lines 1131–1245)
   - Delete: the windowed loop `for (let bandStart = ...)` (lines 1218ff), strip detection `while (i < cellsPerRow)` (lines 1305–1800)
   - Insert: simple `for (let band = 0; band < totalBands; band++) { for (let c = 0; c < cellsPerRow; c++) { ... } }` loop
   - The new loop dispatches to `emitStandardCell(band, c)` or `emitChainCell(band, c, info)`

### Phase 3: Delete Old Code

9. **Delete companion system** (Block 1: lines 563–858)
   - Replace `allChainVertices` with `chainVertices` (or alias)
   - Replace `allChainEdges` with `chainEdges` (or alias)

10. **Delete `interiorByBand`** (Block 2: lines 838–858)

11. **Delete shadow enrichment** (Block 3: lines 862–912)

12. **Simplify vertex buffer allocation** (Block 4: lines 916–991)
    - Remove companion/shadow/topDup slack from allocation formula
    - Delete `topDupMap` / `topDupReverse` / `nextDupIdx` blocks
    - Delete shadow vertex allocation loop

13. **Delete `buildMergedRow()`** (Block 6: lines 1035–1121)
    - Already replaced by batch2Remap pre-pass + cellChainMap

14. **Delete `segmentsCross()`** (lines 140–165, if unused after loop removal)

### Phase 4: Simplify Post-Emission Code

15. **Simplify edge verification** (lines 1900–1997)
    - Remove `topDupReverse` alias expansion
    - Remove `topDupReverse` entries from `inverseRemap`
    - `allChainVertices` → `chainVertices`

16. **Simplify `chainVertexChainIds`** (lines 2007–2013)
    - Remove topDupMap entries

17. **Simplify final vertex trimming** (line 2034)
    - `nextShadowIdx` no longer exists; use `nextVertexIdx` (which tracks all vertex allocations including cross-column intersection vertices)

### Phase 5: Remove External Dependencies

18. **Delete `ChainStripTriangulator.ts`** (648 lines)
19. **Delete `ChainStripTriangulator.test.ts`**
20. **Remove imports** from OWT (lines 14–20): `triangulateChainStrip`, `createEmptyStats`, `DEFAULT_CHAIN_STRIP_CONFIG`, `ChainStripConfig`
21. **Clean up `ParametricExportComputer.ts`**
    - Remove `import { DEFAULT_CHAIN_STRIP_CONFIG } from './parametric/ChainStripTriangulator'` (line 73)
    - Either keep or remove chain strip config construction at lines 434–437. If keeping `buildCDTOuterWall` parameter signature: keep and pass (ignored). If changing signature: remove.
22. **DO NOT remove `cdt2d` from `package.json`** — still used by `ConstrainedTriangulator.ts`
23. **Clean up `types.ts`**: `ChainStripMode` (line 15) and the 5 pipeline config fields (lines 111–125) become dead. Mark as deprecated or remove with caller updates.

### Phase 6: Update Diagnostics and Tests

24. **Update diagnostic logging** — replace CDT-specific logs with cell-local metrics: cellChainMap size, cross-column intersection count, chain cells emitted, batch2Remap count
25. **Write replacement tests** for `sweepQuad`, `constrainedSweepCell`, `emitChainCell`
26. **Update OWT tests** — existing tests should pass unchanged (no-chain scenarios are identical). Chain-involved tests will produce different (better) output.
27. **Run full validation protocol** per Verifier specification

---

## Test Impact Analysis

### Tests Being Deleted (ChainStripTriangulator.test.ts)

| Test | Coverage Lost | Replacement Needed |
|---|---|---|
| `createEmptyStats` — zeroed stats | Config/stats API | Not needed — type deleted |
| `DEFAULT_CHAIN_STRIP_CONFIG` — default values | Config constants | Not needed — constant deleted |
| CDT mode — simple strip | CDT triangulation | ✅ Replace with sweepQuad unit test |
| CDT mode — constraint enforcement | Constraint edges as mesh edges | ✅ Replace with constrainedSweepCell test |
| CDT mode — cross-row constraints | Chain edge enforcement | ✅ Replace with emitChainCell integration test |
| CDT mode — <3 vertices | Degenerate input | ✅ Replace with empty cell handling test |
| CDT mode — CCW winding | Winding correctness | ✅ Replace with emitTriCCW test |
| Sweep mode — simple strip | Sweep triangulation | ✅ sweepQuad inherits this |
| Sweep mode — constraint handling | Sweep + backtrack | ✅ constrainedSweepCell replaces this |
| Sweep mode — statistics | Stats tracking | Not needed — different stats model |
| Sweep-repair mode — all tests | Repair pass | Not needed — no repair pass in new system |
| Cross-mode consistency | Mode equivalence | Not needed — single algorithm |

### Minimum Replacement Test Set

1. **`sweepQuad` unit tests**:
   - Standard cell (bot=[BL,BR], top=[TL,TR]) → 2 triangles
   - One chain vertex on bottom (bot=[BL,CV,BR], top=[TL,TR]) → 3 triangles
   - One chain vertex on each edge → 4 triangles
   - Unequal edges (bot=3 vertices, top=2 vertices) → 3 triangles
   - Single-vertex edge (bot=[BL], top=[TL,CV,TR]) → 2 triangles (fan)
   - All triangles have correct winding (CCW check)

2. **`constrainedSweepCell` unit tests**:
   - One chain edge (standard partition) → 4 triangles, chain edge IS a mesh edge
   - Chain edge from corner (batch2Remap'd endpoint) → 3 triangles
   - Two chain edges → correct partition count

3. **`emitChainCell` integration tests**:
   - Cell with one chain vertex, no edge → sweepQuad path
   - Cell with one chain edge → constrainedSweepCell path
   - Cross-column intersection vertex creation

4. **Chain edge enforcement regression test**:
   - Full buildCDTOuterWall with chains → all chainEdges appear in mesh edge set

### Tests That Should Pass Unchanged

All existing OWT tests (empty chains, minimal grid, surfaceId, seam handling, row mapping, return types, edge cases) should pass without modification. They exercise the no-chain path which uses `emitStandardCell` — unchanged by R34.

---

## Vertex Buffer Sizing (Post-Companion Deletion)

**Current formula** (line 920–923):
```
totalVertexCount = gridVertexCount + allChainVertices.length
vertices = Float32Array((totalVertexCount + rowBoundaryCvCount + totalShadowCount + boundaryCompanionSlack) * 3)
```

**New formula**:
```
totalVertexCount = gridVertexCount + chainVertices.length
maxCrossColumnVertices = chainEdges.length * 3  // conservative bound
vertices = Float32Array((totalVertexCount + maxCrossColumnVertices) * 3)
```

`nextVertexIdx` tracks all allocations. Cross-column intersection vertices will be added during `emitChainCell` and increment `nextVertexIdx`. The buffer must be pre-allocated with enough room. `chainEdges.length * 3` is very conservative (each edge crosses at most a few columns; upper bound is `#edges × maxColumnsPerEdge`). A tighter bound is `crossCellEdgeCount * maxColumnSpan` but `crossCellEdgeCount` isn't known until after scanning, which happens during `cellChainMap` construction. Can use `chainEdges.length * 3` as an upper bound without waste (it's a few KB extra at most).

Final vertex count will be trimmed at the end (existing pattern at line 2034).

---

## Index Buffer Compatibility

**Current**: `indexBuf` is a plain `number[]` that accumulates triangle indices. Both `emitStandardCell` and `triangulateChainStrip` push groups of 3 indices per triangle.

**New**: `emitStandardCell` pushes 6 indices (2 triangles), `emitChainCell` (via `sweepQuad`/`constrainedSweepCell`) pushes 3 indices per triangle via `emitTriCCW`.

The stride is identical (3 indices per triangle). Random triangle counts per chain cell are fine — `indexBuf` is a dynamic array. The final `new Uint32Array(indexBuf)` captures everything. ✅

---

## Questions for Generator & Verifier

1. **Cross-column cell polygon triangulation**: The Verifier (W1) recommends mini ear-clipping for 5+ vertex polygons from cross-column edges. For implementation simplicity, can I use a degenerate-safe fan from the intersection vertex? Fan from CROSS to all other boundary segments produces valid (if not optimal) triangles. Given cross-column cells are <5% of chain cells, which are <30% of all cells, this affects <1.5% of the mesh.

2. **`quadMap` value for chain cells**: The Verifier (A3) says "the Executioner must decide." I recommend `-1` (current CDT behavior). The mesh optimizer doesn't use `quadMap` for chain cells. Confirm?

3. **`PipelineStageConfig` cleanup scope**: Removing `ChainStripMode` and 5 config fields from `types.ts` touches the Zustand store and any UI that exposes these settings. Is this within R34 scope, or should it be a follow-up?

4. **`ChainStripOptimizer` post-tessellation passes**: The 3D edge flip and boundary diagonal optimization currently run on CDT-produced triangles. They should work identically on cell-local triangles (they operate on index buffer and vertex positions generically). Any known constraints?
