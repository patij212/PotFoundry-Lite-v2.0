# Verifier Round 2 — Critique of Generator R53 Phase 2: Chain-Cell T-Junction Elimination

Date: 2026-03-10

---

## Summary Verdict: ACCEPT WITH AMENDMENTS

The Generator's Proposal 1 (Full Sub-Band Decomposition) is algorithmically sound. The core decomposition approach — splitting chain cells at phantom T-values into sub-bands and dispatching each sub-band through existing `sweepQuad`/`constrainedSweepCell` — is architecturally correct and follows the proven R37 pattern. All five stated assumptions hold upon rigorous verification.

However, the proposal has **one critical implementation gap** that would produce corrupt geometry if not addressed: phantom vertices created during the dispatch loop are excluded from the final vertex buffer trim. Two additional MAJOR items require explicit attention in the implementation plan.

**Severity breakdown**: 1 CRITICAL, 2 MAJOR, 3 MINOR, 4 ACCEPTED (no issues)

---

## Critique

### Attack 1: Stale `phantomVertexCount` After Dispatch — CRITICAL

**Generator's claim**: The pseudocode creates new phantom vertices (matching vertices in Step 2, chain anchors in Step 4) during `emitChainSplitCell`, which executes inside the main dispatch loop (L1730-1775).

**Actual behavior**: `phantomVertexCount` is computed at L1366 (`phantomVertexCount = nextPhantomIdx - phantomVertexStart`) — **BEFORE** the dispatch loop. It is never updated after the loop. Two downstream consumers rely on this stale value:

1. **Batch 6 dedup** (L1794): `const totalVerts = totalVertexCount + phantomVertexCount` — new Phase 2 vertices are outside iteration range. They won't be deduped. This is **tolerable** (vertices are at unique positions).

2. **Final buffer trim** (L1953): `const usedVertexCount = totalVertexCount + phantomVertexCount; const finalVertices = vertices.subarray(0, usedVertexCount * 3)` — **Phase 2 phantom vertices are TRUNCATED from the output buffer.** Triangles emitted by `emitChainSplitCell` reference vertex indices beyond `usedVertexCount`. The returned `finalVertices` array doesn't contain these vertices. Result: **silent geometry corruption** (zero/uninitialized vertex coordinates, deformed mesh, potential GPU crash).

**Evidence**: 
- `phantomVertexCount` assigned once at [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1366)
- Batch 6 dedup range at [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1794)
- Buffer trim at [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1953)
- Buffer allocated with `maxPhantomSlots` headroom at [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L775) — physical space exists, but logical count is wrong

**Verdict**: REJECT without amendment

**Path to ACCEPT**: The Executioner must update `phantomVertexCount` AFTER the dispatch loop and BEFORE Batch 6 dedup:
```typescript
// After dispatch loop, before Batch 6:
phantomVertexCount = nextPhantomIdx - phantomVertexStart;
```
This single line fixes both issues (dedup range and buffer trim). The Generator's proposal document must explicitly call this out.

---

### Attack 2: Chain Edge Endpoint Matching in Sub-Bands — ACCEPT

**Generator's claim**: Chain sub-edge endpoints (created by Step 4 splitting) will be found by `constrainedSweepCell`'s `bot.indexOf(v0)` / `top.indexOf(v1)` because chain anchors are added to the appropriate sub-band boundaries.

**Actual behavior**: Verified correct through case analysis.

**Trace** — three cases for a chain edge `[chainBotV, chainTopV]` split at phantom T-values `[T_0, T_1, ...]`:

| Sub-band | bot boundary | top boundary | Sub-edge | bot.indexOf(sv0) | top.indexOf(sv1) |
|----------|-------------|-------------|----------|-------------------|-------------------|
| 0 (first) | `[BL, chainBotV, BR]` (botEdge) | `[leftP_T0, anchor_T0, rightP_T0]` | `[chainBotV, anchor_T0]` | ✓ chainBotV ∈ botEdge | ✓ anchor_T0 pushed to boundaries[1] in Step 4 |
| k (middle) | `[leftP_Tk-1, anchor_Tk-1, rightP_Tk-1]` | `[leftP_Tk, anchor_Tk, rightP_Tk]` | `[anchor_Tk-1, anchor_Tk]` | ✓ anchor_Tk-1 pushed to boundaries[k] | ✓ anchor_Tk pushed to boundaries[k+1] |
| N (last) | `[leftP_TN, anchor_TN, rightP_TN]` | `[TL, chainTopV, TR]` (topEdge) | `[anchor_TN, chainTopV]` | ✓ anchor_TN pushed to boundaries[N] | ✓ chainTopV ∈ topEdge |

**Evidence**: Step 4 pseudocode lines `boundaries[bndIdx].push(pIdx)` with `bndIdx = phantomTs.indexOf(tCross) + 1` correctly maps phantom T-values to boundary indices (offset by 1 for botEdge at index 0). Step 6 sorts each boundary by U before dispatch. `constrainedSweepCell` tries both orientations (L340-347), handling both `[sv0_on_bot, sv1_on_top]` and reversed.

**Verdict**: ACCEPT — chain edge endpoint matching works correctly in all sub-band positions.

---

### Attack 3: Cross-Column Chain Edges in Non-Super-Cell Adjacent Chain Cells — ACCEPT

**Generator's claim** (implicit): Adjacent chain cells only contain same-column chain edges, so `constrainedSweepCell` will always find endpoints on botEdge/topEdge.

**Actual behavior**: Verified correct. Cross-column chain edges at L952-969 trigger fusion requests, creating super-cells spanning `[cMin, cMax]`. ALL cells from `cMin` to `cMax` become part of `superCellCols`. A chain cell at `colEnd+1` that is NOT in `superCellCols` can only have:
- Same-column chain edges (both endpoints within the cell's column; `gc0 === gc1` path at L946)
- Chain vertices on bot/top edges from `botChainVerts`/`topChainVerts`

**Evidence**: 
- Cross-column edge registration at [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L957-L964): `for (let c = cMin; c <= cMax; c++)` — ALL crossed cells are registered
- Fusion request at [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L967): ALL these cells become part of a super-cell
- If any overlapping cross-column edge extends into `colEnd+1`, the fusion merger (L1000-1040) would merge it into the super-cell

**Scenario test**: Chain A creates super-cell cols 5-8. Chain B has edge from col 8 → col 9. Fusion merger produces super-cell cols 5-9. Col 10 is the adjacent cell. Col 10 only has same-column edges. ✓

**Verdict**: ACCEPT — no cross-column edges can exist in non-super-cell adjacent chain cells.

---

### Attack 4: `phantomTs.indexOf(tCross)` Floating-Point Matching — MINOR

**Generator's claim**: Step 4 uses `phantomTs.indexOf(tCross)` to find which boundary to add the chain anchor to.

**Actual behavior**: In the pseudocode, `crossedTs` is populated by iterating over `phantomTs` directly:
```typescript
for (const tKey of phantomTs) {
    if ((t0 - tKey) * (t1 - tKey) < 0) {
        crossedTs.push(tKey);
    }
}
```
Then the inner loop iterates `for (const tCross of crossedTs)`. Since `tCross` is a value taken **directly from** `phantomTs` (same object reference path), `phantomTs.indexOf(tCross)` compares identical floating-point values. JavaScript `===` on identical IEEE 754 values returns `true`. No floating-point mismatch.

**Risk**: If the Executioner refactors to re-derive T-values (e.g., re-reading from `vertices[pIdx * 3 + 1]` instead of using the quantized `phantomTs` value), the values could differ by up to 5e-9 (quantization error from `Math.round(t * 1e8) / 1e8`). `indexOf` would silently return -1, causing `boundaries[0].push(pIdx)` which corrupts botEdge.

**Verdict**: ACCEPT with note

**Path to ACCEPT**: The Executioner must preserve the invariant that `crossedTs` values are identity-equal to `phantomTs` values. Add a code comment warning against re-derivation. Alternatively, use an epsilon-based lookup instead of `indexOf`.

---

### Attack 5: Chain Edges Entirely Within One Sub-Band — MINOR

**Generator's claim** (A1): "Every chain edge spans from a bot-edge vertex to a top-edge vertex (crosses 1 band exactly)."

**Actual behavior**: The filter at L884 enforces `r1 - r0 ≤ 1`. Two sub-cases:

1. **`r1 - r0 === 1`** (normal): Edge spans full band. Crosses ALL interior phantom T-values. Step 4 splits it correctly. ✓

2. **`r1 - r0 === 0`** (degenerate horizontal): Both endpoints on same row. Edge is horizontal at `T_bot` or `T_top`. `crossedTs` is empty → edge kept whole in `allSubEdges`. In Step 5, both endpoints are in `boundaries[0]` (if on botEdge) or `boundaries[N+1]` (if on topEdge). Neither `subBotSet.has(sv0) && subTopSet.has(sv1)` nor the reverse matches **any** sub-band → edge is **silently dropped**.

**Evidence**: 
- Filter at [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L884)
- Current `constrainedSweepCell` has the same behavior: horizontal edges fail `bot.indexOf(v0)` + `top.indexOf(v1)` → silently ignored (L340-347)

**Verdict**: ACCEPT — this is an existing limitation, not a regression. Horizontal chain edges are extremely rare (would require `batch2Remap` to merge two chain vertices onto the same row). The Generator's proposal does not make this worse.

---

### Attack 6: A4 Pre-Splitting Interaction — ACCEPT

**Generator's claim** (A4): "`cellChainMap` stores independent copies... A4 doesn't affect `cellChainMap`."

**Actual behavior**: Verified correct through code trace.

**Evidence**:
- `cellChainMap` constructed at L880-975. Chain edges stored via `info.chainEdges.push([v0, v1])` at [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L950) (same-col) and [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L963) (cross-col). Each `[v0, v1]` is a **new array literal** — independent of master `chainEdges`.
- A4 at [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1370-L1383): `chainEdges.length = 0; chainEdges.push(...newEdges)` — replaces array contents entirely. Does not modify existing `[v0, v1]` tuple objects.
- `cellChainMap` entries for non-super-cell chain cells retain the **original unsplit** edges (full band height). This is precisely what `emitChainSplitCell` needs — Step 4 performs its own splitting.

**Verdict**: ACCEPT — independent copies confirmed. No interaction with A4.

---

### Attack 7: Direct Allocation vs `upsertPhantomRowVertex` — MAJOR

**Generator's claim** (pseudocode): Creates matching vertices and chain anchors via direct `nextPhantomIdx++` allocation without overflow guard or dedup.

**Actual behavior**: `upsertPhantomRowVertex` (L1087-1120) provides:
1. **Overflow guard** (L1106-1108): Returns fallback vertex if `nextPhantomIdx >= totalVertexCount + maxPhantomSlots`
2. **Same-type dedup** (L1089-1105): Prevents duplicate vertices at same U within R37_U_MERGE tolerance
3. **R52 type separation** (L1093-1100): Chain anchor vs column boundary cross-reuse prevention

The pseudocode's direct allocation lacks **all three guards**.

**Risk assessment**:
- **Overflow**: Low probability (45,325 slot headroom vs ~400-2500 estimated new vertices) but catastrophic if it occurs (buffer overrun → memory corruption)
- **Dedup**: Low risk for matching vertices (unique per-cell positions). Negligible for chain anchors (unique intersection points).
- **R52**: Not applicable for matching vertices (column boundary type). Correctly handled for chain anchors via `phantomChainAnchorSet.add(pIdx)`.

**Verdict**: REJECT without amendment

**Path to ACCEPT**: The Executioner must add an overflow guard before every `nextPhantomIdx++`:
```typescript
if (nextPhantomIdx >= totalVertexCount + maxPhantomSlots) {
    console.warn('[CDT] R53 Phase 2: phantom slot overflow');
    // fallback: skip this sub-band split, emit as regular chain cell
    emitChainCell(band, col, info);
    return;
}
```
For matching vertices, consider using `upsertPhantomRowVertex` directly (creates a `rowVerts` array for the boundary row). For chain anchors, direct allocation with overflow guard is acceptable.

---

### Attack 8: Shared Vertices Between Super-Cell and Adjacent Chain Cell — ACCEPT

**Generator's claim** (implicit): Phantom boundary vertices from `phantomBoundaryMap` are shared between the super-cell and adjacent chain cell, producing a watertight boundary.

**Actual behavior**: Verified correct.

**Evidence**: 
- `emitSuperCell` at [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1670-L1700): R37 band-splitting uses `boundaries` arrays built from `phantomRows[k].vertexIndices`. The boundary vertex at `(unionU[colEnd+1], T_k)` is in the rightmost position of each phantom row.
- BPP at [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1420-L1430): `rightPhantoms` (or `leftPhantoms`) populate `phantomBoundaryMap` for the adjacent cell using the **same vertex index** `vIdx` from the super-cell's phantom rows.
- Both `emitSuperCell`'s sub-band boundary and `emitChainSplitCell`'s sub-band boundary reference the **identical vertex index**. Triangles on both sides share this vertex. The shared edge along the column boundary `U = unionU[colEnd+1]` from `T_k` to `T_{k+1}` (or to corner vertices) is produced by both sides.

**Scenario trace**: Super-cell cols 5-8 with phantom row at T=0.715. Vertex `pV42` at `(unionU[9], 0.715)`. 
- Super-cell: `boundaries[1] = [..., pV42]`. Right sub-band right edge includes `pV42`.
- Adjacent cell (col 9): `bppInfo.leftPhantoms = [pV42]`. `boundaries[1] = [pV42, rightMatchingV]`. Left sub-band left edge includes `pV42`.
- Both sides produce triangles connecting `pV42` to the corner vertex at `(unionU[9], T_bot)` and `(unionU[9], T_top)`. Shared edge. No T-junction. ✓

**Verdict**: ACCEPT — vertex sharing is correct and produces watertight boundaries.

---

### Attack 9: Assumption A2 — Phantom Slot Headroom — ACCEPT

**Generator's claim**: Current headroom is 45,325 slots, with estimated usage of ~400-2500.

**Actual behavior**: `maxPhantomSlots = chainEdges.length * 12` at [OuterWallTessellator.ts](src/renderers/webgpu/parametric/OuterWallTessellator.ts#L775). For a typical style with ~200 chain edges, this gives ~2400 slots. Current R37 usage is `phantomVertexCount` (typically ~100-300 for styles with column crossings). The arithmetic checks out: headroom is abundant.

**Caveat**: The slot budget is proportional to `chainEdges.length`, which varies by style. For styles with very few chain edges (e.g., simple cylinder), `maxPhantomSlots` could be small. But these styles also have very few chain cells adjacent to super-cells (or no super-cells at all), so the Phase 2 vertex demand is proportionally tiny.

**Verdict**: ACCEPT — headroom is sufficient across all realistic scenarios.

---

### Attack 10: Assumption A5 — `constrainedSweepCell` Degenerate Guards — ACCEPT

**Generator's claim**: `constrainedSweepCell` correctly handles sub-quads with 2-vertex boundaries via existing degenerate guards at L354-360.

**Actual behavior**: Interior sub-band boundaries have 2 vertices (left phantom + right phantom) plus 0-1 chain anchors (from Step 4). Total: 2-3 vertices per interior boundary.

When `constrainedSweepCell` partitions an interior sub-band with a chain sub-edge:
- Chain anchor on bot boundary + chain anchor on top boundary → partition.
- Left sub-quad: `bot.slice(0, anchorBotPos+1)`, `top.slice(0, anchorTopPos+1)` → `[leftP, anchor]` and `[leftP, anchor]` → 2×2. Valid. ✓
- Right sub-quad: `bot.slice(anchorBotPos)`, `top.slice(anchorTopPos)` → `[anchor, rightP]` and `[anchor, rightP]` → 2×2. Valid. ✓

Degenerate guard at L354: `if (subBot.length < 2 || subTop.length < 2)` catches the impossible case where slicing produces a 1-element array.

**Verdict**: ACCEPT — degenerate guards handle all sub-band configurations.

---

## Accepted Items

1. ✅ **Core algorithm (Sub-Band Decomposition)**: Sound. Follows R37 pattern faithfully.
2. ✅ **Chain edge endpoint matching**: Sub-edges correctly assigned to sub-bands via boundary set membership.
3. ✅ **Cross-column edge filtering**: Adjacent chain cells cannot have cross-column edges.
4. ✅ **A4 independence**: `cellChainMap` stores independent copies; A4 doesn't affect them.
5. ✅ **Shared vertex correctness**: Super-cell and adjacent chain cell share phantom boundary vertices; watertight boundary.
6. ✅ **R52 compliance**: Matching vertices are column boundary type; chain anchors are chain anchor type. No cross-type merging.
7. ✅ **Winding correctness**: All triangles go through `emitTriCCW` via existing functions.
8. ✅ **Seam guards**: Pre-existing BPP seam guard (adjUSpan check) filters seam-adjacent cells.
9. ✅ **All 5 Generator assumptions**: Verified correct (A1 with minor horizontal edge caveat, A2-A5 fully confirmed).
10. ✅ **BPP filter change**: Removing `!cellChainMap.has(adjKey)` at L1413/L1443 is correct and necessary.

---

## Required Amendments (Before Implementation)

### Amendment A (CRITICAL): Update `phantomVertexCount` after dispatch loop

The Executioner MUST add this line after the dispatch loop (after L1775) and before Batch 6 dedup (L1790):

```typescript
// R53 Phase 2: Update phantom count to include vertices created by emitChainSplitCell
phantomVertexCount = nextPhantomIdx - phantomVertexStart;
```

Without this, `finalVertices` at L1953 truncates Phase 2 phantom vertices from the output buffer. Triangles referencing these vertices would read zero/garbage coordinates.

### Amendment B (MAJOR): Add overflow guard to `emitChainSplitCell`

Every `nextPhantomIdx++` in the new function must check against the phantom slot budget:

```typescript
if (nextPhantomIdx >= totalVertexCount + maxPhantomSlots) {
    console.warn('[CDT] R53 Phase 2: phantom slot overflow');
    emitChainCell(band, col, info); // graceful fallback
    return;
}
```

### Amendment C (MAJOR): Protect `phantomTs.indexOf` invariant

Either:
- (Preferred) Replace `indexOf` with epsilon-based lookup: `const bndIdx = phantomTs.findIndex(t => Math.abs(t - tCross) < 1e-10) + 1`
- Or add a code comment on `crossedTs.push(tKey)` warning that `tKey` MUST be identity-equal to the `phantomTs` entry

---

## Implementation Conditions (for Executioner)

1. Implement `emitChainSplitCell` as described in Proposal 1, with Amendments A, B, C applied.
2. Remove `!cellChainMap.has(adjKey)` filter at L1413 and L1443.
3. Add dispatch branch: `if (bppInfo) { emitChainSplitCell(...) } else { emitChainCell(...) }`.
4. Update `phantomVertexCount` after dispatch loop (Amendment A).
5. Run validation: `npm run typecheck && npm run lint && npm test`.
6. Test with Gothic Arches style (highest chain density) and verify:
   - Valence-3 count drops from ~2,129 toward 0
   - Chain edge enforcement rate stays at 100%
   - No new `console.warn` about phantom slot overflow
   - STL export is watertight (no holes at chain-cell / super-cell boundaries)

---

## Open Questions for Generator

1. **Master `chainEdges` update**: The Generator says "don't update master array" for Phase 2 sub-edges. This means the chain edge enforcement diagnostic at L1860+ will count the ORIGINAL edge as missing (since the original endpoints aren't directly connected — they're connected through anchors). The enforcement rate might report false positives (edges counted as "missing" even though the chain path is correctly represented via sub-edges). Should Phase 2 register its sub-edges in `edgeSplitMap` to update the master array, matching R37's pattern?

2. **Batch 6 dedup of Phase 2 vertices**: After applying Amendment A, Phase 2 vertices fall within the Batch 6 dedup range. Is this desirable? Matching vertices at column boundary U-positions might dedup with R37's column boundary vertices at the same `(U, T)` position (if the same phantom T-value exists in both the super-cell and the adjacent chain cell's boundary). This would be **correct** dedup (same position, same type) and is actually beneficial. Confirm this is intentional.
