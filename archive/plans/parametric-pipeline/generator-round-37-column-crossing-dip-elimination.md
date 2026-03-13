# Generator Round 37 — Eliminate Feature Edge Dips at Column Crossings

Date: 2026-03-08

## Executive Summary

The dip artifact at 1-column crossings is geometric, not algorithmic: the super-cell's `sweepQuad` connects a **ridge-peak chain vertex** (high elevation) on one row to an **intermediate grid vertex at a column boundary** (flank elevation) on the opposite row, producing a triangle that slopes from peak to flank. No amount of diagonal flipping or tie-breaking can fix a triangle whose **vertices are at the wrong heights**. The only fix is to give the triangulator a vertex near the crossing point that is at the **correct ridge elevation**. I propose three approaches (conservative, moderate, radical) all centered on the insight that we must **inject elevation-correct vertices into super-cell edges** without violating the bot/top monotone sweep architecture. My recommended approach is **Proposal 2: Crossing-Point T-Ladder Companions** — targeted companion vertices at crossing locations that produce near-zero-dip triangles at a cost of ~5k–10k additional vertices and ~10k–20k tris.

## Root Cause Analysis

### The Geometry of the Dip

Consider a single 1-column crossing (the dominant case: 2,529 of 2,529 super-cells):

```
Row j+1:  ─────TL───────────●chainV_top──TR────
                             /
                            / ← chain edge (ridge line)  
                           /
Row j:    ─────BL────●chainV_bot──────────BR────
                col c    col c+1
```

The chain edge crosses from column `c` (at `chainV_bot`, row j) to column `c+1` (at `chainV_top`, row j+1). The super-cell fuses columns c and c+1, creating edges:
- botEdge: `[BL, gridVertex(j, c+1), chainV_bot, BR]`
- topEdge: `[TL, chainV_top, gridVertex(j+1, c+1), TR]`

The sweep connects `chainV_bot` (at ridge peak) to `gridVertex(j+1, c+1)` (at flank elevation). This triangle is the dip:

```
            chainV_top (peak)
           / |
          /  |
         /   gridVertex(j+1, c+1) (flank — LOWER than chain)
        /   /
chainV_bot (peak)
```

The resulting surface interpolates from peak to flank within the triangle — a **visible depression** in the ridge line.

### Why Previous Approaches Failed

| Approach | Why it fails |
|---|---|
| R34 (cell-local sweep) | Better winding, same vertex set → same dip |
| R35 (super-cell fusion) | Enforces the chain edge, but intermediate grid verts are still at flank elevation |
| R36 (Delaunay tie-break) | Picks better diagonal, but both diagonals connect peak to flank |
| R36.1 (vertex marking) | Optimization pass fix — dip is a tessellation problem, not optimization |
| Approach A (colGap ≥ 1) | Halves band height but crossing still exists; dip reduced ~50% not eliminated |
| Approach D (interior vertices) | Architecturally incompatible with monotone sweep |

### The Key Insight

**The problem is not which triangles we create — it's that we lack vertices at the right positions.** At the column boundary crossing point, the surface has ridge-level elevation. But our grid vertex at (unionU[c+1], row j+1) is at flank elevation. We need a vertex near `(uCross, tCross)` that is at ridge elevation, placed on a row boundary (bot or top of a band) so the monotone sweep can use it.

### Mathematical Definition of the Crossing Point

For a chain edge from `(u_A, t_A)` to `(u_B, t_B)` crossing column boundary `U_c`:

$$\alpha = \frac{U_c - u_A}{u_B - u_A}$$
$$t_{cross} = t_A + \alpha \cdot (t_B - t_A)$$
$$u_{cross} = U_c$$

The crossing point `(U_c, t_cross)` lies on the chain edge (which follows the ridge). A vertex here would be at **ridge elevation** by definition.

## Proposals

### Proposal 1: Targeted Micro-Rows at Exact Crossing T (Conservative)

**Idea**: Change `colGap > 1` to `colGap >= 1` BUT insert the micro-row at the exact crossing T (not midpoint), AND only insert micro-rows for bands that actually contain crossings.

**Mechanism**:
1. For each 1-column crossing, compute `tCross` using the formula above
2. Round `tCross` to a deduplication grid (`Math.round(tCross * 1e5) / 1e5`)
3. Insert micro-rows at these exact T values
4. After gap-fill interpolation, the chain gets an intermediate vertex at `(u_interp, tCross)`
5. `bsearchFloor` assigns this vertex to the correct column — now the bottom half of the crossing spans 0 columns (same column), eliminating that half's super-cell entirely
6. The top half may still be a 1-column crossing, but it spans a **much smaller band** (from `tCross` to `t_B`), producing a proportionally smaller dip

**Mathematical basis**: If the chain edge is perfectly linear between points, the intermediate vertex at `tCross` has `u_interp = U_c` (the column boundary), so `bsearchFloor` maps it to column `c`. The two sub-edges are then:
- `(u_A, t_A, col_A)` → `(U_c, tCross, col_c)`: 1-column crossing but only over `tCross - t_A` band height
- `(U_c, tCross, col_c)` → `(u_B, t_B, col_B)`: 0 or 1-column crossing over `t_B - tCross` height

In the best case (interpolated vertex merges with grid via batch2Remap), both sub-edges are 0-column → **no super-cell at all**.

**Files affected**:
- [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L396): `insertMicroRowsForSteepCrossings` — change threshold and use exact T
  
**Trade-offs**:
- Pro: Minimal code change (~15 lines), reuses proven micro-row infrastructure
- Pro: Each micro-row is shared by all chains crossing in the same band → good dedup
- Con: Full-grid micro-rows — each adds 685 × 2 = 1,370 tris. With ~200–300 unique crossing Ts after dedup, that's 274k–411k additional tris → potentially over budget
- Con: Doesn't guarantee dip elimination — only reduces dip by splitting the band

**Cost analysis**:
- 2,529 crossings. After T-dedup (chains share bands), estimate ~150–250 unique micro-row T positions
- 150 micro-rows × 1,370 tris = 205k additional tris → 928k total (within 1M limit)
- 250 micro-rows × 1,370 tris = 342k additional tris → 1.065M total (**over 1M limit**)
- Vertex increase: 150–250 × 685 = 103k–171k additional vertices

**Assumptions** (for Verifier to attack):
1. The interpolated vertex at `tCross` will have U close enough to `U_c` to be merged by batch2Remap (within 1e-4 threshold)
2. Micro-row T deduplication across chains is effective (chains have similar row spacing)
3. The triangle budget is acceptable with the additional micro-rows


### Proposal 2: Crossing-Point T-Ladder Companions (Moderate — RECOMMENDED)

**Idea**: Instead of inserting full-grid micro-rows, inject **targeted companion vertices** only at crossing points. Place them on the nearest row boundary (bot or top of the band) at `u = U_c` (the column boundary), with explicit `t` set to `tCross`. These become `interiorByBand` entries in the T-Ladder system that already exists.

**Mechanism**:

The T-Ladder companion system (lines 566–830) already supports vertices with explicit `t` positions within bands. These are collected into `interiorByBand` and... wait. Actually, the cell-local quad splitting system (R34) **removed** the T-Ladder companion support. Let me verify.

After reading the code carefully: **The T-Ladder companions were removed in R34**. The comment at line ~796 says `// R34: Cell-local quad splitting — no companions, no CDT strips`. The `interiorByBand` map and all companion emission (`emitRungs`, `emitUGradedFan`) code is gone.

So this proposal requires **reintroducing a minimal companion system**, but only for crossing-point vertices. Here's the mechanism:

1. **After** chain edge assignment (section 3.7) and fusion request construction, **before** super-cell merge (section 3.8):
2. For each 1-column crossing super-cell, compute the crossing point `(U_c, tCross)` 
3. Create a new vertex at `(U_c, tCross)` — this is NOT on a grid row, it has explicit `t`
4. **Do not place it as an interior vertex** (would require CDT). Instead, **split the super-cell's band into two sub-bands** at `tCross`.

Wait — this falls back to Approach D. Interior vertices break the monotone sweep.

**Revised mechanism** — the "**Phantom Row**" approach:

Instead of a full micro-row or an interior vertex, we do something more targeted:

1. For each 1-column super-cell in band `j`, compute crossing T: `tCross`
2. Create **exactly 3 new vertices** at row T = `tCross`:
   - `V_left` at `(unionU[colStart], tCross)` — left boundary of super-cell
   - `V_cross` at `(U_c, tCross)` — the column boundary where chain crosses
   - `V_right` at `(unionU[colEnd + 1], tCross)` — right boundary of super-cell
3. Split the super-cell emission into **two sub-bands**: `[tBot, tCross]` and `[tCross, tTop]`
4. Each sub-band is a standard `sweepQuad` / `constrainedSweepCell` call with:
   - Lower sub-band: original bot edge vertices + `[V_left, V_cross, V_right]` as top
   - Upper sub-band: `[V_left, V_cross, V_right]` as bot + original top edge vertices
5. The chain edge vertex nearest to `tCross` (the interpolated gap-fill vertex that would have existed if we'd inserted a micro-row) gets placed on the crossing row, producing 0-column sub-edges

**Mathematical basis**: `V_cross` at `(U_c, tCross)` lies exactly on the chain edge (by construction of `tCross`). When the chain's gap-fill interpolation inserts a vertex at this T, it lands at `u ≈ U_c`. After batch2Remap, `V_cross` and the interpolated chain vertex merge, making the chain edge pass through `V_cross` — a vertex at ridge elevation on the column boundary.

**But wait** — the chain interpolation happens BEFORE super-cell construction. We need a different sequencing:

**Final mechanism — Companion Vertices at Column Boundaries Within Super-Cell Edge Arrays**:

1. After super-cell construction identifies all 1-column crossings
2. For each crossing, compute `(U_c, tCross)` — the exact UV where chain crosses column boundary
3. Add a **companion ChainVertex** at `(U_c, tCross)` with explicit `t = tCross`
4. This vertex goes into `interiorByBand` (need to reinstate this minimal structure)
5. In `emitSuperCell`, **also include `interiorByBand` vertices** that fall within the super-cell's U-range
6. Split the super-cell at the interior vertex's T position into sub-bands
7. Each sub-band gets its own `constrainedSweepCell` call

**Actually, the simplest version**: Modify `emitSuperCell` to detect crossings internally and split itself:

```typescript
const emitSuperCell = (band, colStart, colEnd) => {
    // ... existing edge collection ...
    
    // R37: For each chain edge crossing a column boundary within this super-cell,
    // compute the crossing T and create phantom vertices to split the band
    const crossingTs: number[] = [];
    for (const [v0, v1] of uniqueEdges) {
        const u0 = vertices[v0 * 3], t0 = vertices[v0 * 3 + 1];
        const u1 = vertices[v1 * 3], t1 = vertices[v1 * 3 + 1];
        // For each intermediate column boundary within [colStart, colEnd]
        for (let c = colStart + 1; c <= colEnd; c++) {
            const uBound = unionU[c];
            if ((u0 - uBound) * (u1 - uBound) < 0) { // edge crosses this column
                const alpha = (uBound - u0) / (u1 - u0);
                const tCross = t0 + alpha * (t1 - t0);
                crossingTs.push(tCross);
            }
        }
    }
    
    if (crossingTs.length === 0) {
        // No crossings — emit normally
        constrainedSweepCell(indexBuf, finalBot, finalTop, uniqueEdges, vertices);
        return;
    }
    
    // Create phantom row vertices at each crossing T
    // ... split band into sub-bands and emit each ...
};
```

**Actually this is still interior vertex territory. Let me think differently.**

The core constraint is: `sweepQuad` / `constrainedSweepCell` require all vertices on the **bot or top edge** (same T position). Interior vertices at arbitrary T break the monotone polygon assumption.

**The real solution**: Don't fight the architecture. Instead, **add companion vertices on the existing bot and top edges at U = column boundary positions**, AT the correct elevation.

Wait — grid vertices already exist at `(U_c, tBot)` and `(U_c, tTop)`. The problem is these grid vertices are at **flank elevation**, not ridge elevation.

**This is a 3D problem being solved in UV space.** The UV tessellation is fine — the issue is that the evaluator maps `(U_c, tBot)` to a 3D point that's at flank elevation. We can't change the 3D position of a grid vertex — it's determined by the parametric surface.

**Reframe**: The dip is visible because the triangle `[chainV_bot(peak), gridV(flank), chainV_top(peak)]` creates a face that interpolates from peak to flank. The only way to eliminate this is to ensure that **every triangle face containing a chain vertex also has its other vertices near peak elevation** — which means having vertices at the crossing point `(U_c, tCross)` where the surface IS at peak elevation.

**These ARE interior vertices.** The question is how to integrate them without breaking the sweep.

### Revised Proposal 2: Per-Super-Cell Band Splitting (Moderate — RECOMMENDED)

**Idea**: For each super-cell with a column-crossing chain edge, split the band by inserting **local** phantom row vertices (not a full grid micro-row) at the crossing T, then emit the super-cell as two stacked sub-super-cells.

**Mechanism**:
1. In `emitSuperCell`, after collecting edges, detect column-boundary crossings
2. For each crossing, compute `tCross` — the T where the chain edge hits `U_c`
3. Allocate 2–3 new vertices at T = `tCross`:
   - One at `(unionU[colStart], tCross)` — left wall
   - One at `(U_c, tCross)` — the crossing point itself
   - One at `(unionU[colEnd+1], tCross)` — right wall
4. Build **two sub-bands** from the original super-cell:
   - **Lower**: bot edge = original bot edge, top edge = `[VL_cross, V_cross, VR_cross]`
   - **Upper**: bot edge = `[VL_cross, V_cross, VR_cross]`, top edge = original top edge
5. Run `constrainedSweepCell` on each sub-band independently
6. The chain edge is split into two sub-edges at `V_cross`:
   - `chainV_bot → V_cross` (within lower sub-band, likely 0-column)
   - `V_cross → chainV_top` (within upper sub-band, likely 0-column)

**Why this doesn't break the sweep**: Each sub-band's bot-edge and top-edge vertices all share the same T value (tBot, tCross, or tTop respectively). The sweep remains monotone in T. `V_cross` is a **boundary vertex** of both sub-bands, not an interior vertex.

**Mathematical basis**: The triangle connecting `chainV_bot` to `V_cross` to `chainV_top` follows the chain edge exactly — `V_cross` lies ON the chain edge (by linear interpolation). The facets adjacent to the chain edge now have a vertex at the correct elevation at the column boundary:

```
tTop    ─────TL──────────●chainV_top──TR────
                         |  
tCross  ─VL_cross──V_cross──────────VR_cross  
                   |
tBot    ─────BL──●chainV_bot──────────BR────
            col c    col c+1
```

Lower sub-band triangles connect `chainV_bot (peak)` to `V_cross (peak)` — no dip!
Upper sub-band triangles connect `V_cross (peak)` to `chainV_top (peak)` — no dip!
Flank triangles connect grid vertices on the same row — gradual slope, no dip.

**Files affected**:
- [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1118): `emitSuperCell` — add band splitting logic

**Trade-offs**:
- Pro: **Exactly 3 vertices per crossing** — 2,529 × 3 = 7,587 new vertices (~15k tris). Well within budget.
- Pro: No full-grid micro-rows — cost is proportional to crossings, not grid width
- Pro: Architecturally clean — each sub-band is a valid monotone polygon for sweep
- Pro: Chain edge is split at the exact crossing point — dip is eliminated, not just reduced
- Con: New vertex allocation inside `emitSuperCell` requires expanding the vertex buffer or pre-allocating
- Con: Chain edge splitting requires updating the `chainEdges` array and `constrainedSweepCell` partition tracking
- Con: Multiple crossings per super-cell (if bands overlap) need sorted T splitting

**Cost analysis**:
- 2,529 super-cells × 3 vertices = 7,587 new vertices
- 2,529 super-cells: each splits into 2 sub-bands, each sub-band ~2-4 tris → ~10k–20k additional tris
- Net effect: ~733k–743k total tris (**well within 1M limit, near 723k baseline**)
- Memory: ~91KB additional vertex data (7,587 × 3 floats × 4 bytes)

**Assumptions** (for Verifier to attack):
1. The chain edge is approximately linear between consecutive points (required for `tCross` formula accuracy)
2. `V_cross` at `(U_c, tCross)` will be at ridge elevation when evaluated by the parametric surface (because the chain tracks the ridge)
3. The vertex buffer can be expanded dynamically within `emitSuperCell` (or pre-allocated with estimated count)
4. Splitting the chain edge at `V_cross` won't break edge enforcement verification
5. A 2-column super-cell with 2 crossing points needs 2 splits (3 sub-bands, ~6 phantom vertices) — this generalizes cleanly
6. The left/right wall phantom vertices `VL_cross` and `VR_cross` will be at reasonable (non-ridge but non-dip) elevations — they're grid-like interpolated points


### Proposal 3: Abolish Super-Cells — Column-Boundary Vertex Insertion (Radical)

**Idea**: Instead of fusing columns into super-cells, add a new vertex at exactly `(U_c, tRow)` for each chain vertex near a column boundary. This vertex is on the grid row (not interior) and at the exact U of the column boundary. The chain edge then goes `chainV → boundaryV → nextChainV`, with each sub-edge spanning 0 columns.

**Mechanism**:
1. During chain edge assignment (section 3.7), when a cross-column edge is detected (`gc0 !== gc1`):
2. Compute the crossing point `(U_c, tCross)` where the chain edge meets the column boundary
3. Find the nearest existing grid row T to `tCross`: `tNearest = activeTPositions[bsearchFloor(activeTPositions, tCross)]`
4. If close enough: insert a new chain vertex at `(U_c, tNearest)` — on the grid row, at column boundary
5. If not close: insert a vertex at `(U_c, tCross)` with explicit T (companion vertex in the band)
6. Split the chain edge into two sub-edges through this new vertex
7. Both sub-edges are now 0-column or same-column → no fusion needed → no super-cell → no dip

**Mathematical basis**: The chain edge `A → B` crossing column boundary `U_c` at `tCross` is replaced by `A → I → B` where `I = (U_c, tCross)`. If `I` snaps to a grid row, it becomes a standard on-row chain vertex. Each sub-edge spans at most 0 columns.

**Files affected**:
- [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L680): Chain vertex collection — add crossing-point vertex insertion
- Chain edge recording — split edges at crossing vertices
- Section 3.7 — no fusion requests generated for split edges

**Trade-offs**:
- Pro: **Eliminates super-cells entirely** — no fusion, no super-cell emission, simpler code
- Pro: Column-boundary vertices are exactly at the correct surface position
- Pro: Every chain edge becomes 0-column → all chain cells are simple, well-optimized
- Con: Requires careful chain edge splitting during collection (complex sequencing)
- Con: New vertices may not align with existing grid rows → need explicit T support in cells
- Con: More vertices per crossing than Proposal 2 (vertex at crossing + two sub-edges)
- Con: Risk of perturbing the chain's geometric fidelity (interpolated vertices)
- Con: Seam-crossing edges near U=0/1 need wrap-aware boundary calculation

**Cost analysis**:
- ~2,529 crossing vertices, plus splitting the chain edge creates ~2,529 additional edges
- Total: ~5,058 new vertices, ~10k additional tris (sub-edge triangulation)
- Per-vertex cost is similar to Proposal 2 but with different distribution

**Assumptions** (for Verifier to attack):
1. All 1-column crossings can be intercepted before fusion request generation
2. Chain edge splitting doesn't violate downstream invariants (edge verification, FeatureEdgeGraph)
3. The crossing-point vertex can be snapped to an existing grid row in most cases
4. If companion (off-row) vertices are needed, they can be handled by the cell-local system
5. This doesn't introduce new edge enforcement failures (the new sub-edges still need to be mesh edges)


### Proposal 4: Hybrid — Proposal 2 + Targeted Companion Fan (Moderate+)

**Idea**: Use Proposal 2 (band splitting) as the primary mechanism, and supplement with a **small companion fan** around the crossing point to improve triangle quality in the sub-bands.

**Mechanism**:
1. Apply Proposal 2 band splitting for all 1-column crossings
2. For each crossing point `V_cross`, emit 2–4 additional T-Ladder-style companion vertices in a small fan around it:
   - `(U_c - δ, tCross)` and `(U_c + δ, tCross)` where `δ` is half the column spacing
   - These companions are on the phantom row at `tCross` — they're top-edge vertices for the lower sub-band and bot-edge vertices for the upper sub-band
3. The companions break up the large triangles in the sub-bands, producing better aspect ratios

**Cost analysis**: 
- 2,529 crossings × (3 vertices + 4 companions) = 17,703 vertices
- ~25k–35k additional tris
- Total: ~748k–758k tris (within budget)

This is an enhancement over Proposal 2 — implement Proposal 2 first, measure quality, add fans if needed.


## Recommended Approach

**Proposal 2: Per-Super-Cell Band Splitting**, with Proposal 4 as a follow-up if quality isn't sufficient.

Rationale:
1. **Minimal vertex cost**: ~7.5k vertices vs 100k+ for micro-rows
2. **Exact dip elimination**: The crossing-point vertex lies ON the chain edge → zero dip by construction
3. **Architecturally clean**: Each sub-band is a valid input for `constrainedSweepCell`
4. **Self-contained change**: Entirely within `emitSuperCell` — no changes to chain collection, edge recording, or micro-row insertion
5. **Doesn't preclude Proposal 3**: If super-cells prove problematic long-term, can later migrate to edge-splitting

## Implementation Plan

### Phase 1: Vertex Pre-Allocation (~30 mins)

Before the main emission loop, estimate the number of crossing-point vertices needed:

```typescript
// After super-cell merge (section 3.8), before cell emission (section 4)
let phantomVertexCount = 0;
for (const [band, cells] of superCellMap) {
    for (const sc of cells) {
        // Count column-boundary crossings within this super-cell
        for (let c = sc.colStart + 1; c <= sc.colEnd; c++) {
            // Check if any chain edge crosses unionU[c]
            for (const info of /* constituent cell chain infos */) {
                for (const [v0, v1] of info.chainEdges) {
                    const u0 = vertices[v0 * 3], u1 = vertices[v1 * 3];
                    if ((u0 - unionU[c]) * (u1 - unionU[c]) < 0) {
                        phantomVertexCount += 3; // VL, V_cross, VR
                    }
                }
            }
        }
    }
}
```

Expand vertex buffer to `totalVertexCount + phantomVertexCount` before emission.

### Phase 2: Band Splitting in `emitSuperCell` (~2 hours)

Replace the current `emitSuperCell` body with:

```typescript
const emitSuperCell = (band: number, colStart: number, colEnd: number): void => {
    // ... existing super-cell boilerplate (counting, quadMap marking) ...
    
    // Collect chain edges (existing code)
    // ...
    
    // R37: Detect column-boundary crossings
    const crossings: Array<{ colBound: number; tCross: number; uCross: number }> = [];
    
    for (const [v0, v1] of uniqueEdges) {
        const u0 = vertices[v0 * 3], t0 = vertices[v0 * 3 + 1];
        const u1 = vertices[v1 * 3], t1 = vertices[v1 * 3 + 1];
        
        for (let c = colStart + 1; c <= colEnd; c++) {
            const uBound = unionU[c];
            // Check if edge crosses this column boundary
            if ((u0 < uBound && u1 > uBound) || (u0 > uBound && u1 < uBound)) {
                const alpha = (uBound - u0) / (u1 - u0);
                const tCross = t0 + alpha * (t1 - t0);
                crossings.push({ colBound: c, tCross, uCross: uBound });
            }
        }
    }
    
    if (crossings.length === 0) {
        // No crossings — emit normally (existing code)
        if (uniqueEdges.length === 0) {
            sweepQuad(indexBuf, finalBot, finalTop, vertices);
        } else {
            constrainedSweepCell(indexBuf, finalBot, finalTop, uniqueEdges, vertices);
        }
        return;
    }
    
    // Sort crossings by T for multi-split
    crossings.sort((a, b) => a.tCross - b.tCross);
    
    // Deduplicate crossings with very close T values
    const DEDUP_T = 1e-6;
    const uniqueCrossings = [crossings[0]];
    for (let i = 1; i < crossings.length; i++) {
        if (Math.abs(crossings[i].tCross - uniqueCrossings[uniqueCrossings.length - 1].tCross) > DEDUP_T) {
            uniqueCrossings.push(crossings[i]);
        }
    }
    
    // Create phantom row vertices for each unique crossing T
    const tBot = activeTPositions[band];
    const tTop = activeTPositions[band + 1];
    const phantomRows: Array<{ t: number; verts: number[] }> = [];
    
    for (const crossing of uniqueCrossings) {
        const t = crossing.tCross;
        if (t <= tBot + 1e-9 || t >= tTop - 1e-9) continue; // skip edge cases
        
        // Create phantom vertices across the super-cell width at this T
        const rowVerts: number[] = [];
        
        // Left boundary
        const vL = nextPhantomIdx++;
        vertices[vL * 3] = unionU[colStart];
        vertices[vL * 3 + 1] = t;
        vertices[vL * 3 + 2] = surfaceId;
        rowVerts.push(vL);
        
        // Intermediate column boundaries + crossing point
        for (let c = colStart + 1; c <= colEnd; c++) {
            const v = nextPhantomIdx++;
            vertices[v * 3] = unionU[c];
            vertices[v * 3 + 1] = t;
            vertices[v * 3 + 2] = surfaceId;
            rowVerts.push(v);
        }
        
        // Right boundary
        const vR = nextPhantomIdx++;
        vertices[vR * 3] = unionU[colEnd + 1];
        vertices[vR * 3 + 1] = t;
        vertices[vR * 3 + 2] = surfaceId;
        rowVerts.push(vR);
        
        // Also include any chain vertices at this T level
        // (gap-fill interpolated chain vertices that land near tCross)
        
        phantomRows.push({ t, verts: rowVerts });
    }
    
    // Build sub-bands: [tBot → first phantom] [first phantom → second phantom] ... [last phantom → tTop]
    const allRows = [
        { t: tBot, edgeVerts: finalBot },
        ...phantomRows.map(pr => ({ t: pr.t, edgeVerts: pr.verts })),
        { t: tTop, edgeVerts: finalTop },
    ];
    
    for (let r = 0; r < allRows.length - 1; r++) {
        const subBot = allRows[r].edgeVerts;
        const subTop = allRows[r + 1].edgeVerts;
        
        // Find chain edges that fall within this sub-band
        const subBandEdges = uniqueEdges.filter(([ev0, ev1]) => {
            const et0 = vertices[ev0 * 3 + 1], et1 = vertices[ev1 * 3 + 1];
            const eMin = Math.min(et0, et1), eMax = Math.max(et0, et1);
            return eMin >= allRows[r].t - 1e-9 && eMax <= allRows[r + 1].t + 1e-9;
        });
        
        if (subBandEdges.length === 0) {
            sweepQuad(indexBuf, subBot, subTop, vertices);
        } else {
            constrainedSweepCell(indexBuf, subBot, subTop, subBandEdges, vertices);
        }
    }
};
```

### Phase 3: Chain Edge Splitting (~1 hour)

The chain edge `A → B` that crosses at `V_cross` must be split into `A → V_cross` and `V_cross → B` for edge enforcement:

```typescript
// After creating phantom vertices but before sub-band emission:
// Split chain edges at crossing points
const newChainEdges: Array<[number, number]> = [];
for (const [v0, v1] of uniqueEdges) {
    const u0 = vertices[v0 * 3], t0 = vertices[v0 * 3 + 1];
    const u1 = vertices[v1 * 3], t1 = vertices[v1 * 3 + 1];
    
    // Find all phantom vertices this edge passes through
    const intermediates: number[] = [];
    for (const pr of phantomRows) {
        for (const pv of pr.verts) {
            const pu = vertices[pv * 3], pt = vertices[pv * 3 + 1];
            // Check if phantom vertex lies on the line segment v0→v1
            // (within tolerance)
            if (isOnSegment(u0, t0, u1, t1, pu, pt, MERGE_THRESHOLD)) {
                intermediates.push(pv);
            }
        }
    }
    
    if (intermediates.length === 0) {
        newChainEdges.push([v0, v1]);
    } else {
        // Sort intermediates by parameter along v0→v1
        intermediates.sort((a, b) => {
            const ta = vertices[a * 3 + 1];
            const tb = vertices[b * 3 + 1];
            return (ta - t0) - (tb - t0);
        });
        
        let prev = v0;
        for (const mid of intermediates) {
            newChainEdges.push([prev, mid]);
            prev = mid;
        }
        newChainEdges.push([prev, v1]);
    }
}
```

### Phase 4: Validation Criteria (~30 mins)

Add diagnostic metrics:

```typescript
console.log(`[CDT] R37: ${crossings.length} column crossings split into ${phantomRows.length} phantom rows, ${nextPhantomIdx - basePhantomIdx} phantom vertices`);
```

## Validation Criteria

How to measure "dips eliminated":

1. **Super-cell count**: Should drop from 2,529 to near 0 (each super-cell is split into sub-bands where chain edges don't cross columns)

2. **Chain edge enforcement**: Must remain 100% (no regressions)

3. **Triangle count delta**: Should be < 30k additional tris (target: 753k total)

4. **Visual inspection**: Export a Gyroid pot at 512 resolution, view in mesh viewer — ridge line should be smooth without depressions at regular intervals

5. **Max triangle aspect ratio in chain-adjacent triangles**: Should decrease from 37:1 to < 15:1

6. **New metric — "crossing dip depth"**: For each column-crossing chain edge, measure the minimum elevation along the mesh edge path vs the chain edge path. Before: significant delta at crossing points. After: near-zero delta.

## Risk Analysis

| Risk | Impact | Mitigation |
|---|---|---|
| Vertex buffer expansion complexity | Medium | Pre-count crossings before emission; allocate once |
| Phantom row vertices at wrong T create non-manifold | High | Clamp tCross to [tBot + ε, tTop - ε]; dedup with existing vertices |
| Chain edge splitting breaks enforcement verification | High | Update `chainEdges` array with split sub-edges; re-verify |
| Multiple crossings in one super-cell create too many sub-bands | Low | Dedup by T; typically 1 crossing per super-cell for 1-column cases |
| Seam-wrap crossings near U=0/1 | Medium | Skip seam-spanning super-cells (existing SEAM_GUARD) |
| Sub-band with 0 chain edges loses chain edge enforcement | High | Each split sub-edge must be a valid chain edge in its sub-band |

## Open Questions

1. **Vertex buffer strategy**: Should we pre-allocate with estimated count, or use a dynamic array and convert to Float32Array at the end? The current code builds `vertices` as a pre-sized Float32Array before the emission loop. Adding phantom vertices inside `emitSuperCell` requires either (a) pre-counting, (b) using a growable array, or (c) a two-pass approach (count then allocate then emit). Verifier: which is cleanest?

2. **Chain edge splitting scope**: Should chain edges be split globally (updating the master `chainEdges` array) or locally within `emitSuperCell`? Global splitting is cleaner for verification but requires coordination with edge assignment.

3. **3D evaluation of phantom vertices**: The vertex buffer stores `(u, t, surfaceId)` — the parametric evaluator converts these to 3D positions later. Phantom vertices at `(U_c, tCross)` will be evaluated like any other vertex. Is there any risk that the parametric surface at `(U_c, tCross)` is NOT at ridge elevation? Answer: yes, if the chain doesn't perfectly track the mathematical feature. But the dip at phantom vertices will be far smaller than the original super-cell dip because the triangle spans a much shorter T range.

4. **Interaction with batch6 global dedup**: Phantom vertices at column-boundary U positions will have the same U as grid vertices but different T. They should NOT be deduped with grid vertices. The batch6 dedup uses 1e-5 quantization, so different T values will produce different keys → safe.

5. **colEnd + 1 boundary check**: For 1-column super-cells (colStart = c, colEnd = c+1), there's only one intermediate column boundary at `unionU[c+1]`. The phantom row has 3 vertices: `unionU[c]`, `unionU[c+1]`, `unionU[c+2]`. Is `c+2` always valid? Yes, because `colEnd + 1 <= cellsPerRow`, and `numU = cellsPerRow + 1`.
