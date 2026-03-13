# Generator Round 4 — R54 Chain-Strip Density Enhancement

Date: 2026-03-10

## Problem Statement

Chain-strip triangles from cell-local sweeps have catastrophic quality:
- 45.4% aspect ratio violations (>4:1), max 7940:1
- 4,682 degenerate triangles stripped (min angle 0.0°)
- 32,359 grading violations (>2:1 area ratio between neighbors)
- Chain-strip avg aspect = 7.8:1

The root cause is **zero density control** inside chain cells. The cell-local sweep (`constrainedSweepCell`) partitions cells at chain edge positions, producing sub-quads whose width is determined entirely by the chain edge's U-offset from the cell boundary. When a chain is nearly vertical (small ΔU), one sub-quad is extremely narrow → sliver triangles are geometrically inevitable.

## Root Cause Analysis

### The Geometry of the Sliver

A chain cell spans `[unionU[c], unionU[c+1]]` in U and `[tPositions[b], tPositions[b+1]]` in T. A chain edge from `(u_chain, t_bot)` to `(u_chain + δ, t_top)` partitions the cell into:
- **Left sub-quad**: width = `u_chain - unionU[c]`, height = `tPositions[b+1] - tPositions[b]`
- **Right sub-quad**: width = `unionU[c+1] - u_chain`, height = same

If the chain vertex sits at U=0.5002 and the cell spans [0.5000, 0.5015], the left sub-quad is 0.0002 wide and 0.0024 tall → aspect ≈ **12:1**. The sweep of a 2-vertex-per-edge sub-quad is exactly 2 triangles, each inheriting this aspect ratio.

### Why Existing Mechanisms Don't Help

| Mechanism | Scope | Gap |
|-----------|-------|-----|
| R37 phantom rows | Super-cells with column-boundary crossings only | Single-cell chain edges (majority) get ZERO phantom rows |
| R38 companions | Boundary crossings within super-cells only | Single-cell edges get ZERO companions |
| Micro-rows | Only for chains crossing >1 column per row step | Most chain edges are within one column |
| `densityMultiplier` et al. | Dead config since R34 | Completely ignored |
| R53 BPP | Propagates existing phantoms to neighbors | No new density; propagates what R37 creates |

**The critical gap**: For a single-cell chain edge (chain stays within one grid column), there are exactly 4 grid corner vertices + 2 chain edge vertices = 6 vertices, producing 4 triangles. Two of those triangles are the narrow sub-quad slivers. No existing mechanism injects additional vertices.

## Proposed Solution: R54 Intra-Cell Phantom Injection

### Strategy: Hybrid B+D (Intra-Cell Vertex Insertion + Generalized Phantom Rows)

I propose extending the R37 phantom concept to ALL chain cells, not just super-cells with column crossings. The key insight is:

**R37 only fires when a chain edge crosses a column boundary within a super-cell. But the MAJORITY of chain edges (single-cell, same-column) never trigger R37. These are exactly the cells with the worst aspect ratios.**

### Mechanism: R54 Chain-Cell Phantom Densification

For every cell with chain edge activity, inject phantom vertices to break narrow sub-quads into better-proportioned pieces. Two independent axes:

#### Axis 1: U-Phantom Injection (Width Densification)

**Problem**: When chain edge is near one cell boundary, one sub-quad is very narrow.

**Fix**: Insert phantom column vertices between the chain edge and the far cell boundary.

For a cell with chain vertex at `u_chain` in `[u_left, u_right]`:
- Compute `w_left = u_chain - u_left` and `w_right = u_right - u_chain`  
- Let `w_wide = max(w_left, w_right)`, `w_narrow = min(w_left, w_right)`
- If `w_wide / w_narrow > R54_ASPECT_THRESHOLD` (proposed: 3.0):
  - Insert 1-2 phantom U-positions in the WIDE sub-quad
  - Spacing: evenly divide the wide side: `u_phantom = u_chain + (u_far - u_chain) * k/(n+1)` for k=1..n
  - n = `floor(w_wide / w_narrow)` capped at `R54_MAX_U_PHANTOMS = 3`

These phantom positions become additional vertices on both the bottom and top edges of the cell, giving `sweepQuad`/`constrainedSweepCell` more vertices to sweep between.

**Vertex creation**: For each phantom U-position `u_p`:
- Create a bottom-edge phantom vertex at `(u_p, t_bot, surfaceId)` 
- Create a top-edge phantom vertex at `(u_p, t_top, surfaceId)`
- Insert into `botEdge` / `topEdge` arrays before sweep

**Key R52 protection**: Phantom vertices are at grid T-positions, not chain positions. They are grid-aligned in T, intermediate in U. They do NOT merge with chain vertices (different U). They do NOT merge with existing grid vertices (different U from column boundaries). The R52 precision lock on chain vertices is perfectly preserved.

#### Axis 2: T-Phantom Injection (Height Densification)

**Problem**: When band height >> cell width, ALL triangles in the cell are tall and narrow.

**Fix**: Insert phantom T-rows within the band at the chain cell.

For a chain cell where `bandHeight / cellWidth > R54_HT_RATIO` (proposed: 4.0):
- Insert `n_t = floor(bandHeight / cellWidth) - 1` phantom T-positions, capped at `R54_MAX_T_PHANTOMS = 3`
- Positions: evenly spaced: `t_phantom = t_bot + (t_top - t_bot) * k/(n_t + 1)`
- Create phantom vertices at `(u_left, t_phantom)` and `(u_right, t_phantom)` (grid column boundaries)
- Also create phantom vertices at `(u_chain_interp, t_phantom)` where the chain edge crosses this T-level (with R52 `phantomChainAnchorSet` tracking)
- This splits the cell into `n_t + 1` sub-bands, each swept independently

This is exactly the R37 mechanism, generalized to all chain cells rather than only super-cells with column crossings. The `emitChainSplitCell` (R53) already handles this sub-band decomposition pattern.

### Integration Architecture

The injection happens in a **new section 3.95** inside `buildCDTOuterWall`, AFTER:
- Section 3.9 (R37 super-cell phantom rows) — so super-cell phantoms exist
- R53 BPP propagation — so adjacent cell phantom boundaries exist

And BEFORE:
- Section 4 (cell emission loop) — so emitted cells see the new vertices

#### Implementation Plan

**New function**: `injectR54Phantoms()`

```
For each (band, col) in cellChainMap:
  If (band, col) is in a super-cell → SKIP (R37 handles it)
  
  Get chain edges for this cell
  For each chain edge (v0, v1) that partitions the cell:
    Compute u_chain_bot, u_chain_top (chain positions on bot/top edges)
    
    # Axis 1: U-densification
    For each edge (bot/top):
      w_left = u_chain - u_col_left
      w_right = u_col_right - u_chain
      If max/min > R54_ASPECT_THRESHOLD:
        Insert phantom U-vertices on the wide side
        Add to botEdge / topEdge for this cell
    
    # Axis 2: T-densification
    bandHeight = t_top - t_bot
    cellWidth = u_right - u_left
    If bandHeight / cellWidth > R54_HT_RATIO:
      Insert phantom T-rows within the cell
      Build sub-band boundaries (reusing emitChainSplitCell pattern)
```

#### Where Phantom Vertices Are Stored

Use the existing phantom vertex buffer with `maxPhantomSlots`. The current allocation is `chainEdges.length * 12` — R54 would need approximately:
- Per chain cell: up to 2 × (MAX_U_PHANTOMS × 2 + MAX_T_PHANTOMS × 4) = ~28 phantoms worst case
- But most cells need just 2-4 phantoms (one U-phantom pair on the wide side)
- Total estimate: ~4,000-8,000 new phantoms for 13 chains across 420 rows
- Current budget: `chainEdges.length * 12` ≈ 74,000 slots. R54 fits easily.

### How BPP (R53) Interacts

R54 phantoms at cell boundaries (left/right edges) become SHARED boundary vertices between the chain cell and its neighbor. The R53 BPP mechanism already handles this:
- If a neighbor already has BPP phantoms at this boundary, R54 must add its phantoms to the SAME T-positions
- If not, R54 creates the boundary phantoms and a BPP entry is added for the neighbor

**Implementation detail**: R54 injects AFTER initial BPP propagation. Any cell that receives R54 phantoms on a shared boundary triggers a **second-pass BPP propagation** to the neighbor cell's `phantomBoundaryMap`. This is limited to one hop (no cascading) because the phantom T-positions are unique to this cell.

### How R52 Precision Lock Is Preserved

R54 phantoms are classified into two types:
1. **Grid-aligned phantoms** (u = column boundary, new T): stored as regular phantoms, NOT in `phantomChainAnchorSet`
2. **Chain-interpolated phantoms** (u = chain edge at phantom T): stored in `phantomChainAnchorSet` via `upsertPhantomRowVertex(..., true)`

The R52 lock blocks are untouched:
- Block 1 (batch2Remap DISABLED): R54 doesn't re-enable it
- Block 2 (phantomChainAnchorSet type separation): R54 USES this correctly
- Block 3 (Batch 6 cross-type dedup guard): R54 phantoms go through the same dedup
- Block 4 (chain vertex positions): R54 never modifies chain vertex positions

## Code Paths Affected

| File | Section | Change |
|------|---------|--------|
| `OuterWallTessellator.ts` L780 | `maxPhantomSlots` | Increase multiplier from 12 to 16 (safety margin) |
| `OuterWallTessellator.ts` ~L1280 | New section 3.95 | `injectR54Phantoms()` — main injection logic |
| `OuterWallTessellator.ts` L1558 | `emitChainCell` | Modified to read R54 U-phantoms from an augmented edge map |
| `OuterWallTessellator.ts` L1593 | `emitChainSplitCell` | Modified to handle R54 T-phantoms (already has sub-band decomposition) |
| `OuterWallTessellator.ts` L1900-1945 | Cell emission loop | Route cells with R54 T-phantoms to `emitChainSplitCell` |

Files NOT changed:
- `ChainVertexBuilder.ts` — no changes (chain vertices untouched)
- `GridBuilder.ts` — no global grid changes (respects principle #9)
- `ParametricExportComputer.ts` — no signature changes
- `emitTriCCW`, `maxCosine2D` — untouched per Master's directive

## Expected Quality Improvements

### Axis 1 (U-Phantoms) Impact

For a cell with aspect-violating sub-quad (w_wide/w_narrow = 10:1):
- Before: 2 triangles with aspect ≈ 10:1
- After (2 U-phantoms): 6 triangles across the wide side, each ≈ 10:3 ≈ 3.3:1 ✓

**Predicted impact**: Reduces the ~25,000 triangles currently in narrow sub-quads to aspect < 4:1. This alone should cut the 45.4% violation rate to roughly 10-15%.

### Axis 2 (T-Phantoms) Impact

For tall-narrow cells (bandHeight/cellWidth = 6:1):
- Before: 4 triangles with height = 6× width
- After (2 T-rows): 3 sub-bands × 4 triangles, each with height = 2× width ✓

**Predicted impact**: Addresses the "globally tall" cells that affect ALL triangles, not just chain-adjacent ones. Should eliminate the extreme aspect ratios (>100:1) that come from tall bands.

### Combined Prediction

| Metric | Current | Predicted |
|--------|---------|-----------|
| Aspect ratio violations (>4:1) | 45.4% | ~8-12% |
| Max aspect ratio | 7940:1 | <50:1 |
| Min angle | 0.0° | >2° |
| Avg aspect ratio | 7.8:1 | ~2.5:1 |
| Grading violations | 32,359 | ~5,000-8,000 |
| Added vertices | 0 | ~4,000-8,000 |

## Risk Assessment

### Low Risk
1. **Phantom vertex overflow**: Current budget (74K slots) far exceeds R54 needs (~4-8K). Overflow guard already exists.
2. **Performance**: Linear scan of `cellChainMap` entries (~2,000 cells), O(1) per phantom. <1ms additional.
3. **R52 violation**: Zero risk — R54 creates NEW vertices at NEW positions, never modifies chain vertex positions or merges chain with grid.

### Medium Risk
4. **BPP second-pass propagation**: Adding R54 phantoms to shared boundaries requires a secondary BPP pass. If this isn't done, the neighbor cell has a T-junction. **Mitigation**: The second-pass loop is bounded (one hop, no cascade) and can be verified by checking all cell boundary consistency post-emission.
5. **Sub-band chain edge assignment**: When T-phantoms split a chain cell into sub-bands, chain sub-edges must be correctly assigned to sub-bands. The `emitChainSplitCell` pattern (L1700-1750) already handles this, but R54's phantom T-positions may differ from R53's. **Mitigation**: Reuse the exact same crossedTs/allSubEdges logic.
6. **Super-cell boundary interaction**: R54 skips super-cells (R37 handles them), but a single-cell chain cell can be ADJACENT to a super-cell. The BPP propagation from R37 to R54's augmented cell must compose correctly. **Mitigation**: R54 runs AFTER BPP, so it sees existing BPP entries and merges with them.

### High Risk
7. **Near-degenerate phantom spacing**: If a chain vertex is within `R37_DEGEN_GUARD_MIN = 1e-4` of a cell boundary, the "narrow" sub-quad is essentially zero-width. Inserting U-phantoms in the "wide" sub-quad is correct but the narrow side still produces degenerate triangles. **Mitigation**: Apply a `degenGuard` check — if `w_narrow < R54_MIN_NARROW_WIDTH = 5e-5`, collapse the narrow sub-quad by not partitioning at the chain edge for U-phantoms (keep the chain edge as a constraint but don't sub-quad it). This is a hard design decision the Verifier should scrutinize.

## Implementation Plan (Atomic Changesets)

### Changeset 1: R54 Infrastructure (No behavioral change)
- Add constants: `R54_ASPECT_THRESHOLD`, `R54_HT_RATIO`, `R54_MAX_U_PHANTOMS`, `R54_MAX_T_PHANTOMS`, `R54_MIN_NARROW_WIDTH`  
- Add interface: `R54CellPhantoms { uPhantomBot: number[]; uPhantomTop: number[]; tPhantomRows: number[][] }`
- Add data structure: `r54PhantomMap: Map<number, R54CellPhantoms>` (cellKey → phantoms)
- Increase `maxPhantomSlots` multiplier
- Add diagnostic logging: `[CDT] R54: N cells analyzed, M U-phantoms, P T-phantoms`

### Changeset 2: Axis 1 — U-Phantom Injection
- Implement U-phantom logic in new section 3.95
- Modify `emitChainCell` to incorporate U-phantom vertices into `botEdge`/`topEdge`
- Add BPP second-pass for shared boundary phantoms
- Wire into cell emission loop

### Changeset 3: Axis 2 — T-Phantom Injection
- Implement T-phantom logic (band splitting for single-cell chain edges)
- Route cells with T-phantoms to `emitChainSplitCell` or a new `emitR54Cell`
- Chain edge sub-splitting at phantom T levels (reuse R53 pattern)

### Changeset 4: Quality Gating and Diagnostics
- Add aspect-ratio and min-angle logging for chain-strip triangles
- Compare pre/post R54 quality metrics
- Guard: if R54 produces worse quality than baseline (shouldn't happen), disable with flag

## Open Questions (for Verifier)

1. **Axis 1 vs Axis 2 priority**: Should both axes be implemented, or is Axis 1 (U-phantoms) sufficient alone? My intuition says Axis 1 handles ~80% of the violations (narrow sub-quads), while Axis 2 handles the remaining ~20% (tall bands). The Verifier should check whether the 685×420 grid's actual band height / cell width ratios make Axis 2 necessary.

2. **R54_ASPECT_THRESHOLD value**: I propose 3.0 (trigger when one sub-quad is 3× wider than the other). Lower values add more vertices but improve quality. Higher values are more conservative. What does the Verifier think is the right threshold?

3. **Risk #7 (near-boundary chain vertices)**: My proposed `R54_MIN_NARROW_WIDTH` collapse might suppress legitimate feature fidelity for chain edges very close to cell boundaries. An alternative is to merge the narrow sub-quad with the neighbor cell (mini-super-cell fusion). The Verifier should evaluate which approach is safer.

4. **Interaction with CSO (Chain Strip Optimizer)**: R54 increases vertex count in chain cells. Do the CSO quality-gated flips (R47 P1) still work correctly with the additional phantom vertices? The phantoms should just be additional vertices in the sweep — no new constraint edges — so CSO shouldn't be affected. But the Verifier should confirm.

5. **Catmull-Rom subdivision interaction**: R54 phantoms are added before cell emission. The post-OWT subdivision step (if active) shouldn't affect R54 phantoms because they're on cell boundaries (edge vertices of triangles, not interior). But the Verifier should confirm that subdivision midpoints don't introduce T-junctions against R54 phantom boundaries.

6. **Is the phantom budget increase from 12× to 16× sufficient?** Worst case: 2,000 chain cells × 28 phantoms = 56,000 phantoms. With chain edge count ≈ 6,179, 16 × 6,179 = 98,864 slots. Should be sufficient, but the Verifier should verify this bound.
