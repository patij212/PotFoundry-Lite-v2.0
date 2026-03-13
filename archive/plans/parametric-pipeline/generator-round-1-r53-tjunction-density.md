# Generator Round 1 — R53: T-Junction Elimination and Mesh Density Gradient

Date: 2026-03-10

---

## Problem Statement

Two structural defects remain in the outer wall tessellation pipeline:

**Problem 1 (T-Junctions):** The R37 phantom vertex system creates boundary phantom vertices at `unionU[colStart]` and `unionU[colEnd+1]` that split the shared vertical edge between a super-cell and its adjacent cell. The adjacent cell (standard or chain cell) triangulates with only its grid corners and cannot see these phantom vertices. This creates T-junctions — vertices connected on one side of a shared edge but not the other. Evidence: 3,404 valence-3 vertices (T-junction signature), `min_angle=0.0°`, `max_aspect=7939.9:1`.

**Problem 2 (Missing Density Gradient):** All historical companion/fan systems are disabled (T-Ladder collinearity bugs, U-Graded Fan budget issues, Shadow Boundary coincidence bugs). Zero density transition between chain feature resolution (~243 vertices per chain) and the coarse grid (~558 columns). This produces extreme triangle quality degradation (42.8% chain-strip violations >4:1 aspect).

---

## Root Cause Analysis

### T-Junction Root Cause (Traced to Code)

**Where phantom boundary vertices are created:**
[OuterWallTessellator.ts](../../../potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1199-L1201) — The phantom row creation loop:
```typescript
// Column boundary vertices
for (let c = r37Sc.colStart; c <= r37Sc.colEnd + 1; c++) {
    upsertPhantomRowVertex(rowVerts, tCross, unionU[c]);
}
```

This creates phantom vertices at ALL column boundaries of the super-cell, including `colStart` and `colEnd+1`. These two positions are the shared vertical edges with adjacent cells.

**Where adjacent cells are unaware:**
[OuterWallTessellator.ts](../../../potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1415-L1419) — `emitStandardCell` uses only four grid corners:
```typescript
const bl = b * numU + c;
const br = b * numU + (c + 1);
const tl = (b + 1) * numU + c;
const tr = (b + 1) * numU + (c + 1);
```
No awareness of phantom vertices on shared edges.

**The T-junction mechanism:**
1. Super-cell spans columns 5-8, phantom row at T=0.73
2. Phantom vertex created at (U=unionU[5], T=0.73) — on the left boundary
3. Adjacent cell at column 4 uses corners: BL=(U[4], T_bot), BR=(U[5], T_bot), TL=(U[4], T_top), TR=(U[5], T_top)
4. The phantom vertex sits ON edge BR→TR at T=0.73, but cell 4's two triangles connect BR directly to TR
5. **Result: mesh crack at the phantom vertex**

Similarly for the right boundary at `colEnd+1`.

### Density Gradient Root Cause

**All enrichment systems disabled/removed:**
- T-Ladder (R5-R6): center companion collinear with constraint edges → CDT failure
- U-Graded Fan (R19-R20): budget system killed companions at lowest density settings 
- Shadow Boundary (R21): self-row projection causes chain→shadow coincidence → D-Radical promotion destruction

**The architectural lesson from section 5.1.7:** "More companions is NOT the answer for CDT slivers — the issue is CDT domain SHAPE, not point density." This means any new density gradient must work through TOPOLOGY (cell subdivision), not through POINT INSERTION into CDT.

**Current state:** Chain vertices at exact feature positions produce triangles connecting to grid vertices ~0.015-0.04 U away. With grid row spacing ~0.003 T, this creates aspect ratios of 5:1 to 13:1 in the transition zone.

---

## Proposals

### Proposal 1: Boundary Phantom Propagation (BPP) — T-Junction Fix (Conservative)

**Idea:** Propagate phantom boundary vertices to adjacent cells by splitting those cells' shared edges, converting them from standard 2-triangle cells to multi-triangle cells. No new vertex positions needed — use the existing phantom vertices.

**Mechanism:**

1. **Build a phantom boundary registry** after phantom row creation (after OWT L1290):
   ```
   phantomBoundaryMap: Map<string, number[]>
   // key: `${band}-${col}-${side}` where side = 'left' | 'right'
   // value: phantom vertex indices on that boundary, sorted by T
   ```
   
2. **For each super-cell**, register its boundary phantom vertices:
   - Left boundary (col = `colStart`): all phantom vertices at `U = unionU[colStart]`
   - Right boundary (col = `colEnd+1`): all phantom vertices at `U = unionU[colEnd+1]`
   
3. **Modify `emitStandardCell`** to check the phantom boundary registry:
   - Before emitting the standard 2-triangle quad, check if `phantomBoundaryMap` has entries for this cell's left edge (`band-col-right` of super-cell left neighbor) or right edge
   - If phantom vertices exist on a vertical edge, the cell becomes a "split cell":
     - Vertical edge [BL, phantom1, phantom2, ..., TL] replaces the simple [BL, TL] edge
     - Triangulate using a fan from the opposite corners
     
4. **Triangulation of split cells** — straightforward monotone sweep:
   - Left edge split: bot = [BL, BR], top = [TL, TR], left side has phantoms
   - Use constrained fan: BL → phantom₁ → phantom₂ → TL, each paired with BR or TR
   - Actually simpler: treat as a multi-edge polygon and sweepQuad between the two vertical edges

**Pseudocode for split-cell triangulation:**
```
function emitSplitCell(band, col, leftPhantoms, rightPhantoms):
    BL = band * numU + col
    BR = band * numU + (col + 1)  
    TL = (band+1) * numU + col
    TR = (band+1) * numU + (col + 1)
    
    // Build left edge: BL, ...sorted phantoms on left..., TL
    leftEdge = [BL, ...leftPhantoms sorted by T ascending, TL]
    
    // Build right edge: BR, ...sorted phantoms on right..., TR
    rightEdge = [BR, ...rightPhantoms sorted by T ascending, TR]
    
    // These are two vertical edges of the quad. We need to triangulate
    // the quad connecting them. Since both edges share the same U but
    // differ in T, we can sweep vertically using sweepQuad with
    // T as the "U" direction (the edges are T-monotone).
    
    // Actually: sweepQuad expects horizontal edges (sorted by U).
    // For a vertically-split cell, we need a different approach.
    
    // Use explicit fan triangulation from each horizontal strip:
    for each consecutive pair of T-values across both edges:
        emit triangle connecting the 3 or 4 vertices at those T-levels
```

**Better approach — reuse existing machinery:**

The cell has bot edge [BL, BR] and top edge [TL, TR], but with phantom vertices splitting the left and/or right vertical edges. We can decompose into horizontal strips:

```
If left edge has phantoms [p1, p2] (sorted by T, between BL and TL):
    Strip 1: bot=[BL, BR], top=[p1, BR or interpolated_right]
    Strip 2: bot=[p1, ...], top=[p2, ...]
    Strip 3: bot=[p2, ...], top=[TL, TR]
    
Problem: the right edge has no matching vertices at p1.T, p2.T
unless we also create phantom vertices on the right edge.
```

**This is the key insight:** Rather than creating new vertices on the non-phantom side, we triangulate the split cell as a simple polygon with the phantom vertices included. The polygon is: `BL → BR → (right phantoms ascending) → TR → TL → (left phantoms descending)`, a simple polygon.

**Ear-clipping or fan from interior point** would work, but simpler is:

**Strip decomposition:** Sort ALL phantom boundary vertices (left + right combined) by T. Each consecutive T-value pair creates a horizontal strip. Each strip is a quad (or degenerate quad) that can be swept with `sweepQuad`.

For the common case (phantom on one side only), the strips are triangles — sweepQuad handles them cleanly.

**Code changes:**

| File | Location | Change |
|------|----------|--------|
| `OuterWallTessellator.ts` | After L1290 (phantom row creation) | Build `phantomBoundaryMap` by scanning phantom row `vertexIndices` for vertices at `unionU[colStart]` and `unionU[colEnd+1]` |
| `OuterWallTessellator.ts` | L1410 (`emitStandardCell`) | Check `phantomBoundaryMap` before emitting; dispatch to `emitSplitCell` if phantoms exist on shared edges |
| `OuterWallTessellator.ts` | New function ~L1440 | `emitSplitCell` — horizontal strip decomposition with phantom vertices |
| `OuterWallTessellator.ts` | L1445 (`emitChainCell`) | Same check — chain cells adjacent to super-cells also need phantom awareness |

**Estimated size:** ~80 new lines (registry build + emitSplitCell), ~15 modified lines.

**Assumptions** (for Verifier to attack):
1. Phantom boundary vertices at `unionU[colStart]` and `unionU[colEnd+1]` have the same U-coordinate as the adjacent cell's grid corner vertices (within floating-point precision)
2. The horizontal strip decomposition produces well-shaped triangles when phantom vertices are close to band boundaries (degenGuard protects, but verify)
3. `emitChainCell` and `emitSuperCell` already include their boundary phantom vertices — no double-inclusion
4. The R37 `degenGuard` clamping (5% from boundaries) prevents degenerate slivers in the split cell
5. Phantom vertices are already in the vertex buffer (allocated in the phantom slots) — no new vertex allocation needed

---

### Proposal 2: Bilateral Edge Notification (BEN) — T-Junction Fix (Moderate)

**Idea:** Instead of propagating phantoms outward, modify the super-cell's phantom row construction to NOT create boundary phantom vertices at `colStart` and `colEnd+1`. Only create phantoms at INTERIOR column boundaries (`colStart+1` through `colEnd`). The chain crossing anchor is still created, and the sub-band `sweepQuad` handles the non-uniform left/right boundaries.

**Mechanism:**
Change the phantom row creation loop from:
```typescript
for (let c = r37Sc.colStart; c <= r37Sc.colEnd + 1; c++) {
    upsertPhantomRowVertex(rowVerts, tCross, unionU[c]);
}
```
to:
```typescript
for (let c = r37Sc.colStart + 1; c <= r37Sc.colEnd; c++) {
    upsertPhantomRowVertex(rowVerts, tCross, unionU[c]);
}
```

**Problem:** This changes the phantom row's vertex list for `emitSuperCell` band splitting. The sub-bands would have unequal left/right boundaries:
- Top boundary: `[TL, intermediate_grid, ..., TR]` (uses grid row TL/TR at band+1)
- Phantom row: `[interior phantoms only]` — NO vertices at `colStart` or `colEnd+1` U-positions
- Bottom boundary: `[BL, intermediate_grid, ..., BR]`

The `sweepQuad` between phantom row and grid row would have mismatched counts and the phantom row lacks boundary-aligned vertices. This would break the band splitting mechanism that R37 was designed to provide.

**Verdict:** This approach is dangerous because it changes the fundamental structure of the phantom row. The band-splitting sub-quads need proper rectangular-ish boundaries. **I do NOT recommend this approach.**

**Assumptions** (for Verifier to attack):
1. Band splitting requires boundary-aligned vertices at phantom row endpoints for clean sub-quad formation
2. Removing boundary phantoms would cause sweepQuad to produce extreme-aspect triangles at sub-band boundaries

---

### Proposal 3: Conforming Cell Subdivision (CCS) — Density Gradient (Moderate)

**Idea:** Introduce a single level of "transition cells" around chain features by subdividing cells adjacent to chain/super-cells into 2×2 sub-cells (4 quads per original cell). This provides a 2:1 density gradient between the chain region and the coarse grid. Each transition cell is subdivided by inserting a midpoint vertex on each edge and one cell centroid.

**Mechanism:**

1. **Identify transition cells:** After the `cellChainMap` is built (L850-980), scan for cells adjacent to any chain cell or super-cell that are themselves standard cells. These cells form the "transition ring."

2. **Subdivision:** For each transition cell at (band, col):
   - Create 5 new vertices:
     - Bottom midpoint: `(U_mid, T_bot)` where `U_mid = (unionU[col] + unionU[col+1]) / 2`
     - Top midpoint: `(U_mid, T_top)`
     - Left midpoint: `(U_left, T_mid)` where `T_mid = (T_bot + T_top) / 2`
     - Right midpoint: `(U_right, T_mid)`
     - Center: `(U_mid, T_mid)`
   - Emit 4 sub-quads (8 triangles instead of 2)

3. **Conformity:** The shared edge between a transition cell and a standard cell now has a midpoint vertex. The standard cell doesn't know about it → another T-junction!

**This is the fundamental problem with grid subdivision for density gradients.** You can't subdivide one cell without the neighbor knowing.

**Resolution — Cascading conformity:**
- If cell A is subdivided and shares an edge with standard cell B, cell B must ALSO learn about the midpoint on the shared edge
- Cell B doesn't need to be fully subdivided — it just needs to split its boundary triangle to include the midpoint
- This is exactly the same mechanism as Proposal 1 (BPP)!

**Combined approach:**
```
1. Identify transition cells (adjacent to chain/super-cells)
2. Subdivide transition cells into 2×2 sub-quads
3. For each T-junction created on the outer boundary of the transition ring:
   Use BPP (Proposal 1) to propagate the edge-split to the neighbor
```

**Problem:** The 5 new vertices per transition cell are at grid midpoints with no feature significance. Each transition cell creates 8 triangles (from 2). If there are ~3000 chain cells, the transition ring might be ~6000 cells → 30,000 new vertices and 48,000 new triangles. Not catastrophic but significant.

**Bigger problem:** These midpoint vertices have NO GPU-evaluated positions. They're at interpolated UV coordinates `(U_mid, T_mid)`. They'll get GPU-evaluated later (Step 8 of the pipeline), so their 3D positions will be correct. But in UV space, the midpoints are at exact grid midpoints, which may not align with the surface's curvature. This is fine — grid vertices are at arbitrary positions anyway.

**Trade-off analysis:**
```
Pros: Simple 2:1 density transition, cleaner triangle aspect ratios
Cons: ~30K new vertices, 2× transition ring triangles, conformity propagation complexity
```

**Assumptions** (for Verifier to attack):
1. Transition cells can be identified purely from `cellChainMap` adjacency (within the existing cell emission loop)
2. 2×2 subdivision at UV grid midpoints produces good 3D triangles after GPU evaluation
3. The transition ring is approximately 2× the number of chain cells
4. Conforming propagation (BPP) to the outer boundary of the transition ring doesn't cascade further (only 1 level of subdivision)
5. 30K extra vertices and ~48K extra triangles are acceptable budget

---

### Proposal 4: Edge-Split Propagation with Graduated T-Rows (ESGT) — Combined Fix (Radical)

**Idea:** Solve BOTH problems simultaneously with a single mechanism: **propagate phantom row T-splits to adjacent cells, then recursively halve the split to create a natural density gradient.**

**Mechanism:**

1. **Phase A — T-Junction Elimination** (same as Proposal 1 BPP):
   For each super-cell boundary phantom vertex, register it in a `phantomBoundaryMap`.
   
2. **Phase B — Graduated Row Insertion:**
   For each boundary phantom vertex at T=`tCross` in a cell:
   - The adjacent cell gets an edge split at `tCross` on its shared vertical edge
   - Additionally, create a SECOND phantom vertex on the OPPOSITE vertical edge of that adjacent cell at `T = (tCross + nearest_grid_T) / 2` — a graduated midpoint
   - This naturally creates a density taper: the chain region has phantom rows at exact crossing T-values; the transition cells have phantom rows at midpoints between the crossing T and the grid boundary

3. **Phase C — Extended Gradient (Optional):**
   Continue the halving one more level:
   - The cell adjacent to the transition cell gets a phantom at `T = (midpoint_T + grid_T) / 2`
   - This creates a 3-level gradient: full density → half density → quarter density → grid

**Visualization:**
```
Grid row T_top ─────────────────────────────────────
                 │ Standard  │ Transition │ Super-cell │
                 │  2 tris   │            │  with      │
                 │           │ graduated  │  phantom   │
                 │           │ phantom at │  rows at   │
                 │           │  T_grad    │  T_cross   │
                 │           │            │            │
Grid row T_bot ─────────────────────────────────────

Transition cell has:
  Left edge: [BL, TL] (standard, no splits)
  Right edge: [BR, phantom_at_T_cross, TR] (matches super-cell boundary)
  Internal phantom at T_grad = (T_cross + T_top)/2 or (T_cross + T_bot)/2
```

**Problem:** The graduated phantom on the OPPOSITE edge creates a new T-junction with the cell to the LEFT of the transition cell. This cascades.

**Resolution:** The graduated phantom is on the opposite edge only if we want full 2×2 subdivision. Instead, keep it INTERIOR: place the graduated vertex inside the transition cell (not on its boundary). Use it as a Steiner point for local triangulation refinement.

**Wait — that's just companion insertion with extra steps.** Section 5.1.7 warns against this.

**Revised approach:** Don't create interior Steiner points. Instead:
- Phase A: BPP (boundary phantom propagation) — eliminates T-junctions
- Phase B: For transition cells that now have split boundary edges, triangulate them with `sweepQuad` using horizontal strips — this naturally produces more triangles in the transition zone WITHOUT inserting interior points

This is essentially Proposal 1 alone, and the density gradient emerges automatically from the strip triangulation. Each phantom boundary vertex adds one strip → one more triangle pair per transition cell. If a super-cell has 2 phantom rows, the adjacent cell gets 2 boundary splits → 3 horizontal strips → 6 triangles (from 2). That's a 3× density increase at the boundary.

**Assumptions** (for Verifier to attack):
1. The strip triangulation of split cells naturally provides sufficient density gradient
2. No interior Steiner points are needed for the transition zone
3. Graduated row insertion cascades T-junctions and should be avoided
4. The density gradient from strip decomposition alone is adequate for triangle quality

---

### Proposal 5: Conforming Phantom Rows (CPR) — Combined Fix (Recommended)

**Idea:** Extend phantom rows BEYOND the super-cell boundaries into adjacent cells. Instead of creating boundary phantom vertices only within the super-cell's column range, extend each phantom row by 1-2 columns in each direction. This simultaneously eliminates T-junctions AND provides a density gradient.

**Mechanism:**

1. **Extend phantom row construction** (modify the loop at L1199):
   ```typescript
   // Current: column boundary vertices only within super-cell
   for (let c = r37Sc.colStart; c <= r37Sc.colEnd + 1; c++) {
       upsertPhantomRowVertex(rowVerts, tCross, unionU[c]);
   }
   
   // Proposed: extend by EXTENSION_COLS on each side
   const EXTENSION_COLS = 2;
   const extLeft = Math.max(0, r37Sc.colStart - EXTENSION_COLS);
   const extRight = Math.min(cellsPerRow, r37Sc.colEnd + 1 + EXTENSION_COLS);
   for (let c = extLeft; c <= extRight; c++) {
       upsertPhantomRowVertex(rowVerts, tCross, unionU[c]);
   }
   ```

2. **Register extended columns as "phantom-aware cells":**
   ```typescript
   const phantomAwareCells = new Map<string, PhantomRow[]>();
   // For columns extLeft..r37Sc.colStart-1 and r37Sc.colEnd+1..extRight:
   //   register phantom rows that affect this cell
   ```

3. **Modify cell emission** to handle phantom-aware cells:
   - In the main emission loop (L1640-1680), before `emitStandardCell`, check if the cell is phantom-aware
   - If so, decompose into horizontal sub-bands using the phantom row T-values
   - Each sub-band is a standard quad → `sweepQuad`

4. **Sub-band emission for extended cells:**
   For cell (band, col) with phantom rows at T₁, T₂ (sorted):
   ```
   Sub-band 0: [BL, BR] at T_bot  → [phantomL₁, phantomR₁] at T₁
   Sub-band 1: [phantomL₁, phantomR₁] at T₁ → [phantomL₂, phantomR₂] at T₂
   Sub-band 2: [phantomL₂, phantomR₂] at T₂ → [TL, TR] at T_top
   ```
   Each sub-band is a simple 2×2 quad → 2 triangles → sweepQuad.

**Why this works:**
- **T-junction elimination:** The phantom row now extends through the adjacent cell, so both sides of every shared edge have matching phantom vertices
- **Density gradient:** Extended cells (1-2 columns from super-cell) get sub-band splitting, creating 2-6× more triangles in the transition zone. The density tapers naturally because cells farther from the chain feature have fewer or no phantom rows affecting them
- **No new vertex positions created beyond what phantom rows already provide** — only extending existing phantom rows horizontally
- **Uses only existing triangulation machinery** (sweepQuad) — no CDT, no Steiner points, no fan systems

**Critical detail — avoiding double-emission:**
Extended cells must be tracked so the main emission loop doesn't also emit them as standard cells. Add their cell keys to a `phantomAwareCellKeys` set and check it before `emitStandardCell`.

**Critical detail — chain cells in the extension zone:**
If a cell in the extension zone is itself a chain cell (has entries in `cellChainMap`), its `emitChainCell` already handles chain vertices on bot/top edges. The phantom row extension would add phantom vertices on its LEFT and RIGHT vertical edges. These need to be integrated into the chain cell's emission.

Resolution: For chain cells in the extension zone, add phantom boundary vertices to bot/top edges (they're on the same U as grid corners) and include them in the horizontal strip decomposition. Since the phantom vertices are at grid column U-values (not at chain U-values), they integrate cleanly with the existing bot/top edge construction.

**Code changes:**

| File | Location | Change | Est. Lines |
|------|----------|--------|------------|
| `OuterWallTessellator.ts` | L1199 | Extend phantom column range by `EXTENSION_COLS` | Modify 3 lines |
| `OuterWallTessellator.ts` | After L1290 | Build `phantomAwareCells` map from extended phantom rows | ~30 new lines |
| `OuterWallTessellator.ts` | New fn ~L1440 | `emitPhantomAwareCell` — sub-band decomposition | ~50 new lines |
| `OuterWallTessellator.ts` | L1640-1680 (emission loop) | Check `phantomAwareCellKeys` before standard emission | ~10 modified lines |
| `OuterWallTessellator.ts` | L1445 (`emitChainCell`) | Handle case where chain cell is also phantom-aware | ~20 modified lines |

**Total estimated:** ~110 new lines, ~15 modified lines.

**Performance impact:**
- Vertices: `EXTENSION_COLS=2` × 2 sides × N_phantom_rows × N_super_cells = ~2×2×2×2548 ≈ 20K additional phantom vertices (upper bound; many overlap if super-cells are adjacent)
- Triangles: Each extended cell with K phantom rows → K+1 sub-bands × 2 triangles = 2K+2 triangles (from original 2). With avg 2 phantom rows per super-cell: 6 triangles per extended cell × ~5000 extended cells ≈ 30K extra triangles

**Assumptions** (for Verifier to attack):
1. Extending phantom columns by 2 on each side is sufficient for visual quality (could be 1 or 3)
2. Extended phantom vertices at grid column U-values don't conflict with existing chain vertices at those positions (R52 lock: they're grid-type, not chain-type, so they coexist)
3. The `maxPhantomSlots` allocation has enough headroom for ~20K additional phantom vertices (current: `12,755` used phantom vertices → need to verify buffer sizing)
4. Extended cells that are also chain cells can be handled without breaking chain edge enforcement
5. The performance cost (20K vertices, 30K triangles) is acceptable
6. Multiple super-cells in the same band with overlapping extensions share phantom boundary vertices correctly (via `upsertPhantomRowVertex` dedup)

---

## Recommended Approach

**Implement Proposal 5 (Conforming Phantom Rows)** as the primary solution. It solves both problems with a single unified mechanism:

1. **T-junctions eliminated** by extending phantom rows into adjacent cells
2. **Density gradient provided** by sub-band decomposition of extended cells
3. **No historical failure modes** reintroduced — no CDT, no companions, no Steiner points
4. **Uses only existing `sweepQuad` machinery** — minimal new code
5. **Naturally respects R52 precision locks** — phantom boundary vertices are at grid column positions, chain vertices remain at exact detection positions

If the Verifier finds Proposal 5 too complex or risky, **Proposal 1 (BPP)** is the conservative fallback — it eliminates T-junctions without addressing density gradient. The density gradient could then be addressed in a separate round.

---

## Open Questions (Invite Verifier Scrutiny)

1. **phantom slot allocation**: The vertex buffer pre-allocates `maxPhantomSlots` for phantom vertices. Does extending phantom rows overflow this allocation? What's the current formula for `maxPhantomSlots` and does it account for lateral extension?

2. **emitSuperCell band splitting interaction**: When a super-cell's `emitSuperCell` runs band splitting (L1560-1590), it uses `boundaries` arrays that include the phantom row vertex lists. The extended phantom rows now include vertices OUTSIDE the super-cell's column range. Do these external vertices appear in the super-cell's phantom row `vertexIndices` and cause problems in band splitting?

3. **Chain cell interaction at extension boundary**: If extension column 1 is a chain cell with its own chain vertices on bot/top edges, and the phantom row adds grid-U phantom vertices at the same T-level, does `sweepQuad` handle the mixed vertex set correctly, or do we need special sorting?

4. **Multiple phantom rows per extension cell**: If a super-cell has 3 phantom rows, an extension cell gets 3 boundary pairs → 4 sub-bands → 8 triangles. Is this over-tessellation for cells that are 2 columns away from the chain feature?

5. **Seam boundary interaction**: If a super-cell is near the seam (U≈0 or U≈1), extending phantom columns could cross the seam boundary. The existing seam guard should catch this, but verify.

6. **Diagnostic verification**: How do we measure T-junction count in the final mesh? The valence-3 vertex metric is indirect. Should we add an explicit T-junction detector that checks every edge for vertices on its interior?

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Phantom slot overflow | HIGH | Verify `maxPhantomSlots` formula; increase allocation if needed |
| Extended phantoms pollute super-cell band splitting | HIGH | Filter phantom row vertex lists to super-cell column range during emitSuperCell |
| Chain cell + phantom-aware cell interaction complexity | MEDIUM | Test with styles that produce adjacent chain cells |
| Over-tessellation in extension zone | LOW | EXTENSION_COLS=2 is modest; reduce to 1 if needed |
| Seam crossing in extensions | LOW | Existing seam guard handles this |
| R52 precision lock violation | LOW | Extended phantoms are grid-type, chain vertices untouched |

**Blast radius:** Changes are contained to:
- Phantom row creation loop (3 lines modified)
- New data structures for phantom-aware cells (~30 lines)
- New emission function (~50 lines)
- Cell emission dispatch (~15 lines modified)

All changes are within `OuterWallTessellator.ts`. No changes to `ChainVertexBuilder.ts`, `ChainStripTriangulator.ts`, `ParametricExportComputer.ts`, or any other pipeline file. The `buildCDTOuterWall` function signature and return type are unchanged.
