# Verifier Round 1 — Critique of Generator R53: T-Junction + Density Proposals

Date: 2026-03-10

---

## Summary Verdict: REJECT Proposal 5 (CPR) as stated; ACCEPT WITH AMENDMENTS Proposal 1 (BPP) for T-junction fix only

**Reasoning:** Proposal 5 (CPR) has two CRITICAL flaws (Attacks 2 and 4) that would produce corrupt geometry. Proposal 1 (BPP) is the correct mechanism for T-junction elimination. The density gradient problem should be separated into a distinct round — it involves different engineering tradeoffs and should not be coupled to the T-junction fix.

---

## Attack 1: Phantom Slot Overflow — CONDITIONAL PASS

### Generator's claim
"~20K additional phantom vertices (upper bound)" and "need to verify buffer sizing."

### Actual behavior
The allocation is at [OuterWallTessellator.ts L774](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L774):
```typescript
const maxPhantomSlots = chainEdges.length * 12;
```

The vertex buffer is sized at L775:
```typescript
const vertices = new Float32Array((totalVertexCount + maxPhantomSlots) * 3);
```

Overflow guard at L1106:
```typescript
if (nextPhantomIdx >= totalVertexCount + maxPhantomSlots) {
    return rowVerts[rowVerts.length - 1]?.idx ?? 0;  // SILENT FALLBACK — reuses last vertex
}
```

### Numerical analysis

**Typical chain edges:** 20 chains × ~242 edges/chain = ~4,840 edges → `maxPhantomSlots = 4,840 × 12 = 58,080`

**Current usage (from logs):** 12,755 phantom vertices.

**CPR additional vertices:** `EXTENSION_COLS=2` × 2 sides × average ~1 phantom row per super-cell × 2,548 super-cells = ~10,192 new vertices. Generator's upper bound of 20K is conservative.

**Headroom:** 12,755 + 20,000 = 32,755 < 58,080. Sufficient for the typical case.

### Counterexample — low chain count styles
A style with only 5 short chains (50 points each, ~49 edges × 5 = 245 edges) → `maxPhantomSlots = 245 × 12 = 2,940`. If those 5 chains produce many crossing super-cells (dense twist), current phantom usage could approach 2K. CPR extension of even 1K additional would push to the limit.

### Verdict: CONDITIONAL PASS

The formula has adequate headroom for typical styles (20 chains, ~4800 edges), but the overflow guard at L1106 is **silent** — it reuses the last vertex without warning, producing corrupt geometry with no diagnostic. 

### Required fix for ACCEPT
1. Add a `console.warn` in the overflow guard path so corruption is diagnosable
2. Consider increasing the multiplier from 12 to 16 to provide safety margin for CPR
3. After phantom creation, assert `phantomVertexCount < maxPhantomSlots * 0.9` and log if budget is tight

---

## Attack 2: emitSuperCell Pollution (CPR Proposal 5) — CRITICAL FAIL

### Generator's claim
CPR extends phantom row creation by modifying the column loop from `r37Sc.colStart..colEnd+1` to `extLeft..extRight`. The proposal assumes this "simultaneously eliminates T-junctions AND provides density gradient."

### Actual behavior — the fatal flaw
The phantom row's `vertexIndices` is assembled from `rowVerts.map(rv => rv.idx)` at [L1275](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1275). If CPR extends the column range, ALL extended vertices end up in `vertexIndices`.

Then in `emitSuperCell` at [L1565-1570](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1565-L1570):
```typescript
const boundaries: number[][] = [finalBot];
for (const pr of sortedRows) {
    boundaries.push([...pr.vertexIndices]);  // ← INCLUDES EXTENDED VERTICES
}
boundaries.push(finalTop);
```

`finalBot` and `finalTop` only contain vertices within `colStart..colEnd+1` (built at [L1510-1540](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1510-L1540)). But `pr.vertexIndices` now spans `extLeft..extRight`.

### Concrete counterexample
Super-cell spans columns 5-8. `EXTENSION_COLS=2` → phantom row has vertices at columns 3,4,5,6,7,8,9,10.

**Band splitting call:**
```
sweepQuad(subBot=phantomRow, subTop=finalTop)
```
Where:
- `subBot` (phantom row): vertices at U[3], U[4], U[5], ..., U[10] — 8 vertices
- `subTop` (grid boundary): vertices at U[5], intermediate grid, ..., U[9] — ~5 vertices

`sweepQuad` walks both edges by U. The phantom row's first two vertices at U[3] and U[4] have smaller U than `subTop[0]` at U[5]. The sweep emits:
```
Triangle(phantom@U[3], phantom@U[4], gridTop@U[5])  // WRONG — spans 2 columns LEFT of super-cell
Triangle(phantom@U[4], phantom@U[5], gridTop@U[5])  // WRONG — spans 1 column LEFT
```
Similarly, phantom vertices at U[9] and U[10] create triangles reaching RIGHT of the super-cell.

**Result:** Triangles spanning far outside the super-cell's domain, overlapping adjacent cells' geometry. This creates **doubled geometry** (overlapping triangles from both the extension cell emission AND the super-cell's polluted band-splitting) and extreme aspect ratios.

### Verdict: CRITICAL FAIL

This is a geometric corruption bug. The extended phantom vertices poison the super-cell's own band-splitting mechanism.

### Required fix for ACCEPT
**Option A (minimal):** Filter `phantomRow.vertexIndices` to the super-cell's column range in `emitSuperCell`:
```typescript
const prVerts = pr.vertexIndices.filter(idx => {
    const u = vertices[idx * 3];
    return u >= unionU[colStart] - 1e-6 && u <= unionU[colEnd + 1] + 1e-6;
});
boundaries.push(prVerts);
```

**Option B (clean separation — RECOMMENDED):** Don't extend phantom rows at all. Use BPP (Proposal 1) — build a separate `phantomBoundaryMap` AFTER phantom row creation that indexes the boundary vertices at `colStart` and `colEnd+1`. The super-cell is never modified. Extension cells look up their boundary phantom vertices from the map.

---

## Attack 3: BPP (Proposal 1) Sufficiency — CONDITIONAL PASS

### Generator's claim (and Master's hypothesis)
"The density gradient from strip decomposition alone is adequate for triangle quality." BPP alone might be sufficient because adjacent cells with boundary splits get 2-6 triangles (from 2).

### Analysis

**Phantom rows per super-cell:** 12,755 phantom verts / 2,548 super-cells ≈ 5 verts per super-cell. Each phantom row creates `(colEnd - colStart + 2)` column boundary verts + crossing anchors + companions. For a typical 2-column super-cell: ~4-6 verts/row. So roughly **1 phantom row per super-cell** on average.

**BPP density gain:** With 1 phantom row, the adjacent cell gets 1 boundary split → 2 horizontal strips → 4 triangles (from 2). That's a 2× density increase at the immediate neighbor.

**Sub-strip geometry:** Band height ≈ 0.003 T. Phantom row at mid-band → sub-strip height ≈ 0.0015 T. Grid column width ≈ 0.00173 U. Aspect ratio ≈ 0.00173/0.0015 ≈ 1.15:1. **These are well-shaped triangles.**

**But does this fix the 42.8% chain-strip aspect violations?** **No.** The chain-strip aspect ratio problem comes from chain vertices (~243 per chain across 558 columns → average spacing ~2.3 columns) connecting to grid vertices ~0.015-0.04 U away. BPP only adds phantom vertices at the super-cell boundary columns — it doesn't densify the chain-to-grid transition zone. The aspect ratio violations are in chain cells and their immediate neighbors along the chain direction, not in the phantom-row direction.

**The two problems are orthogonal:**
1. **T-junctions:** Caused by phantom boundary vertices on shared vertical edges. BPP fixes this completely.
2. **Density gradient:** Caused by the ~40:1 density mismatch between chain features and grid. Requires fundamentally different machinery (companion systems, subdivision, or grid densification near chains).

### Verdict: CONDITIONAL PASS

BPP is fully **sufficient for T-junction elimination**. It is **insufficient for density gradient** — but that's OK, because these are separate problems and should be addressed in separate rounds. Coupling them adds risk without adding value.

### Path to ACCEPT
Implement BPP as a pure T-junction fix. Defer density gradient to a separate R54/R55 round where it can be addressed with focused attention and proper benchmarking.

---

## Attack 4: Chain Cell + Extension Boundary — CRITICAL FAIL

### Generator's claim
"For chain cells in the extension zone, add phantom boundary vertices to bot/top edges (they're on the same U as grid corners) and include them in the horizontal strip decomposition. Since the phantom vertices are at grid column U-values (not at chain U-values), they integrate cleanly."

### Actual behavior — geometrically incorrect
Phantom boundary vertices are at **interior T-values** (`tCross`, between `T_bot` and `T_top`). They are NOT on bot/top edges. They sit on **vertical edges** of the cell.

`emitChainCell` at [L1449-1480](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1449-L1480):
```typescript
const botEdge: number[] = [BL];
for (const cvIdx of info.botChainVerts) { botEdge.push(cvIdx); }
botEdge.push(BR);  // all at T = T_bot

const topEdge: number[] = [TL];
for (const cvIdx of info.topChainVerts) { topEdge.push(cvIdx); }
topEdge.push(TR);  // all at T = T_top
```

Bot/top edges are horizontal (constant T). Phantom boundary vertices are at T=tCross ≠ T_bot and T=tCross ≠ T_top. You **cannot** add them to bot/top edges — they'd be out of order in the T-dimension, causing `sweepQuad` to produce crossed/inverted triangles.

### Concrete counterexample
Chain cell at (band=5, col=9). This cell is in the extension zone of super-cell spanning cols 5-8. Phantom row at T=0.73. Band boundaries: T_bot=0.70, T_top=0.73.

- Bot edge: `[BL(U[9],0.70), chainVert(U_cv,0.70), BR(U[10],0.70)]`
- Top edge: `[TL(U[9],0.73), chainVert(U_cv,0.73), TR(U[10],0.73)]`
- Phantom vertex: `(U[9], T=0.715)` — on the LEFT vertical edge at an interior T

If you add the phantom to `botEdge`, it has T=0.715 > T_bot=0.70, so `sweepQuad` would see decreasing-then-increasing U (since U[9] appears twice with different T) → nonsensical triangulation.

If you try horizontal strip decomposition (splitting at T=0.715), you need to:
1. Split chain edges crossing T=0.715 to create sub-edge anchors
2. Build sub-band bot edges and top edges at T=0.715
3. Handle the chain edge→phantom edge interaction at the T=0.715 boundary

This is essentially **re-implementing R37's phantom row mechanism for the extension cell** — not the "15 modified lines" the Generator estimated.

### Verdict: CRITICAL FAIL

The Generator's proposed fix for chain cells in the extension zone is geometrically incorrect. The actual fix requires a mini-R37 band-splitting mechanism per extension chain cell, which dramatically increases complexity.

### Required fix for ACCEPT
**Option A (complex):** Implement per-cell band splitting analogous to `emitSuperCell`'s R37 mechanism. Requires chain edge pre-splitting at phantom T-values, sub-band boundary construction, and constrained sweep within each sub-band. Estimated ~80-120 new lines per cell type, not ~20.

**Option B (practical — RECOMMENDED):** For BPP, chain cells adjacent to super-cells receive boundary phantom vertices on their shared vertical edges. Instead of modifying `emitChainCell`, create a new `emitChainSplitCell` that:
1. Sorts all vertical boundary phantoms by T
2. Decomposes the cell into horizontal sub-bands at each phantom T
3. For each sub-band, finds which chain vertex sub-segments fall within it
4. Runs `constrainedSweepCell` on each sub-band with the appropriate chain sub-edges

**Option C (simplest — ALSO VALID):** If a cell in the extension/boundary zone is a chain cell, skip the phantom propagation for that cell entirely. The T-junction at that boundary remains, but it's at a chain cell boundary where the mesh is already dense. This avoids the complexity entirely at the cost of a few remaining T-junctions in low-impact locations.

---

## Attack 5: Separate Data Structure (BPP) vs CPR — PASS (BPP is better)

### Analysis

**BPP (`phantomBoundaryMap`):**
- Built AFTER phantom row creation — scan existing `vertexIndices` for boundary vertices
- Indexes the same phantom vertex indices, no duplication
- Does NOT modify phantom rows or super-cell band-splitting
- Super-cell mechanism remains completely untouched → zero regression risk
- Cleanly separates "super-cell internal" from "adjacent cell T-junction fix"

**CPR (extend phantom rows):**
- Modifies phantom row construction itself
- Pollutes super-cell band-splitting (Attack 2 — CRITICAL)
- Creates chain-cell interaction at extension boundary (Attack 4 — CRITICAL)
- Higher implementation complexity despite appearing simpler

**Duplication risk:** None. BPP's `phantomBoundaryMap` stores references (vertex indices) to the same phantom vertices that the super-cell has. The vertex exists once in the buffer. No risk of double-inclusion because `emitStandardCell` and `emitSuperCell` operate on different cells (dispatch is mutually exclusive via `superCellCols` set at [L1626](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1626)).

### Verdict: PASS

BPP's separate data structure is architecturally cleaner and avoids both CRITICAL flaws of CPR. **Recommend BPP over CPR.**

---

## Attack 6: Edge Cases — WARNING (with specific concerns)

### C1 [WARNING]: Adjacent super-cells with overlapping extensions

If super-cell A spans cols 5-8 and super-cell B spans cols 10-12:
- A's boundary at col 9, B's boundary at col 10
- With BPP: cell (band, 8) gets A's right-boundary phantoms; cell (band, 10) gets B's left-boundary phantoms. No overlap.
- With CPR (EXTENSION_COLS=2): A extends to col 10, B extends to col 8. Column 9 gets phantoms from BOTH super-cells at DIFFERENT tCross values. Column 10 is in B's super-cell AND A's extension.

For BPP, this is not a problem — each cell checks only its immediate shared edges. For CPR, the overlap creates ambiguous dispatch priority.

### C2 [WARNING]: Seam boundary

Super-cell near column 0 or `cellsPerRow-1`. BPP/CPR extension could try to reference column -1 or `cellsPerRow+1`. CPR uses `Math.max(0, ...)` — safe for column 0, but doesn't check the seam guard for the extended columns. The extended column might span the seam discontinuity.

**Required check:** For BPP, verify the adjacent cell isn't seam-guarded before propagating phantom vertices to it.

### C3 [NOTE]: DegenGuard slivers

Phantom rows clamped to T_bot + 5% or T_top - 5% (degenGuard). In an extension cell, this creates a sub-strip of height 0.15 × bandHeight ≈ 0.00015 T, width ≈ 0.00173 U → aspect ratio ≈ 11.5:1.

This is a pre-existing condition in super-cells themselves and is not worsened by BPP. The degenGuard exists precisely because tighter clamping would occur at band boundaries. The 11.5:1 aspect is unpleasant but tolerable — it's a single row of transitional triangles, not a pattern.

### C4 [NOTE]: First/last band

Super-cells on band 0 or band `totalBands-1` would have BPP extension cells at the mesh boundary. These boundary cells typically have standard grid corners. No special concern — the BPP split-cell triangulation handles any number of boundary splits including 0.

### Verdict: WARNING

**Required for ACCEPT:** Add seam guard check to BPP propagation for adjacent cells. Other edge cases are tolerable.

---

## Attack 7: R52 Precision Lock Compatibility — PASS

### Analysis

**`upsertPhantomRowVertex` R52 guard** ([L1091-1105](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1091-L1105)):
Extended phantom vertices would be created with `isChainAnchor=false` (default). The R52 type separation prevents them from merging with chain anchor vertices, even if they're within `R37_U_MERGE=1e-4` of each other.

**Batch 6 dedup** ([L1676-1695](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1676-L1695)):
The `vIsChain !== existIsChain` guard ([L1684](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1684)) prevents cross-type merging. Extended phantom vertices have indices >= `phantomVertexStart` (which is >= `totalVertexCount` = `gridVertexCount + chainVertices.length`). The `vIsChain` check is `v >= gridVertexCount`, which means phantom vertices are classified as "chain" for dedup purposes.

**Wait — this needs closer inspection.** Phantom vertices have index >= `totalVertexCount` = `gridVertexCount + chainVertices.length`. The `vIsChain` check at [L1682-1683](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1682-L1683):
```typescript
const vIsChain = v >= gridVertexCount;
const existIsChain = existing >= gridVertexCount;
```

Phantom vertices at index >= `gridVertexCount + chainVertices.length` satisfy `v >= gridVertexCount`, so they're classified as "chain" type. This means:
- Phantom-to-grid dedup: BLOCKED (cross-type) ✓
- Phantom-to-phantom dedup: ALLOWED (same-type) ✓ 
- Phantom-to-chain dedup: ALLOWED (both classified as "chain") ⚠️

A phantom vertex at `(unionU[c], tCross)` could merge with a chain vertex at `(u_chain, tCross)` if they quantize to the same 1e-5 cell. Since chain vertices are at arbitrary U-positions and phantom vertices are at grid column U-positions, the probability is low but non-zero. However, the R52 `upsertPhantomRowVertex` guard prevents this during creation
. The Batch 6 risk exists but is mitigated by the precision difference — chain vertices have sub-sample precision (±0.00006) while grid columns are at CDF positions. Merging would only occur if a chain vertex happens to be within 0.00001 U of a grid column AND at the same quantized T, which would also affect the current system (not a CPR/BPP regression).

### Verdict: PASS

R52 precision locks are not violated by either BPP or CPR. The theoretical Batch 6 phantom-to-chain dedup is a pre-existing condition, not a regression.

---

## Accepted Items

1. **Problem statement and root cause analysis:** The Generator's trace of T-junction formation (phantom boundary vertices at `colStart` and `colEnd+1` visible to super-cell but invisible to adjacent cells) is **exactly correct**, verified against [L1199-1201](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1199-L1201) and [L1415-1419](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1415-L1419).

2. **Proposal 2 (BEN) rejection:** Generator correctly identifies that removing boundary phantom vertices would break `emitSuperCell` band splitting. Self-aware rejection.

3. **Proposal 4 (ESGT) self-correction:** Generator correctly identifies that graduated row insertion cascades T-junctions and converges back to BPP. Good mathematical reasoning.

4. **Architectural lesson citation:** Section 5.1.7 ("More companions is NOT the answer") correctly invoked to reject interior Steiner points for density.

5. **BPP core mechanism:** The `phantomBoundaryMap` approach — scan existing phantom vertices at boundary columns, propagate awareness to adjacent cells, triangulate split cells with horizontal strips — is architecturally sound.

---

## Overall Recommendation: BPP (Proposal 1) with Amendments

### What to implement

**Phase 1: T-Junction Elimination via BPP**

1. After phantom row creation (after [L1365](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1365)), build `phantomBoundaryMap`:
   ```
   key: cellKey(band, adjacentCol)  
   value: { side: 'left'|'right', phantomVertexIndices: number[] (sorted by T) }
   ```
   
2. Scan each super-cell's phantom rows. For each phantom row, identify vertices at `unionU[colStart]` and `unionU[colEnd+1]`. Register in the map keyed by the ADJACENT cell (the cell that doesn't know about these vertices).

3. In the main emission loop, before `emitStandardCell`, check `phantomBoundaryMap`. If present, dispatch to `emitSplitCell`.

4. `emitSplitCell` implementation:
   - Build the polygon: `BL → BR → (right phantoms ascending T) → TR → TL → (left phantoms descending T) → back to BL`
   - Decompose into horizontal strips using sorted phantom T-values as strip boundaries
   - Each strip is a quad with 2 vertices on each side → `sweepQuad`
   - Handle the single-sided case (phantoms on left only or right only): strips are triangles, sweepQuad handles cleanly

5. For chain cells adjacent to super-cells (Attack 4):
   - **Option C (recommended for Phase 1):** Skip phantom propagation to chain cells. Accept the few remaining T-junctions at chain cell boundaries.
   - **Phase 2 (deferred):** Implement `emitChainSplitCell` with per-cell band-splitting if measurement shows these T-junctions are visually significant.

### Validation protocol for Executioner

1. **T-junction count:** Before/after comparison of valence-3 vertices. Target: >90% reduction.
2. **min_angle metric:** Must improve from 0.0° — any T-junction elimination should raise this.
3. **Triangle count:** Expect modest increase (~5-10K triangles from split cells).
4. **Regression tests:** 
   - Run on Gothic Arches (complex chain interactions near seam)
   - Run on styles with adjacent super-cells (twist-heavy styles)
   - Verify `[CDT] R37:` log line phantom counts are unchanged (BPP adds no new phantom vertices)

### What to defer

- **Density gradient (Problem 2):** Separate round. The 42.8% chain-strip aspect violations are caused by the chain-to-grid density mismatch, which requires companion systems, grid densification, or subdivision — all mechanisms with extensive failure history (R5-R21). This needs dedicated Generator/Verifier/Executioner attention.
- **Chain cell + phantom interaction (Attack 4 full fix):** Deferred unless measurement shows the skipped chain-cell T-junctions cause visible artifacts.

---

## Risk Matrix

| Risk | Severity | Mitigation |
|------|----------|------------|
| BPP phantom boundary scan misidentifies vertices | MEDIUM | Match by `Math.abs(u - unionU[col]) < R37_U_MERGE` with explicit tolerance |
| Split cell triangulation produces inverted triangles | LOW | Use `emitTriCCW` (winding-aware) already used by `sweepQuad` |
| Seam boundary BPP propagation | MEDIUM | Add seam guard check for adjacent cell (Attack 6 C2) |
| Phantom slot overflow for extreme styles | LOW | Add diagnostic warning in overflow path (Attack 1) |
| Performance regression from split-cell triangulation | LOW | Each split cell adds O(K) triangles where K = phantom count on boundary; K is typically 1-2 |

---

## Notes for Generator (Round 2)

1. Your root cause analysis was excellent. The T-junction mechanism at phantom boundary vertices is precisely correct.
2. Proposal 5 (CPR) has elegant intent but fails on implementation details — the super-cell pollution (Attack 2) is a showstopper that you acknowledged as an open question but underestimated.
3. The chain cell + extension interaction (Attack 4) is far more complex than your ~20 line estimate. This is why I recommend skipping it in Phase 1.
4. For density gradient work in a future round: consider whether the existing edge flip system (3D quality flip, chain-directed flip) already provides adequate triangle quality in the transition zone AFTER T-junctions are eliminated. Measure first, then decide.
5. The `maxPhantomSlots = chainEdges.length * 12` formula should be documented with its derivation (why 12? what's the worst case per edge?).

---

## Final Verdict

**ACCEPT WITH AMENDMENTS: Proposal 1 (BPP) for T-junction elimination only.**

Amendments:
- A1: Add seam guard check for adjacent cells in BPP propagation
- A2: Add diagnostic warning for phantom slot overflow
- A3: Skip phantom propagation to chain cells (defer to Phase 2)
- A4: Build `phantomBoundaryMap` as a separate post-processing pass, never modifying phantom rows or super-cell R37 data

**REJECT: Proposal 5 (CPR) — two CRITICAL flaws must be resolved before reconsideration.**

**DEFER: Density gradient work to a separate round with dedicated measurement and design.**
