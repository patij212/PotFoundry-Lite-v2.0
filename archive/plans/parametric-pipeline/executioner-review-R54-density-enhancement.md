# Executioner Review — R54 Chain-Strip Density Enhancement

Date: 2026-03-10  
Generator document: `generator-round-4-R54-density-enhancement.md`  
Verifier document: `verifier-round-4-R54-density-enhancement.md`  
Reviewed by: Executioner

---

## Verdict: FEASIBLE WITH NOTES

The converged plan (Generator proposal + Verifier amendments A1-A4, W1-W3) is implementable as described. No showstoppers. The core mechanism — phantom vertex injection into single-cell chain cells via Section 3.95 — integrates cleanly with the existing OWT architecture. Seven implementation notes follow (N1-N7) that address real code-level concerns the Generator/Verifier debate didn't fully resolve.

---

## Feasibility Assessment

### Axis 1 (U-Phantom Injection): FEASIBLE

**Confirmed by code trace**: `emitChainCell` at OWT L1558-1598 builds `botEdge` and `topEdge` arrays from grid corners + `info.botChainVerts` / `info.topChainVerts`, both pre-sorted by U. Inserting additional vertex indices at correct U-sorted positions is a simple splice. `constrainedSweepCell` (L326-449) finds chain edge positions via `bot.indexOf(v0)` and slices sub-quads — additional non-chain vertices between chain and cell boundary become extra sweep points in `sweepQuad`, which handles N-vertex edges via the two-pointer sweep (L238-300). No code path assumes exactly 2 vertices per edge.

**Integration point**: R54 U-phantoms must be inserted into `info.botChainVerts` / `info.topChainVerts` arrays BEFORE `emitChainCell` runs, maintaining U-sort. Alternatively, `emitChainCell` can read from `r54PhantomMap` and inject at call time. The latter is cleaner (doesn't mutate shared data).

### Axis 2 (T-Phantom Injection): FEASIBLE (via phantomBoundaryMap, per Verifier A1)

**Confirmed by code trace**: The cell emission dispatch at L1932-1944 already has four branches:

```
!info && !bppInfo → emitStandardCell
!info && bppInfo  → emitSplitCell
info && bppInfo   → emitChainSplitCell  ← R54 T-phantoms route here
info && !bppInfo  → emitChainCell
```

If R54 populates `phantomBoundaryMap` for a chain cell, that cell automatically routes to `emitChainSplitCell` (L1939-1941). `emitChainSplitCell` (L1593-1757) derives sub-band boundaries from `bppInfo.leftPhantoms`/`rightPhantoms` T-values, splits chain edges at phantom T-levels, and sweeps sub-bands — exactly what R54 needs. **No modifications to `emitChainSplitCell` are required.** The Verifier is correct (A1).

### Section 3.95 Placement: CONFIRMED CORRECT

The insertion point is between:
- L1380 (end of R53 BPP construction) — `phantomBoundaryMap` exists, `nextPhantomIdx` is live
- L1490 (BPP count logging + Section 4 preamble)

R54 code goes here, at approximately L1490, after the R53 BPP log line. It reads `cellChainMap`, `superCellCols`, `vertices`, `unionU`, `activeTPositions`, creates phantom vertices via `nextPhantomIdx++`, and writes to `phantomBoundaryMap` (for Axis 2) and `r54PhantomMap` (for Axis 1).

### Phantom Budget (16× multiplier): CONFIRMED SUFFICIENT

Current: `maxPhantomSlots = chainEdges.length * 12` at L773. With ~5,460 chain edges → 65,520 slots. R37 uses ~12,757 (from logs). R53 BPP adds ~200-500. R54 adds an estimated 4,000-8,000.

At 16×: 87,360 slots. Total used ≈ 21,257. Headroom ≈ 66K. Even the pessimistic Generator worst-case (56K) fits. **No risk.**

---

## File Impact Analysis

| File | Lines Changed | What Changes |
|------|--------------|--------------|
| `OuterWallTessellator.ts` L773 | 1 | `maxPhantomSlots` multiplier 12→16 |
| `OuterWallTessellator.ts` ~L760 | 5 | R54 constants (after existing R37 constants block) |
| `OuterWallTessellator.ts` ~L1490 (new section 3.95) | ~120-160 | `injectR54Phantoms()` — main injection logic |
| `OuterWallTessellator.ts` L1558 (`emitChainCell`) | ~15 | Read `r54PhantomMap`, inject U-phantoms into `botEdge`/`topEdge` |
| `OuterWallTessellator.ts` ~L1490 | 5 | Diagnostic logging |
| **Total new/modified lines** | **~150-190** | |

Files NOT changed (confirmed):
- `ChainVertexBuilder.ts` — chain vertex positions untouched ✓
- `GridBuilder.ts` — no global grid changes ✓
- `ParametricExportComputer.ts` — no signature changes ✓
- `ChainStripTriangulator.ts`, `ChainStripOptimizer.ts` — downstream, no interface changes ✓
- `emitTriCCW`, `maxCosine2D` — untouched ✓
- `emitChainSplitCell` — works as-is, no modification needed (per A1) ✓

---

## Risk Zones

### Risk 1 (MEDIUM): U-Phantom Sort Order in `botEdge`/`topEdge`

`constrainedSweepCell` uses `bot.indexOf(v0)` to locate chain edge endpoints (L350-354). If R54 U-phantom vertices are inserted into `botEdge`/`topEdge`, `indexOf` still finds the correct chain vertex because phantoms have different vertex indices. However, the sub-quad slicing (`bot.slice(prevBotPos, part.botPos + 1)`) relies on **position-based ordering** matching **index-based ordering**. U-phantoms must be inserted at the correct U-sorted position between chain vertex and cell boundary, NOT appended at the end.

**Mitigation**: In `emitChainCell`, after building `botEdge`/`topEdge` from `info.botChainVerts`/`info.topChainVerts`, merge R54 U-phantom indices and re-sort by `vertices[idx * 3]` (U position). This is safe because the sort at L973-974 already establishes this invariant for chain vertices.

### Risk 2 (MEDIUM): Two-Pass T-Phantom Boundary Union

The Verifier's W2 is critical. Two adjacent chain cells computing T-phantom positions independently will generally produce different T-values (e.g., cell A: `tBot + h/3` vs cell B: `tBot + h/2`). The shared boundary must have the UNION.

**Implementation concern**: The union must be computed BEFORE creating vertices. If cell A creates phantoms at {t1, t2} and cell B creates at {t1'}, the shared boundary needs {t1, t1', t2} on BOTH sides. This requires:
1. Pass 1: Iterate all qualifying chain cells, store computed T-positions in a staging map (no vertices yet)
2. For each shared boundary (same band, adjacent columns), union both cells' T-positions
3. Pass 2: Create phantom vertices at the unioned positions, insert into `phantomBoundaryMap`

**Line count impact**: The two-pass approach adds ~20 lines over a naive single-pass.

### Risk 3 (LOW): `nextPhantomIdx` Ordering

R54 creates phantom vertices using `nextPhantomIdx++` — the same counter used by R37 and R53. Section 3.95 runs AFTER R37 (which sets `phantomVertexCount = nextPhantomIdx - phantomVertexStart` at L1378) but BEFORE cell emission. The R53 `emitChainSplitCell` also increments `nextPhantomIdx` during emission (L1630-1648).

**Concern**: The `phantomVertexCount` update at L1378 doesn't include R54 phantoms. But the FINAL update at L1950 (`phantomVertexCount = nextPhantomIdx - phantomVertexStart`) does. Batch 6 dedup at L1968 uses `totalVertexCount + phantomVertexCount`, which must include R54 phantoms.

**Mitigation**: No code change needed — the L1950 update already captures all phantom allocations regardless of source. Just verify that R54 does NOT reset `phantomVertexCount` between L1378 and L1950.

### Risk 4 (LOW): R52 Precision Lock Compatibility

R54 creates two types of phantom vertices:
1. **Grid-boundary phantoms** (`u = unionU[col]` or `unionU[col+1]`, new T): These are column-boundary vertices → NOT in `phantomChainAnchorSet`. Correct.
2. **U-phantom edge vertices** (new U between chain and boundary, T = grid row T): These are NOT chain vertices and NOT column boundaries. They are intermediate U-position, grid-row T-position.

U-phantom vertices don't merge with chain vertices (different U), don't merge with grid vertices (different U from column boundaries), and don't need `phantomChainAnchorSet` tracking. The R52 lock is preserved. **No risk.**

### Risk 5 (LOW): Axis 2 Chain Edge Splitting at Phantom T-Levels

When `emitChainSplitCell` receives R54 T-phantoms via `phantomBoundaryMap`, it splits chain edges at phantom T-levels (L1685-1738). It creates chain-interpolated vertices using `phantomChainAnchorSet.add(pIdx)` (L1716). This is the same mechanism used for R37/R53 phantoms. **No regression risk** — the code path is battle-tested.

---

## Unstated Dependencies

### D1: `cellChainMap` Iteration Order

R54 iterates `cellChainMap` to find qualifying chain cells. The Generator's plan says "iterate entries NOT in `superCellCols`". This filtering is correct — super-cells have R37 handling. But `cellChainMap` includes cells with chain VERTICES on edges but NO chain EDGES through the cell (`info.chainEdges.length === 0`). These cells have chain vertices that add points to `botEdge`/`topEdge` but don't produce sub-quads. U-phantom injection is only meaningful for cells with `info.chainEdges.length > 0` (cells that are partitioned by chain edges). **R54 must filter: `info.chainEdges.length > 0 && !superCellCols.has(key)`**.

### D2: Chain Vertex U-Position Access

R54 needs the U-position of chain vertices at cell boundaries (bottom and top edges) to compute sub-quad widths. For a chain edge `[v0, v1]` where `v0` is on the bottom row and `v1` is on the top row, the U-positions are `vertices[v0 * 3]` and `vertices[v1 * 3]`. These are the EXACT chain vertex positions (R52 guarantee). The Generator's formulas (`u_chain_bot`, `u_chain_top`) are correct, but must use the vertex buffer positions, not any intermediate data structure.

### D3: `bsearchFloor` for Column Lookup

R54 needs to map chain vertex U to cell column. The existing `bsearchFloor(unionU, u)` function (used at L916) does this. R54 must use the same function. The clamping pattern (`Math.max(0, Math.min(cellsPerRow - 1, col))`) at L930-931 must also be replicated.

### D4: Multi-Chain Cell Frequency

The Verifier recommends skipping multi-chain cells (A4). I need to verify the frequency. From the `cellChainMap` construction (L930-965), a cell gets multiple chain edges when multiple independent chains have edges in the same grid cell. With 13 chains and ~685 columns, multi-chain overlap cells are rare (~2-5% as the Verifier estimates). **Skipping them is safe for the first implementation.**

### D5: Phantom Vertex 3-Component Storage

Phantom vertices need 3 components: `(u, t, surfaceId)`. The existing phantom allocation pattern (L1103-1106) sets all three. R54 must follow this: `vertices[pIdx * 3] = u; vertices[pIdx * 3 + 1] = t; vertices[pIdx * 3 + 2] = surfaceId;`.

---

## Testing Strategy

### Unit Tests (Vitest)

1. **U-phantom position computation**: Given cell bounds and chain vertex U, verify that computed phantom U-positions are correct (evenly divide the wide sub-quad, respect `R54_MAX_U_PHANTOMS`).

2. **T-phantom trigger logic**: Given cell width and band height, verify that T-phantom count is computed correctly (`floor(bandHeight/cellWidth) - 1`, capped at `R54_MAX_T_PHANTOMS`).

3. **Two-pass boundary union**: Given two adjacent cells' independent T-phantom positions, verify the union computation produces the correct merged set.

These can be tested in isolation by extracting the computation functions (pure math, no vertex buffer dependency). Estimated: ~60 lines of test code.

### Integration Tests (Visual / Export Regression)

4. **Gothic arches export**: Run full export, compare chain-strip aspect ratio metrics before/after. Log triangle quality distribution.

5. **T-junction audit**: After R54, verify zero T-junction warnings at R54 phantom boundaries. The existing MeshValidator can detect T-junctions via non-manifold edge detection.

6. **Phantom budget audit**: Log `nextPhantomIdx - phantomVertexStart` after R54 section. Compare with `maxPhantomSlots`. Must stay under budget.

### Style Generalization Tests

7. Test on at least 3 styles (gothic_arches, amphora, vase) as the Verifier specifies. Different styles produce different chain densities and band heights, exercising different R54 code paths.

---

## Implementation Order: Confirmed 4-Changeset Sequence

The Generator's proposed order is correct with one modification:

### Changeset 1: Infrastructure (~40 lines)
- Add constants near L1070 (after existing R37 constants): `R54_ASPECT_THRESHOLD = 3.0`, `R54_HT_RATIO = 4.0`, `R54_MAX_U_PHANTOMS = 3`, `R54_MAX_T_PHANTOMS = 3`
- Add `r54PhantomMap: Map<number, { uPhantomBot: number[]; uPhantomTop: number[] }>` at ~L1490
- Increase `maxPhantomSlots` multiplier at L773: `chainEdges.length * 16`
- Add diagnostic logging placeholder
- **Validation**: typecheck + lint clean, zero behavioral change

### Changeset 2: Axis 1 — U-Phantom Injection (~80-100 lines)
- New section 3.95a at ~L1490: iterate `cellChainMap`, filter `info.chainEdges.length > 0 && !superCellCols.has(key)`
- For single-chain-edge cells: compute sub-quad widths from chain edge U vs cell boundary U
- If `w_wide / w_narrow > R54_ASPECT_THRESHOLD`: inject `n = min(floor(w_wide / w_narrow), R54_MAX_U_PHANTOMS)` phantom U-positions
- Create phantom vertices at `(u_phantom, t_bot)` and `(u_phantom, t_top)` using `nextPhantomIdx++`
- Store vertex indices in `r54PhantomMap` keyed by `cellKey(band, col)`
- Modify `emitChainCell` (~15 lines): read `r54PhantomMap`, inject U-phantom indices into `botEdge`/`topEdge`, re-sort by U
- Skip multi-chain cells (per A4)
- **Validation**: typecheck + lint, export gothic_arches, log aspect metrics

### Changeset 3: Axis 2 — T-Phantom Injection (~60-80 lines)
- New section 3.95b at ~L1490 (after 3.95a): iterate chain cells with `bandHeight / cellWidth > R54_HT_RATIO`
- Two-pass implementation (per Verifier W2):
  - Pass 1: For each qualifying cell, compute phantom T-positions, store in staging map
  - Pass 2: For shared boundaries, union T-positions from both sides. Create phantom vertices at `(uLeft, t_phantom)` and `(uRight, t_phantom)`. Insert into `phantomBoundaryMap` (merge with existing BPP entries via `push` to `leftPhantoms`/`rightPhantoms`)
- **Validation**: typecheck + lint, export gothic_arches, verify zero T-junctions

### Changeset 4: Quality Gating (~30-40 lines)
- Add aspect-ratio and min-angle logging for chain-strip triangles in diagnostic section
- Add `R54_ENABLED = true` constant with conditional gate around section 3.95
- **Validation**: full export test suite, 3+ styles, regression check

**Total estimated LOE**: ~210-260 new lines in OWT (file grows from ~2100 to ~2350 lines).

---

## Specific Code Integration Points

### Where New Code Goes

| Section | Approximate Line | What |
|---------|-----------------|------|
| Constants block | L1070 (after `R38_MIN_SIDE_SPAN_FACTOR`) | R54 constants |
| Section 3.95 | L1490 (after R53 BPP log) | `injectR54Phantoms()` inline block |
| `emitChainCell` | L1575 (after `topEdge` construction, before `sweepQuad`/`constrainedSweepCell` dispatch) | R54 U-phantom injection |

### New Data Structures

```typescript
// Staging map for R54 U-phantom vertex indices per chain cell
const r54UPhantomMap = new Map<number, {
    botPhantoms: number[];  // phantom vertex indices on bottom edge, sorted by U
    topPhantoms: number[];  // phantom vertex indices on top edge, sorted by U
}>();
```

### Functions Modified

1. **`emitChainCell`** — Add ~15 lines after `botEdge`/`topEdge` construction to merge R54 U-phantoms and re-sort
2. **No other existing functions modified** — Axis 2 works entirely through `phantomBoundaryMap` → existing dispatch

### Functions Added

None as standalone functions. R54 logic is an inline block in section 3.95 (consistent with R37/R53 sections being inline). Extracting to a named function would require passing ~15 closure variables; inline is simpler and follows the existing pattern.

---

## Questions for Generator/Verifier

### Q1: Aspect Threshold Sensitivity

The proposed `R54_ASPECT_THRESHOLD = 3.0` triggers U-phantom injection when one sub-quad is 3× wider than the other. For a cell width of 0.0017 with chain at 0.0002 from one edge, the ratio is 0.0015/0.0002 = 7.5 → triggers with `n = min(floor(7.5), 3) = 3` phantoms. This seems aggressive — 3 phantoms in a 0.0015-wide sub-quad gives spacing of 0.000375, which may be finer than the grid's own resolution. Should we cap phantom spacing at some minimum (e.g., `min(w_wide / n, average_grid_spacing)`)? Or is the quality improvement worth the extra vertices?

### Q2: Axis 2 Interaction with Axis 1

A cell can qualify for BOTH U-phantoms (narrow sub-quad) AND T-phantoms (tall band). The plan says both axes run independently. When a cell has both, `emitChainSplitCell` processes the cell (because it has `phantomBoundaryMap` entry from Axis 2), and the U-phantoms from Axis 1 must be injected into each sub-band's `botEdge`/`topEdge`. Currently `emitChainSplitCell` builds sub-band boundaries from phantom T-rows and sweeps each sub-band — it reads `info.botChainVerts`/`info.topChainVerts` only for the top-most and bottom-most sub-bands (L1659-1663).

**The concern**: U-phantoms at the cell's original `t_bot`/`t_top` are in the first and last sub-bands' edges. But they're NOT in the intermediate sub-band boundaries (which only have left/right column vertices + chain-interpolated vertices). If a cell needs BOTH axes, U-phantoms must be added to ALL sub-band edges where the chain sub-edge creates an unbalanced sub-quad.

**Recommendation**: For Changeset 2, implement U-phantoms in `emitChainCell` only (cells WITHOUT T-phantoms). For cells that also get T-phantoms (Changeset 3), defer U-phantom integration until the sub-band sweep. This may require Changeset 3 to also handle U-phantoms within sub-bands, adding ~20 lines. Flag this as a known interaction.

### Q3: Near-Boundary Narrow Sub-Quad Slivers

Verifier C4/W3 says the near-boundary guard should NOT suppress wide-side phantoms. I agree. But the Generator's concern is valid: if `w_narrow < 1e-5` (chain vertex nearly coincident with cell boundary), the narrow sub-quad produces near-degenerate triangles regardless of R54. These are filtered by the existing degenerate triangle stripping in the export pipeline. The question is whether we should LOG these cases for diagnostic visibility, or silently accept them. **Recommendation**: Log in Changeset 4 diagnostics only, no special handling.

---

## Summary

| Aspect | Assessment |
|--------|-----------|
| Core mechanism | Sound — phantom injection into single-cell chain cells fills the R37/R38/R53 gap |
| Axis 1 (U-phantoms) | Feasible — clean integration via `botEdge`/`topEdge` augmentation |
| Axis 2 (T-phantoms) | Feasible — clean integration via `phantomBoundaryMap` → existing dispatch |
| Phantom budget | Sufficient — 66K headroom at 16× |
| R52 precision | Preserved — no chain/grid merging, no position modification |
| Code complexity | Moderate — ~210-260 new lines in a ~2100-line file |
| Risk level | Medium overall — Risk 1 (sort order) and Risk 2 (boundary union) require careful implementation |
| Testing | Feasible — unit tests for math, integration tests via export |
| Estimated quality impact | 20-30% violation rate (per revised Verifier A2), not 8-12% |

**Verdict: FEASIBLE WITH NOTES (N1: filter `chainEdges.length > 0`, N2: two-pass union per W2, N3: U-phantom sort order, N4: Axis 1+2 interaction in sub-bands, N5: phantom spacing cap question, N6: diagnostic-only near-boundary handling, N7: skip multi-chain cells per A4).**

Ready to implement on approval from Master.
