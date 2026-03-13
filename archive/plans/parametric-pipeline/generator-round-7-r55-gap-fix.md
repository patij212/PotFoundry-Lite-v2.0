# Generator Round 7 — R55 Coalescing Boundary Edge Gap Fix

Date: 2026-03-10

## Problem Statement

R55 grid/chain vertex coalescing in `OuterWallTessellator.ts` produces ~3,530 new boundary edges (T-junctions) in the exported mesh, up from the 2,256 baseline (seam, rim, inner/outer wall joints). These manifest as rainbow-colored spikes along ridge lines in the 3D-printed mesh.

## Root Cause Analysis

### The Precise Mechanism (code-verified)

The root cause is a **cross-column coalescing mismatch** arising from the interaction between R55's global post-processing remap and the column-based chain vertex registration in `cellChainMap`.

**Critical code path — chain vertex registration** ([OuterWallTessellator.ts](../../../potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L988-L1001)):

```typescript
// A chain vertex at rowIdx=r is assigned to BOTH adjacent cells:
if (cv.rowIdx > 0) {
    const key = cellKey(cv.rowIdx - 1, gc);  // gc = bsearchFloor(unionU, cv.u)
    info.topChainVerts.push(cv.vertexIdx);    // cell above gets it on top edge
}
if (cv.rowIdx < numT - 1) {
    const key = cellKey(cv.rowIdx, gc);
    info.botChainVerts.push(cv.vertexIdx);    // cell below gets it on bot edge
}
```

This bidirectional registration means **both cells sharing a row boundary get the chain vertices** — so normally, no T-junctions exist between vertically adjacent chain cells. The pre-R55 baseline of 2,256 boundary edges confirms this.

**Where R55 breaks it — the column boundary edge case:**

1. Chain vertex `C` at `rowIdx=r` has `u = unionU[col] - ε` (just left of a column boundary)
2. `bsearchFloor(unionU, C.u)` returns `col-1` → C is assigned to column `col-1`
3. Grid vertex `G = r * numU + col` (at the column boundary itself) is in column `col`
4. Both `C` and `G` are within `GRID_CHAIN_COALESCE_RADIUS = 0.0006` U of each other
5. A **super-cell** spanning columns `col-1` through `col` (or wider) has both `C` and `G` on its bottom/top edge
6. R55 `coalesceNearGridChain()` drops `G`, records `coalMap: G → C` (line 380)
7. Cell `(r-1, col)` below `G`:
   - C was registered to cell `(r-1, col-1)` (column `col-1`), **not** to cell `(r-1, col)`
   - If no other chain vertices are at row `r` in column `col`, cell `(r-1, col)` is a **standard cell** — not in `cellChainMap`
   - Emitted via `emitStandardCell()`: 2 triangles, top edge = single edge `TL—TR`
8. **Post-processing remap** (lines 2164-2168): blanket replacement of all `G` references → `C`
   - Standard cell's `TL = G → C` in the index buffer
   - Standard cell now has top edge `C—TR` as a **single mesh edge**
9. The super-cell's bottom edge has `[..., C, other_chain_verts, G_next_col, ...]`
   - Between `C` and the next vertex, there may be additional chain vertices
   - These create edges `C—chainV₂`, `chainV₂—...` that the standard cell doesn't share
10. **Result: T-junction** — `chainV₂` lies on the standard cell's `C—TR` edge but isn't a vertex of the standard cell's triangulation

### Why the Cross-Cell Guard Doesn't Fix This

The cross-cell guard in `coalesceNearGridChain()` (lines 353-361) handles the case where `G` was already coalesced by a previous cell:

```typescript
const existing = coalMap.get(v);
if (existing !== undefined) {
    if (!edge.includes(existing)) {
        result.push(v);  // KEEP v — target not on this edge
    }
    continue;
}
```

When cell `(r, col)` (a different chain cell, not the super-cell) processes `G`:
- `coalMap.get(G)` returns `C` (set by the super-cell)
- If `C` is NOT on this cell's edge → `G` is KEPT on the edge during triangulation
- But the **post-processing remap still replaces `G → C` globally** — including in this cell!
- The cell was triangulated with `G` at position `(unionU[col], tPositions[r])`, but after remap it references `C` at `(unionU[col]-ε, tPositions[r])`
- The edge geometry changes slightly but the real damage is to adjacent standard cells

### The Same Pattern Horizontally

When a chain cell at `(band, col)` coalesces `BR → C_right` (chain vertex near the right boundary), and cell `(band, col+1)` is a standard cell with `BL = BR`, the same T-junction occurs on the shared vertical boundary.

### Summary of Preconditions

T-junctions occur when ALL of these are true:
1. R55 coalesces grid vertex `G` to chain vertex `C`
2. `C` is assigned to a **different column** than `G` (cross-column coalescing)
3. An adjacent cell sharing `G` as a corner is a **standard cell** (not in `cellChainMap`)
4. The post-processing remap changes the standard cell's corner `G → C`, creating an edge that doesn't match the chain/super cell's subdivided edge

## Approach Analysis

### Approach A: R55-BPP (Horizontal Chain Vertex Propagation)

**Idea**: After coalescing, propagate chain vertices from chain/super-cell edges to adjacent standard cells' shared edges. Analogous to R53 BPP for vertical edges.

**Mechanism**:
1. After the emission loop, scan `coalMap` for each `G → C`
2. Identify standard cells adjacent to `G` (via `quadMap[key] >= 0`)
3. Collect chain vertices between `C` and the next shared boundary vertex on the chain cell's edge
4. Re-emit the standard cell with the propagated chain vertices on the appropriate edge, using `sweepQuad`
5. Zero out old triangles in `indexBuf` (via `quadMap` position), append new triangulation

**Trade-offs**:
- ✅ Complete fix — eliminates ALL R55-induced T-junctions
- ✅ Preserves full R55 aspect ratio improvement (183:1 max)
- ✅ Architectural precedent: R53 BPP does the same thing for vertical edges
- ❌ Complex: requires determining which chain vertices to propagate per affected cell
- ❌ Post-emission re-emit is fragile (indexBuf surgery via zero-and-append)
- ❌ Must interact correctly with R53 BPP (cells could need both horizontal chain propagation AND vertical phantom propagation)
- ❌ Discovering the "chain vertices between C and next vertex" requires reconstructing the chain cell's edge array after emission

**Assumptions** (for Verifier to attack):
1. `quadMap[key] >= 0` reliably identifies standard-cell positions in `indexBuf`
2. Zero-and-append preserves mesh integrity (degenerate [0,0,0] triangles are harmless)
3. No standard cell needs both R53 BPP and R55 chain propagation simultaneously (or if it does, the two can be composed)

### Approach B: Don't Drop — Only Keep Grid Vertex

**Idea**: Disable the DROP in R55 coalescing. Keep grid vertex `G` on the chain cell's edge alongside chain vertex `C`. Both cells continue to use `G`. No remap needed.

**Mechanism**: In `coalesceNearGridChain()`, never add `G` to `coalMap` and never remove it from the result. Effectively disable R55.

**Trade-offs**:
- ✅ Zero T-junctions — mesh is identical to pre-R55
- ✅ Trivially simple — delete the `coalesceNearGridChain` calls and post-processing remap
- ❌ **Defeats R55's purpose entirely** — pin triangles return (aspect ratio 1814:1)
- ❌ Pin triangles cause CSO/subdivision quality degradation downstream

**Assumptions**: None — this is reverting R55.

### Approach C: Symmetric Coalescing (Pre-emission Propagation)

**Idea**: Before the emission loop, pre-compute coalescing and propagate chain vertices to adjacent cells. Similar to how R53 BPP pre-registers `phantomBoundaryMap`.

**Mechanism**:
1. Before the emission loop, iterate all chain cells and super-cells
2. For each, build bot/top edges and simulate `coalesceNearGridChain` to build `coalMap`
3. For each `G → C` in `coalMap`, identify adjacent standard cells
4. Build a `coalBoundaryMap: Map<cellKey, { topChainVerts, botChainVerts }>` with propagated chain vertices
5. During emission, if a cell has a `coalBoundaryMap` entry, include the propagated vertices and use `sweepQuad`

**Trade-offs**:
- ✅ Clean architecture: propagation happens before emission, no indexBuf surgery
- ✅ Same approach as R53 BPP — proven pattern
- ✅ Preserves full R55 aspect ratio improvement
- ❌ Must replicate edge-building logic from `emitChainCell`/`emitSuperCell` in the pre-scan
- ❌ For super-cells, edge construction is complex (intermediate columns, R37 phantom rows, dedup)
- ❌ coalMap must be computed twice: once in pre-scan, once during actual emission — must be identical
- ❌ Risk of pre-scan vs emission divergence if code changes

**Assumptions**:
1. Pre-scan edge construction can be factored out from emit functions without breaking them
2. coalMap results are deterministic between pre-scan and emission

### Approach D: Corner-Only Restriction (Don't Coalesce Corner Vertices)

**Idea**: In `coalesceNearGridChain()`, never coalesce the first or last vertex of the edge (the corners).

**Mechanism**: Add `if (i === 0 || i === edge.length - 1) { result.push(v); continue; }` at the start of the grid-vertex processing.

**Trade-offs**:
- ✅ Simple — one guard clause
- ❌ For regular chain cells, the ONLY grid vertices on bot/top edges ARE the corners (BL, BR, TL, TR). This disables R55 for ALL regular chain cells.
- ❌ For super-cells, intermediate column grid vertices are NOT corners of the edge array but ARE shared with cells above/below — still creates T-junctions
- ❌ Doesn't address the underlying cross-cell sharing problem

**Assumptions**:
1. Most R55 benefit comes from super-cell intermediate vertices, not corner vertices — **LIKELY FALSE**: chain cells far outnumber super-cells typically

### Approach S: Safe-Coalesce Guard (NEW — Recommended)

**Idea**: Only coalesce a grid vertex if ALL cells sharing it as a corner are chain/super cells (i.e., present in `cellChainMap` or `superCellCols`). Standard cells never get unexpected vertex remaps.

**Mechanism**:
1. Before the emission loop, build a `safeToCoalesce: Set<number>` containing grid vertex indices where all adjacent cells are chain/super cells
2. For each grid vertex `G = band * numU + col`, check the 4 cells sharing it:
   - `(band, col)` — G is BL
   - `(band, col-1)` — G is BR (if `col > 0`)
   - `(band-1, col)` — G is TL (if `band > 0`)
   - `(band-1, col-1)` — G is TR (if both `> 0`)
   - Cells outside bounds are ignored (rim/edge vertices)
   - Seam cells (`uSpan > SEAM_GUARD`) are treated as "safe" (they emit degenerate triangles anyway)
3. Mark `G` as safe ONLY if every in-bounds, non-seam adjacent cell is in `cellChainMap` OR `superCellCols`
4. In `coalesceNearGridChain()`, pass the `safeToCoalesce` set and skip coalescing for unsafe vertices

**Why this works**:
- When ALL adjacent cells are chain cells, they ALL have the chain vertices on the shared edge (from bidirectional `cellChainMap` registration). The cross-cell guard in `coalesceNearGridChain` ensures consistent coalescing across chain cells. No T-junctions.
- When ANY adjacent cell is a standard cell, that cell DOESN'T have chain vertices on the shared edge. Coalescing `G → C` and then remapping creates a T-junction. By skipping the coalesce, `G` remains on both cells' edges. The pin triangle between `G` and `C` persists in the chain cell, but the mesh is watertight.

**Trade-offs**:
- ✅ **Simple**: one pre-scan loop + one guard check in `coalesceNearGridChain`
- ✅ **Targeted**: only suppresses coalescing at chain-to-standard boundaries, where T-junctions occur
- ✅ **Preserves most R55 benefit**: the majority of coalescing occurs at chain-to-chain boundaries (interior of chain bands), which remain fully optimized
- ✅ **No indexBuf surgery**: no re-emission, no zero-and-append
- ✅ **No emission loop restructuring**: coalescing still happens inside emit functions
- ✅ **R53 BPP compatible**: orthogonal — BPP handles vertical phantom edges, this handles horizontal grid edges
- ⚠️ Pin triangles remain at chain-to-standard boundaries (~10-30% of current coalescing)
- ⚠️ Max aspect ratio may increase slightly from 183:1 toward ~300-500:1 at these boundary cells

**Assumptions** (for Verifier to attack):
1. The bidirectional chain vertex registration (`topChainVerts` + `botChainVerts`) ensures that ALL cells sharing a row boundary with chain vertices are in `cellChainMap`. If this invariant holds, then "all adjacent cells are chain cells" guarantees consistent edge subdivision.
2. The pre-scan correctly identifies all 4 cells sharing each grid vertex. Edge cases: seam cells, out-of-bounds cells at row 0 / row numT-1 / column 0 / column cellsPerRow-1.
3. The performance cost of the pre-scan is negligible (O(totalBands × cellsPerRow) with constant-time map lookups).
4. Pin triangles remaining at chain-to-standard boundaries don't cause downstream issues in CSO/subdivision. Since these are at chain BOUNDARIES (where the chain starts/ends), the pin triangles are less damaging than those in chain interiors.

## Recommended Approach

**Primary: Approach S (Safe-Coalesce Guard)**

This is the right fix because it directly addresses the root cause (cross-cell coalescing at chain/standard boundaries) with minimal code change and no architectural disruption. The pre-scan is ~20 lines. The guard in `coalesceNearGridChain` is 1 line.

**Fallback: Approach A (R55-BPP)** if Approach S leaves too many pin triangles at boundaries. Approach A is the "complete fix" — it propagates chain vertices so even standard cells can handle the coalescing. But it's significantly more complex and should only be pursued if the Approach S tradeoff (some pin triangles remain) causes visible quality regression.

**Do NOT pursue: Approach D** — it's overly restrictive (disables R55 for all regular chain cells) without solving the super-cell case.

## Detailed Implementation Plan — Approach S

### Step 1: Build `safeToCoalesce` Set

Insert before the emission loop (after `cellChainMap` and `superCellCols` are finalized, ~L1670):

```typescript
// R55-S: Pre-scan — identify grid vertices safe to coalesce.
// A grid vertex is safe IFF all cells sharing it as a corner are chain/super cells.
// This prevents T-junctions from the global post-processing remap.
const safeToCoalesce = new Set<number>();

for (let band = 0; band < totalBands + 1; band++) {   // +1 because row vertices span 0..numT-1
    for (let col = 0; col < cellsPerRow + 1; col++) {  // +1 for rightmost column boundary
        const vtx = band * numU + col;

        // Check all cells sharing this vertex as a corner
        // A cell (b, c) exists for b in [0, totalBands-1], c in [0, cellsPerRow-1]
        let allSafe = true;
        const neighbors = [
            [band, col],         // vtx is BL of this cell
            [band, col - 1],     // vtx is BR of this cell
            [band - 1, col],     // vtx is TL of this cell
            [band - 1, col - 1], // vtx is TR of this cell
        ];

        for (const [b, c] of neighbors) {
            if (b < 0 || b >= totalBands || c < 0 || c >= cellsPerRow) continue;

            // Check for seam cells (they emit degenerates — safe to ignore)
            const uSpan = unionU[c + 1] - unionU[c];
            if (uSpan > SEAM_GUARD || uSpan < -SEAM_GUARD) continue;

            const key = cellKey(b, c);
            if (!cellChainMap.has(key) && !superCellCols.has(key)) {
                allSafe = false;
                break;
            }
        }

        if (allSafe) {
            safeToCoalesce.add(vtx);
        }
    }
}
```

### Step 2: Pass `safeToCoalesce` to `coalesceNearGridChain`

Add parameter to function signature:

```typescript
function coalesceNearGridChain(
    edge: number[],
    verts: Float32Array,
    isGridLikeFn: (idx: number) => boolean,
    isChainLikeFn: (idx: number) => boolean,
    radius: number,
    coalMap: Map<number, number>,
    safeSet: Set<number>,       // NEW: grid vertices safe to coalesce
): number[] {
```

Add guard at the start of grid vertex processing:

```typescript
if (!isGridLikeFn(v)) { result.push(v); continue; }

// R55-S: Only coalesce if all adjacent cells are chain/super cells
if (!safeSet.has(v)) { result.push(v); continue; }  // NEW
```

### Step 3: Update All Call Sites

All 8 call sites pass the `safeToCoalesce` set as the last argument:

```typescript
coalesceNearGridChain(botEdge, vertices, isGridLike, isChainLike,
    GRID_CHAIN_COALESCE_RADIUS, coalesceMap, safeToCoalesce);
```

### Step 4: Handle Phantom Vertices

Phantom vertices (R37) created between `phantomVertexStart` and `nextPhantomIdx` are NOT in the grid vertex range `[0, gridVertexCount)`. The `isGridLike` function classifies them correctly:
```typescript
const isGridLike = (idx: number): boolean =>
    idx < gridVertexCount || (idx >= totalVertexCount && !phantomChainAnchorSet.has(idx));
```

Phantom grid-like vertices (`idx >= totalVertexCount`) won't be in `safeToCoalesce` (which only contains indices `band * numU + col` in range `[0, gridVertexCount)`). So they'll be skipped for coalescing by the safe guard. This is CORRECT — phantom vertices are shared between super-cell sub-bands and the standard cells above/below.

However, we may want to extend the safe check to phantom vertices if they're shared across cells. For Phase 1, skipping all phantom vertex coalescing is conservative and safe.

## Risk Assessment

### Low Risk
- **Regression**: Pin triangles at chain-to-standard boundaries already existed pre-R55. Re-introducing them at boundaries only (not interiors) is a minor regression from R55 but returns to the pre-R55 baseline, which had acceptable quality.
- **Performance**: The pre-scan is O(totalBands × cellsPerRow) with Map lookups — negligible vs. the GPU probing and tessellation work.
- **Interaction with R53 BPP**: Orthogonal. BPP handles vertical phantom edges on super-cell boundaries. This handles horizontal grid edges at chain/standard boundaries. No overlap.

### Medium Risk
- **Phantom vertex coalescing**: By excluding all phantom vertices from `safeToCoalesce`, we may lose some R55 benefit within super-cell R37 sub-bands. If this matters, Phase 2 can extend the safe check to phantom vertices.
- **Edge case**: Row 0 / row (numT-1) vertices and column 0 / column cellsPerRow vertices have fewer than 4 adjacent cells. The `continue` for out-of-bounds neighbors makes them "safe by default." This could be wrong if there's a chain cell at the boundary — verify at wall/rim joints.

### Low-Medium Risk
- **Aspect ratio increase at boundaries**: Some chain cells at chain start/end will retain pin triangles. Worst-case aspect ratio at those cells may be ~500:1 instead of the R55-improved 183:1, but this is localized to chain endpoints (small count) and below the pre-R55 baseline of 1814:1.

## Open Questions (Invite Verifier Scrutiny)

1. **Bidirectional registration invariant**: Is it ALWAYS true that a chain vertex at `rowIdx=r, column=gc` is registered to BOTH `cell(r-1, gc).topChainVerts` AND `cell(r, gc).botChainVerts`? Are there any code paths (batch2Remap, companion skip, seam guard) that could break this invariant?

2. **Super-cell intermediate grid vertices**: When a super-cell spans columns `colStart..colEnd`, intermediate grid vertices at `band * numU + c` (for `c` in `colStart+1..colEnd`) are shared with cells `(band-1, c)` above/below. Are those cells always in `cellChainMap`? What if the chain runs diagonally and skips column `c`?

3. **Seam cell treatment**: The pre-scan treats seam cells as "safe to ignore." Is this correct? A seam cell emits degenerate triangles (`[0,0,0, 0,0,0]`), so the coalesced vertex reference is harmless. But does the seam cell's vertex appear in a non-degenerate triangle in some edge case?

4. **Post-processing remap scope**: After Approach S, the `coalMap` will have fewer entries (only safe coalesces). The post-processing remap becomes smaller. Are there any downstream effects of having FEWER remaps? (e.g., does `batch6Remap` interact with `coalMap`?)

5. **Boundary edge regression target**: Will Approach S eliminate ALL ~3,530 new boundary edges, or will some persist from non-column-boundary mechanisms? If the latter, what's the expected residual count?
