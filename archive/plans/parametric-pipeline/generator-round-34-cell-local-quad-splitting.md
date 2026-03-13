# Generator Round 34 — Cell-Local Quad Splitting

Date: 2026-03-07

## Problem Statement

The CDT chain strip architecture has failed across three major iterations (R31–R33). Current export metrics are catastrophic:

- `min_angle=0.0°`, `max_aspect=24633:1`, **64.1% sliver violations** (279539/436082 chain-strip triangles)
- 3D edge flip pass is DEGRADING quality (ideal valence dropped 49755→39643)
- 4571 inconsistent normal pairs
- 191K companion vertices creating monster unstructured triangulations
- expansion=4 means the strip is 9 cells wide per chain — nearly half the mesh goes through CDT

The entire CDT + companion + expansion + boundary-chain + windowing architecture must be replaced with something fundamentally simpler: **cell-local quad splitting**.

## Root Cause Analysis

### Why CDT Is the Wrong Tool

The grid mesh is a structured quad grid. It has beautiful properties: regular topology, predictable vertex valence, no degenerate triangles. The CDT approach destroys these properties by:

1. **Carving wide strips** out of the grid (`expansion=2→4`, making each strip 5–9 cells wide)
2. **Injecting 191K Steiner points** (T-Ladder rungs, U-graded fans, shell companions) at arbitrary positions
3. **Running CDT** on this point soup — CDT optimizes for circumscribed circles, not grid-compatible topology
4. **Attempting post-hoc repair** via 3D edge flips that make things worse

The fundamental error is treating the chain strip as an unstructured triangulation problem. It isn't. Every chain edge crosses at most a few grid cells. The mesh changes should be **local to those cells**, not a 9-cell-wide CDT monsoon.

### Why Chain Vertices Are Between Grid Columns

The grid construction (`GridBuilder.ts::mergeFeaturePositions`, [line 76](../../src/renderers/webgpu/parametric/GridBuilder.ts#L76)) injects columns at detected feature U positions. However, after `smoothChainPath()` ([ChainLinker.ts](../../src/renderers/webgpu/parametric/ChainLinker.ts#L550)) applies Savitzky-Golay smoothing, chain vertex U positions **drift from their original grid-injected positions**. The SG filter is a weighted average over a window, so each vertex's U shifts toward its neighbors.

Result after smoothing:
- **batch2Remap threshold (1e-6)**: Some chain vertices still fall within 1e-6 of a grid column and get merged. These become grid vertices; their chain edges become grid edges.
- **Most chain vertices**: Drift 1e-5 to 1e-3 from the nearest grid column. These sit genuinely between two grid columns. `bsearchFloor(unionU, cv.u)` gives the column to their LEFT.

This means the cell-local approach must handle **chain vertices between grid columns** as the primary case, not an edge case.

### Chain Edge Geometry After Interpolation

After row-gap interpolation ([OWT line 504–535](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L504)), every chain edge spans exactly one row band (rowGap ≤ 1). Each chain edge connects:
- Vertex at row `j`, U position `u_bot`, in cell `(j, col_bot)` where `col_bot = bsearchFloor(unionU, u_bot)`
- Vertex at row `j+1`, U position `u_top`, in cell `(j, col_top)` where `col_top = bsearchFloor(unionU, u_top)`

If `col_bot == col_top`: the chain edge stays within one cell column. This is the **common case** — after SG smoothing, adjacent chain points drift by only a fraction of a grid column width.

If `col_bot != col_top`: the chain edge crosses one or more column boundaries. This is **rare** but must be handled.

---

## Proposals

### Proposal 1: Cell-Local Quad Splitting (Recommended — Radical)

**Idea**: Replace the entire CDT chain strip system with per-cell quad splitting. Each grid cell is independently triangulated based on which chain vertices sit on its edges and which chain edges pass through it.

#### 1.1 Cell-Local Quad Splitting Algorithm

##### Data Structures

For each row band `j` (from row `j` to row `j+1`), we need:

```typescript
// Per-cell chain info, computed once per band
interface CellChainInfo {
    botChainVerts: ChainVertex[];  // chain verts on bottom edge (row j), sorted by U
    topChainVerts: ChainVertex[];  // chain verts on top edge (row j+1), sorted by U
    chainEdges: Array<[number, number]>;  // chain edges crossing this cell (global vtx indices)
}
```

##### Pre-computation: Build Cell-to-Chain Maps

Before the cell emission loop, build a lookup from `(band, col)` → chain info:

```typescript
// Map: cellKey(band, col) → CellChainInfo
const cellChainMap = new Map<number, CellChainInfo>();
const cellKey = (band: number, col: number): number => band * cellsPerRow + col;

// 1. Assign chain vertices to cells
for (const cv of chainVertices) {
    // Skip batch2Remap'd vertices (they became grid vertices)
    if (batch2Remap.has(cv.vertexIdx)) continue;
    
    const col = bsearchFloor(unionU, cv.u);
    const gc = col < 0 ? 0 : (col >= cellsPerRow ? cellsPerRow - 1 : col);
    
    // This vertex is on row cv.rowIdx.
    // It affects cell (cv.rowIdx - 1, gc) as a top-edge vertex
    // and cell (cv.rowIdx, gc) as a bottom-edge vertex.
    if (cv.rowIdx > 0) {
        const key = cellKey(cv.rowIdx - 1, gc);
        let info = cellChainMap.get(key);
        if (!info) { info = { botChainVerts: [], topChainVerts: [], chainEdges: [] }; cellChainMap.set(key, info); }
        info.topChainVerts.push(cv);
    }
    if (cv.rowIdx < numT - 1) {
        const key = cellKey(cv.rowIdx, gc);
        let info = cellChainMap.get(key);
        if (!info) { info = { botChainVerts: [], topChainVerts: [], chainEdges: [] }; cellChainMap.set(key, info); }
        info.botChainVerts.push(cv);
    }
}

// 2. Assign chain edges to cells
for (const [v0, v1] of chainEdges) {
    const cv0 = chainVertices[v0 - gridVertexCount];
    const cv1 = chainVertices[v1 - gridVertexCount];
    if (!cv0 || !cv1) continue;
    
    // After interpolation, every edge spans exactly 1 row band
    const band = Math.min(cv0.rowIdx, cv1.rowIdx);
    const col0 = bsearchFloor(unionU, cv0.u);
    const col1 = bsearchFloor(unionU, cv1.u);
    
    // Clamp columns
    const gc0 = Math.max(0, Math.min(cellsPerRow - 1, col0));
    const gc1 = Math.max(0, Math.min(cellsPerRow - 1, col1));
    
    const cMin = Math.min(gc0, gc1);
    const cMax = Math.max(gc0, gc1);
    
    // Register the edge in every cell it crosses
    for (let c = cMin; c <= cMax; c++) {
        const key = cellKey(band, c);
        let info = cellChainMap.get(key);
        if (!info) { info = { botChainVerts: [], topChainVerts: [], chainEdges: [] }; cellChainMap.set(key, info); }
        info.chainEdges.push([v0, v1]);
    }
}

// 3. Sort chain vertices within each cell by U
for (const [, info] of cellChainMap) {
    info.botChainVerts.sort((a, b) => a.u - b.u);
    info.topChainVerts.sort((a, b) => a.u - b.u);
}
```

##### Cell Emission: The Split Algorithm

For each cell `(band, col)`:

```typescript
function emitCell(band: number, col: number): void {
    const key = cellKey(band, col);
    const info = cellChainMap.get(key);
    
    if (!info) {
        // No chain activity → standard 2-triangle quad split
        emitStandardCell(band, col);
        return;
    }
    
    // Grid corner vertex indices
    const BL = band * numU + col;
    const BR = band * numU + (col + 1);
    const TL = (band + 1) * numU + col;
    const TR = (band + 1) * numU + (col + 1);
    
    // Build full bottom edge: [BL, ...botChainVerts, BR]
    const botEdge: number[] = [BL];
    for (const cv of info.botChainVerts) {
        botEdge.push(cv.vertexIdx);
    }
    botEdge.push(BR);
    
    // Build full top edge: [TL, ...topChainVerts, TR]
    const topEdge: number[] = [TL];
    for (const cv of info.topChainVerts) {
        topEdge.push(cv.vertexIdx);
    }
    topEdge.push(TR);
    
    // If there are chain edges, they define mandatory triangle edges
    // that partition the cell into sub-regions.
    // If no chain edges but vertices exist, use a simple fan/sweep.
    
    if (info.chainEdges.length === 0) {
        // Chain vertices on edges but no chain edge through cell.
        // Use monotone sweep between bottom and top edge arrays.
        sweepQuad(indexBuf, botEdge, topEdge, vertices);
    } else {
        // Chain edges partition the cell.
        // Use constrained sweep: chain edges are mandatory diagonals.
        constrainedSweepCell(indexBuf, botEdge, topEdge, info.chainEdges, vertices);
    }
}
```

##### Case Analysis: Triangle Decompositions

**Case A: No chain vertices on either edge, no chain edges (standard cell)**
```
TL ─── TR        →  TL─TR─BL  and  BL─TR─BR (standard diagonal)
│       │            or use shorter-diagonal heuristic
BL ─── BR
```
2 triangles. This is `emitStandardCell()` unchanged.

**Case B: One chain vertex CP on bottom edge, no chain edge**
```
TL ────── TR      Bottom edge: [BL, CP, BR]
│          │      Top edge: [TL, TR]
BL ─ CP ─ BR     Sweep: TL→BL, TL→CP, TL→BR→TR  (fan from TL to bottom)
```
3 triangles: (TL, BL, CP), (TL, CP, BR), (TL, BR, TR).
But a fan from TL creates slivers if CP is far from TL. Better: sweep left-to-right.

Sweep algorithm for unequal-length top/bottom edges:
- Bottom cursor `bi=0`, top cursor `ti=0`
- At each step, advance the cursor whose next vertex has lower U
- Emit triangle connecting the advanced vertex to the other edge's current vertex

Result for Case B: (BL, CP, TL), (CP, BR, TL), (BR, TR, TL) — same 3 triangles, better winding.

**Case C: One chain edge crossing the cell — CP_bot on bottom, CP_top on top**
```
TL ─ CP_top ─ TR     The chain edge CP_bot→CP_top is a mandatory triangle edge.
│      ╱       │     Left sub-quad: [BL, CP_bot, CP_top, TL] → 2 triangles
│    ╱         │     Right sub-quad: [CP_bot, BR, TR, CP_top] → 2 triangles
BL ─ CP_bot ─ BR
```
4 triangles total. This is the critical case for feature sharpness.

Left sub-quad triangulation (choose shorter diagonal):
- Option 1: (BL, CP_bot, CP_top) + (BL, CP_top, TL) — diagonal BL–CP_top
- Option 2: (BL, CP_bot, TL) + (CP_bot, CP_top, TL) — diagonal CP_bot–TL
Choose based on which diagonal is shorter in UV space.

Right sub-quad triangulation (choose shorter diagonal):
- Option 1: (CP_bot, BR, CP_top) + (BR, TR, CP_top) — diagonal BR–CP_top
- Option 2: (CP_bot, BR, TR) + (CP_bot, TR, CP_top) — diagonal CP_bot–TR
Choose based on which diagonal is shorter.

**Case D: Chain edge enters from a side (cross-column edge)**
```
TL ───────── TR       Chain edge from (row j, col c-1) to (row j+1, col c)
│ ╲           │       enters the cell through the left vertical edge.
│   ╲         │       
│     CP_top  │       CP_top is ON the top edge (row j+1, col c matches this cell).
│       ╱     │       But the other endpoint is in cell (j, c-1) at the bottom.
│     ╱       │       
BL ─────── BR         The chain edge crosses the LEFT BOUNDARY of this cell.
```

For cross-column edges, we need **intersection points** on the column boundaries. At column `c`, the chain edge from `(u_bot, t_bot)` to `(u_top, t_top)` crosses at:
```
u_cross = unionU[c]
frac = (u_cross - u_bot) / (u_top - u_bot)
t_cross = t_bot + frac * (t_top - t_bot)
```

This intersection point is a NEW vertex that must be added to the vertex buffer. It sits on the cell boundary (the vertical edge between columns c-1 and c) at a fractional T position.

After adding the intersection vertex, each sub-cell gets a clean chain edge segment within its boundaries:
- Cell (j, c-1): chain edge from `CP_bot` at (u_bot, row j) to `CROSS` at (unionU[c], t_cross)
- Cell (j, c): chain edge from `CROSS` at (unionU[c], t_cross) to `CP_top` at (u_top, row j+1)

Each sub-cell is then triangulated as in Case C, with the cross-point vertex on the shared boundary edge (left or right side of the cell).

**Case E: Multiple chain edges in same cell**

This occurs when two or more chains pass through the same cell. Each chain edge is a mandatory triangle edge. The cell is partitioned into sub-regions by these edges.

Algorithm: sort chain edges by their "center U" position (average of bottom and top U). Between consecutive chain edges, there's a sub-quad that can be triangulated. Left and right boundary sub-quads connect to the cell corners.

However, Case E is **extremely rare** — it requires two chains whose U positions are so close that they fall in the same grid cell. The grid construction places CDF-adaptive columns near features, making cells near features very narrow. Two features in the same narrow cell would have been merged during chain linking.

**Assumption 1 (for Verifier)**: Case E can be handled by falling back to a mini constrained-Delaunay of the cell's boundary+constraint vertices (maybe 6–10 vertices). This is O(1) per cell and vastly simpler than the current 9-cell-wide CDT. Alternatively, if Case E is indeed extremely rare, we can handle it by splitting the cell with explicit sub-polygon enumeration.

##### `sweepQuad`: Monotone Sweep for Unequal Edges

```typescript
/**
 * Triangulate a quad with extra vertices on bottom and top edges.
 * Both edges are sorted left-to-right by U. The quad is U-monotone.
 * Uses a two-pointer sweep.
 */
function sweepQuad(
    buf: number[],
    bot: number[],  // [BL, ...chain verts..., BR] — sorted by U
    top: number[],  // [TL, ...chain verts..., TR] — sorted by U
    verts: Float32Array  // vertex buffer for U lookups
): void {
    let bi = 0, ti = 0;
    const bLen = bot.length, tLen = top.length;
    
    while (bi < bLen - 1 || ti < tLen - 1) {
        if (bi >= bLen - 1) {
            // Advance top
            emitTriCCW(buf, top[ti], top[ti + 1], bot[bi], verts);
            ti++;
        } else if (ti >= tLen - 1) {
            // Advance bottom
            emitTriCCW(buf, bot[bi], bot[bi + 1], top[ti], verts);
            bi++;
        } else {
            // Advance whichever has the lower next-U
            const botNextU = verts[bot[bi + 1] * 3];
            const topNextU = verts[top[ti + 1] * 3];
            if (botNextU <= topNextU) {
                emitTriCCW(buf, bot[bi], bot[bi + 1], top[ti], verts);
                bi++;
            } else {
                emitTriCCW(buf, top[ti], top[ti + 1], bot[bi], verts);
                ti++;
            }
        }
    }
}
```

This is the same algorithm used in `sweepRegion` in the existing `ChainStripTriangulator.ts` ([line 621](../../src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L621)), but applied to a single cell instead of an entire strip.

##### `constrainedSweepCell`: Chain Edges as Partition Lines

```typescript
/**
 * Triangulate a cell with chain edges as mandatory triangle edges.
 * Chain edges connect bottom-edge vertices to top-edge vertices,
 * partitioning the cell into sub-quads.
 */
function constrainedSweepCell(
    buf: number[],
    bot: number[],      // [BL, ...chain verts..., BR] sorted by U
    top: number[],      // [TL, ...chain verts..., TR] sorted by U
    chainEdges: Array<[number, number]>,
    verts: Float32Array
): void {
    // Identify which bot/top vertices are chain edge endpoints
    const botSet = new Set(bot);
    const topSet = new Set(top);
    
    // Build sorted list of (botIdx_in_array, topIdx_in_array) for each chain edge
    interface Partition {
        botPos: number;  // index into bot[]
        topPos: number;  // index into top[]
        botVtx: number;  // global vertex index
        topVtx: number;  // global vertex index
    }
    const partitions: Partition[] = [];
    
    for (const [v0, v1] of chainEdges) {
        let bIdx = bot.indexOf(v0);
        let tIdx = top.indexOf(v1);
        if (bIdx < 0 && tIdx < 0) {
            // Try reversed
            bIdx = bot.indexOf(v1);
            tIdx = top.indexOf(v0);
        }
        if (bIdx >= 0 && tIdx >= 0) {
            partitions.push({ botPos: bIdx, topPos: tIdx, botVtx: bot[bIdx], topVtx: top[tIdx] });
        }
        // If one endpoint is not on bot/top, it's a cross-column edge
        // handled separately via intersection vertices
    }
    
    // Sort partitions by average U position
    partitions.sort((a, b) => {
        const aU = (verts[a.botVtx * 3] + verts[a.topVtx * 3]) / 2;
        const bU = (verts[b.botVtx * 3] + verts[b.topVtx * 3]) / 2;
        return aU - bU;
    });
    
    // Sweep: emit sub-quads between consecutive partition lines
    let prevBotPos = 0;  // start at BL
    let prevTopPos = 0;  // start at TL
    
    for (const part of partitions) {
        // Sub-quad from (prevBot..part.botPos) × (prevTop..part.topPos)
        const subBot = bot.slice(prevBotPos, part.botPos + 1);
        const subTop = top.slice(prevTopPos, part.topPos + 1);
        if (subBot.length >= 1 && subTop.length >= 1) {
            sweepQuad(buf, subBot, subTop, verts);
        }
        
        prevBotPos = part.botPos;
        prevTopPos = part.topPos;
    }
    
    // Final sub-quad: from last partition to right boundary
    const finalBot = bot.slice(prevBotPos);
    const finalTop = top.slice(prevTopPos);
    if (finalBot.length >= 1 && finalTop.length >= 1) {
        sweepQuad(buf, finalBot, finalTop, verts);
    }
}
```

**Assumption 2 (for Verifier)**: The chain edge `CP_bot→CP_top` appears as a triangle edge because `sweepQuad` processes the left sub-quad `[..., CP_bot] × [..., CP_top]` ending at those vertices, then processes the right sub-quad `[CP_bot, ...] × [CP_top, ...]` starting at them. The last triangle of the left sub-quad has `CP_bot` and `CP_top` as vertices, and the first triangle of the right sub-quad also has them. The shared edge `CP_bot–CP_top` is therefore an edge of both triangles.

**Assumption 3 (for Verifier)**: The sweepQuad algorithm terminates correctly for all sub-quad shapes. The two-pointer sweep advances whichever edge has the lower next-U, consuming all vertices. Each step emits exactly one triangle. Total triangles per sub-quad = `(botLen - 1) + (topLen - 1)`.

---

### 1.2 Chain Edge Crossing Detection

Chain edges cross column boundaries when `col_bot != col_top`.

For a chain edge from `(u_bot, row j)` to `(u_top, row j+1)`:
```
col_bot = bsearchFloor(unionU, u_bot)
col_top = bsearchFloor(unionU, u_top)
```

**If `col_bot == col_top`**: The edge stays within one cell column. Register it in cell `(j, col_bot)`. Both endpoints are on the bottom and top edges of this cell.

**If `col_bot < col_top`** (edge goes right): The edge crosses column boundaries at `unionU[col_bot+1], unionU[col_bot+2], ..., unionU[col_top]`. For each crossing column `c`:

```
frac = (unionU[c] - u_bot) / (u_top - u_bot)
t_cross = activeTPositions[j] + frac * (activeTPositions[j+1] - activeTPositions[j])
u_cross = unionU[c]
```

Create a new **intersection vertex** at `(u_cross, t_cross)` and add it to the vertex buffer. This vertex sits on the shared vertical boundary between cells `(j, c-1)` and `(j, c)`.

Then split the chain edge into sub-segments:
- Cell `(j, col_bot)`: edge from `CP_bot` to `CROSS[col_bot+1]`
  - `CP_bot` is on the bottom edge; `CROSS[col_bot+1]` is on the RIGHT vertical edge
- Cell `(j, c)` for `col_bot < c < col_top`: edge from `CROSS[c]` to `CROSS[c+1]`
  - `CROSS[c]` is on the LEFT vertical edge; `CROSS[c+1]` is on the RIGHT vertical edge
- Cell `(j, col_top)`: edge from `CROSS[col_top]` to `CP_top`
  - `CROSS[col_top]` is on the LEFT vertical edge; `CP_top` is on the top edge

Each cell containing a cross-column segment has **a chain edge segment entering through a side edge**. This transforms the cell from a quad into a polygon with 5+ boundary vertices.

**Handling the 5-vertex polygon**: When a chain edge enters from the left side at `CROSS_left` and exits through the top edge at `CP_top`:
```
TL ─ CP_top ─── TR           Polygon: [BL, BR, TR, CP_top, CROSS_left]
│    ╱           │            Split along chain edge CROSS_left → CP_top:
CROSS_left       │              Left triangle: [BL, CROSS_left, TL] (but wait, TL is involved)
│                │            
BL ───────── BR               Actually: the chain edge is CROSS_left → CP_top.
```

Hmm, this case is more complex because the chain segment enters from a vertical edge, not a horizontal edge. Let me rethink.

For a cell where the chain edge enters the LEFT boundary at height `CROSS`:
```
TL ── CP_top ── TR
│       ╱        │
CROSS ╱          │        
│   ╱            │
BL ──────── BR
```

The cell is split into:
- Left-of-chain: triangle (BL, CROSS, TL) — since CROSS is on the left edge between BL and TL, this is just a degenerate sub-polygon
  Wait, CROSS is on the left side edge between BL and TL. So the left boundary is now [BL, CROSS, TL] instead of [BL, TL].

Let me refactor the cell boundary for this case:
- Bottom edge: [BL, BR]
- Right edge: [BR, TR]
- Top edge: [TR, CP_top, TL] (reversed — top goes right-to-left for polygon winding)
- Left edge: [TL, CROSS, BL] (reversed — left goes top-to-bottom)

Chain edge: CROSS → CP_top (mandatory triangle edge)

This splits the cell polygon into:
1. Upper-left triangle: [TL, CROSS, CP_top] — above the chain edge, to the left
2. Lower region: polygon [BL, BR, TR, CP_top, CROSS] — below and right of the chain edge

The lower region is a pentagon. Triangulate by sweep or fan:
- Fan from BR: (BL, BR, CROSS), (BR, TR, CP_top), (BR, CP_top, CROSS)
- Or sweep: more robust

This is getting into territory where we need a general simple-polygon triangulator for cells with side-entering edges. But these cases are **rare** (cross-column edges are rare).

**Proposal**: For cross-column chain edges, add intersection vertices on column boundaries, then for each affected cell, use a mini ear-clipping or fan triangulation of the resulting 5–6 vertex polygon. Since cells have at most 6-7 vertices, this is O(1) per cell.

**Assumption 4 (for Verifier)**: Cross-column chain edges are rare enough (the user confirmed `crossCellEdgeCount` is tracked — typically <5% of all edges) that a per-cell mini-triangulation is acceptable. The mini-triangulation doesn't need to be Delaunay — any valid triangulation that includes the chain edge as a triangle edge suffices.

---

### 1.3 Integration Plan

#### Code to REMOVE from OuterWallTessellator.ts

| Section | Lines | What It Does | Why Remove |
|---------|-------|-------------|------------|
| Section 1.5: Companion generation | ~566–830 | T-Ladder rungs, U-graded fans, shell companions, dedup buckets | No companions needed — no CDT to feed |
| `interiorByBand` construction | ~840–860 | Buckets interior companion vertices by band | No interior vertices |
| Shadow boundary enrichment | ~870–915 | `rowShadowUs`, shadow vertex insertion | No strip boundaries to enrich |
| `topDupMap` / `topDupReverse` | ~946–960 | Duplicate chain vertices for multi-band CDT | No multi-band CDT |
| Shadow vertex map construction | ~961–975 | Shadow vertex buffer allocation and 3D position computation | No shadow vertices |
| `rawColHasChain` computation | ~1120–1195 | Per-band column bitmap with expansion and neighbor union | No expansion, no bitmaps — use `cellChainMap` |
| `colHasChain` expansion | ~1230–1250 | Horizontal expansion (±N columns) | No expansion |
| Chain strip detection loop | ~1300–1800 | `segStart/segEnd` detection, strip assembly, buildMergedRow dispatch, B-A1/B-A2 rescues, boundary companions, boundary constraints, crossing detection, `triangulateChainStrip()` call | Entire strip system replaced by cell-local |
| `buildMergedRow` function | ~1035–1115 | Interleaves grid and chain vertices into merged rows for CDT | Replaced by direct cell-vertex lookup |

**Estimated removal: ~700 lines.**

#### Code to ADD to OuterWallTessellator.ts

| Component | Description | Est. Lines |
|-----------|-------------|------------|
| `cellChainMap` construction | Maps (band, col) → chain vertices + edges | ~50 |
| Cross-column intersection vertex creation | For rare cross-column edges, compute and add intersection vertices | ~40 |
| `emitChainCell()` | Cell-local triangulation with chain edges as constraints | ~60 |
| `sweepQuad()` | Monotone sweep for sub-quad triangulation | ~25 |
| `constrainedSweepCell()` | Partitioned sweep with chain edges as partition lines | ~45 |
| `emitTriCCW()` | Winding-correct triangle emission | ~15 |

**Estimated addition: ~235 lines.**

**Net change: −465 lines** (from ~2050 to ~1585).

#### Code to KEEP in OuterWallTessellator.ts

| Section | Lines | What It Does |
|---------|-------|-------------|
| Chain vertex creation (Section 1) | ~446–560 | Remaps chain points, interpolates multi-row gaps, records chain edges |
| `insertMicroRowsForSteepCrossings` | ~175–250 | Micro-row insertion for steep crossings |
| `subdivideFullChain` | ~284–370 | CatRom subdivision (currently disabled but retained) |
| `estimateCircumferentialStretch` | ~113–118 | Pot geometry helper |
| `emitStandardCell()` | ~1255–1290 | Standard 2-triangle quad emission |
| Seam skip logic | ~1295–1305 | Seam column detection |
| batch2Remap system | ~1045–1060 | Chain→grid vertex merging at coincident positions |
| Chain edge verification | ~1860–2000 | Post-build edge audit |
| Batch 6 global dedup | ~1810–1860 | Global vertex UV dedup |
| Final result assembly | ~2020–2050 | Trim, return |

#### Code to MODIFY in OuterWallTessellator.ts

The main cell emission loop (currently at ~1295) changes from:

```typescript
// CURRENT: Complex chain strip detection with segments
while (i < cellsPerRow) {
    if (!colHasChain[i]) {
        emitStandardCell(band, i);
        i++;
    } else {
        // Detect contiguous segment, assemble strip, dispatch to CDT...
        // (400+ lines of strip assembly)
    }
}
```

To:

```typescript
// PROPOSED: Simple per-cell dispatch
for (let c = 0; c < cellsPerRow; c++) {
    const uSpan = unionU[c + 1] - unionU[c];
    if (uSpan > SEAM_GUARD || uSpan < -SEAM_GUARD) {
        indexBuf.push(0, 0, 0, 0, 0, 0);
        seamSkipCount++;
        continue;
    }
    
    const key = cellKey(band, c);
    const info = cellChainMap.get(key);
    
    if (!info) {
        emitStandardCell(band, c);
    } else {
        emitChainCell(band, c, info);
    }
}
```

---

### 1.4 What About ChainStripTriangulator.ts?

**DELETE ENTIRELY.**

The entire file (650 lines) exists to serve the CDT chain strip system:
- `cdtTriangulateStrip()` — CDT triangulation with cdt2d
- `sweepTriangulateStrip()` — sweep fallback with constraint classification
- `sweepRepairTriangulateStrip()` — sweep-repair hybrid
- `scanR2Violations()` — quality audit
- `simpleSweep()`, `sweepRegion()` — monotone sweep helpers

The `sweepRegion()` logic (two-pointer sweep) is reimplemented as `sweepQuad()` in the cell-local system, but it's simple enough (~25 lines) that copying the algorithm is cleaner than keeping the file's dependency chain.

**Also remove**: The `cdt2d` npm dependency. One fewer third-party library.

**Also remove**: `ChainStripConfig` and `ChainStripStats` interfaces and their imports throughout the pipeline.

**Files that import from ChainStripTriangulator.ts** (must be updated):
- `OuterWallTessellator.ts` — remove all CST imports, `createEmptyStats()`, `triangulateChainStrip()` call
- `ParametricExportComputer.ts` — remove `ChainStripConfig` references, `DEFAULT_CHAIN_STRIP_CONFIG`
- Any test files referencing CST

---

### 1.5 Chain Edge as Triangle Edge — Guarantee

The chain edge MUST appear as a triangle edge in the final mesh. The cell-local approach guarantees this by construction:

**For same-column chain edges** (col_bot == col_top):
- The chain edge `CP_bot → CP_top` is passed to `constrainedSweepCell()` as a constraint
- `constrainedSweepCell()` uses the chain edge as a **partition line**, splitting the cell's sweep into a left sub-quad and a right sub-quad
- The left sub-quad's rightmost bottom vertex is `CP_bot`, and its rightmost top vertex is `CP_top`
- The right sub-quad's leftmost bottom vertex is `CP_bot`, and its leftmost top vertex is `CP_top`
- `sweepQuad()` for the left sub-quad ends with `CP_bot` and `CP_top` as the last pair, and `sweepQuad()` for the right sub-quad starts with them as the first pair
- One of these sub-quad sweeps produces a triangle with edge `CP_bot–CP_top`

**Formal proof**: In `sweepQuad(buf, [... CP_bot], [... CP_top], verts)`, the last step has `bi = len-1` and `ti = len-1`. The second-to-last triangle connects the penultimate vertex to `CP_bot` and `CP_top` (or equivalently, the first triangle of the right sub-quad connects `CP_bot`, the next vertex, and `CP_top`). Either way, edge `CP_bot–CP_top` is a triangle edge.

**Wait, this argument has a gap.** Let me be more precise.

The left sub-quad is `sweepQuad(buf, botSlice=[...CP_bot], topSlice=[...CP_top], ...)`.

The sweep processes `botSlice` and `topSlice` simultaneously. At the end, both cursors reach their last element: `bi = botSlice.length - 1` (pointing at `CP_bot`), `ti = topSlice.length - 1` (pointing at `CP_top`).

But the sweep doesn't explicitly connect the last vertices — it exits when both cursors are at the end. The last TRIANGLE emitted has the two last-advanced vertices plus the current position of the other cursor.

Actually, the loop condition is `while (bi < bLen-1 || ti < tLen-1)`. When both are at `len-1`, the loop exits. The triangles emitted connect adjacent vertices on one edge to the current position on the other edge.

Consider the simplest case: `botSlice = [A, CP_bot]`, `topSlice = [B, CP_top]`.
- Step 1: compare U of CP_bot and CP_top. Advance whichever is lower.
  - If `U(CP_bot) <= U(CP_top)`: emit triangle (A, CP_bot, B), advance bi to 1.
    Now bi=1=bLen-1, ti=0. Loop condition: `0 < 1` → true.
    Step 2: only top can advance. Emit triangle (B, CP_top, CP_bot). Advance ti to 1.
    Both at end. We emitted: (A, CP_bot, B) and (B, CP_top, CP_bot).
    Triangle 2 has edge CP_bot–CP_top. ✓
  - If `U(CP_top) < U(CP_bot)`: emit triangle (B, CP_top, A), advance ti to 1.
    Now ti=1=tLen-1, bi=0. Emit triangle (A, CP_bot, CP_top). Advance bi to 1.
    Triangle 2 has edge CP_bot–CP_top. ✓

**In both orderings, the chain edge appears as a triangle edge.** This generalizes: the chain edge endpoints are the LAST vertices of their respective sub-quad edges, so the sweep's final triangles always connect them.

**Assumption 5 (for Verifier)**: The chain edge `CP_bot–CP_top` is guaranteed to be a triangle edge when `constrainedSweepCell` partitions the cell such that `CP_bot` and `CP_top` are the LAST vertices of the left sub-quad's bottom and top edges respectively.

**For cross-column chain edges** (col_bot != col_top):
- Intersection vertices are added on column boundaries
- Each cell segment gets a chain edge sub-segment
- The sub-segment endpoints are on cell boundaries
- Same `constrainedSweepCell` logic applies per sub-cell
- The full chain edge is the union of sub-segment edges, each of which is a triangle edge

---

### 1.6 Expected Improvements

#### Triangle Count

| Region | Current (R33) | Proposed (R34) | Reduction |
|--------|---------------|----------------|-----------|
| Standard cells | ~200K tris | ~490K tris | +290K (recovering cells from CDT) |
| Chain strip / chain cells | 436K tris | ~150K tris | −286K |
| **Total** | ~636K tris | ~640K tris | ~Same |

The total triangle count is similar, but the distribution is radically different. Almost all triangles are now well-shaped quad splits instead of CDT soup.

**Note**: The "standard cells" count increases because cells that were previously swallowed by the expanded CDT strip are now emitted as standard cells. The chain cell count drops because no expansion means only cells actually containing chain activity are affected.

#### Quality Metrics

| Metric | Current (R33) | Expected (R34) | Basis |
|--------|---------------|-----------------|-------|
| Min angle (UV) | 0.0° | >15° | Sweep guarantees no degenerate triangles; batch2Remap prevents near-coincident vertices |
| Max aspect ratio | 24633:1 | <10:1 | Cell aspect ratio is ~1.6:1 (width/height); worst-case split is 2× worse |
| Sliver rate | 64.1% | <2% | Slivers require extreme aspect ratios; cell-local triangles bounded by cell shape |
| Companion vertices | 191K | 0 | Eliminated |
| Chain-strip triangles | 436K | ~150K | Only cells containing chain activity |
| Missing chain edges | ~500+ | 0 | Chain edges are triangle edges by construction |
| Inconsistent normals | 4571 | ~0 | All winding is locally deterministic |

**Assumption 6 (for Verifier)**: The min angle > 15° claim assumes that chain vertices are at least 1e-6 away from grid corners (batch2Remap handles closer cases) and that no cell has a chain vertex in its extreme corner zone. If a chain vertex is at U = unionU[c] + 1.5e-6 (just past the merge threshold), the resulting triangle could have a very small angle. This is mitigated by coarsening the merge threshold from 1e-6 to 1e-4 (proposed separately below).

#### Performance

| Metric | Current | Expected |
|--------|---------|----------|
| Build time | ~300ms (CDT dominates) | <50ms (simple array operations) |
| Memory | ~191K companion vertices × 3 floats = 2.3MB | 0 extra vertices (a few intersection vertices for cross-column, negligible) |
| Code complexity | ~700 lines of strip assembly + 650 lines CST | ~235 lines cell-local |

---

## Proposal 2: Coarsen batch2Remap Threshold (Conservative, Companion to Proposal 1)

**Idea**: Increase the batch2Remap coincidence threshold from 1e-6 to 1e-4.

**Rationale**: After SG smoothing, many chain vertices drift from their grid-injected positions by 1e-5 to 1e-4. At 1e-6, these are treated as separate vertices and sit very close to grid corners, creating thin triangles. At 1e-4, they merge with the grid vertices, and the chain edges become grid edges — no splitting needed.

**Mathematical basis**: A grid cell has width ~1/685 ≈ 1.46e-3. A merge threshold of 1e-4 is ~7% of cell width, which is acceptable positional error for feature representation. The 3D positional error at the print surface is: `1e-4 × 2πR ≈ 0.006mm` for a 10mm radius pot — far below FDM resolution.

**Trade-off**: Slightly less precise feature positioning in exchange for many fewer chain cells that need splitting.

**Files affected**: `OuterWallTessellator.ts`, one constant change.

**Assumption 7 (for Verifier)**: 1e-4 merge threshold doesn't degrade visual feature sharpness. The SG smoothing already moved the chain vertex by more than 1e-4 from its original detected position, so merging back to the nearest grid column is within the smoothing error budget.

---

## Proposal 3: Seam-Aware Cell Handling (Necessary Detail)

**Idea**: For cells at the seam boundary (U ≈ 0 and U ≈ 1), skip cell-local splitting if the chain edge's raw ΔU exceeds `SEAM_THRESHOLD`. The existing seam skip logic (`uSpan > SEAM_GUARD`) handles seam-spanning cells. Chain edges crossing the seam are already excluded from `chainEdges` by the `du > SEAM_THRESHOLD` filter at [OWT line 553](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L553).

**Mechanism**: No new code needed — the existing seam filters in chain edge recording prevent seam-crossing chain edges from entering `cellChainMap`. Cells near the seam that have no chain edges get standard quad splits.

**Assumption 8 (for Verifier)**: The existing seam edge exclusion (`SEAM_THRESHOLD = 0.4`) correctly prevents all seam-crossing chain edges from being registered. No chain edge with `|Δu| > 0.4` should enter `cellChainMap`.

---

## Recommended Approach

**Implement Proposal 1 + Proposal 2 + Proposal 3** as a single R34 change.

Priority order:
1. Build `cellChainMap` (data structure)
2. Implement `sweepQuad()` (reusable primitive)
3. Implement `constrainedSweepCell()` (partition + sweep)
4. Handle cross-column edges (intersection vertices)
5. Replace the main cell loop
6. Delete companion system, CDT strip system, ChainStripTriangulator.ts
7. Coarsen batch2Remap threshold to 1e-4
8. Clean up imports, remove cdt2d dependency

---

## Open Questions (For Verifier)

1. **Batch2Remap ordering**: When `sweepQuad` processes a sub-quad, is it possible for `bot` and `top` to have inconsistent vertex orderings (e.g., a batch2Remap'd vertex at a different U than expected)? The bot/top arrays are built from `cellChainMap` which uses `cv.u` — but batch2Remap'd vertices use the grid vertex's U. Could these differ?

2. **Chain vertex at cell corner vs edge**: If a chain vertex's U equals `unionU[c]` exactly (within floating point), it's a grid corner vertex after batch2Remap. But if it equals `unionU[c+1]`, it's the RIGHT corner of cell c and the LEFT corner of cell c+1. Is it assigned to cell c (via `bsearchFloor`) or cell c+1? `bsearchFloor(unionU, unionU[c+1])` returns `c+1`, so it would be assigned to cell c+1 as a left-corner vertex — which is correct because it's already the grid vertex at column c+1.

3. **emitTriCCW winding**: The standard cell uses cross-product for winding. Should `emitTriCCW` use the same approach, or can we rely on the sweep direction guaranteeing correct winding?

4. **Interaction with Batch 6 global dedup**: The cell-local system produces clean triangulations with exact vertex sharing at cell boundaries (grid vertices are shared). Does Batch 6 still find any duplicates to merge, or is it now a no-op?

5. **FeatureEdgeGraph compatibility**: The current code builds `chainVertexChainIds` at the end. Does the cell-local approach produce the same vertex indices for chain vertices, ensuring FeatureEdgeGraph still works?

6. **Cross-column edge count**: How many cross-column edges does a typical pot have? If it's >100, the intersection vertex creation needs to be efficiently batched. If it's <10, inline creation is fine.

---

## Files Referenced in This Proposal

| File | Role |
|------|------|
| [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts) | Main mesh builder — bulk of changes |
| [ChainStripTriangulator.ts](../../src/renderers/webgpu/parametric/ChainStripTriangulator.ts) | CDT/sweep strategies — DELETE entirely |
| [GridBuilder.ts](../../src/renderers/webgpu/parametric/GridBuilder.ts) | Feature column injection — no changes |
| [ChainLinker.ts](../../src/renderers/webgpu/parametric/ChainLinker.ts) | SG smoothing — no changes |
| [ParametricExportComputer.ts](../../src/renderers/webgpu/parametric/ParametricExportComputer.ts) | Pipeline orchestrator — remove ChainStripConfig references |
