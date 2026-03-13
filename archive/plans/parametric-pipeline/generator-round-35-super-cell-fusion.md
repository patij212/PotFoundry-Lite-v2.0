# Generator Round 35 — Super-Cell Fusion for Cross-Column Chain Edge Enforcement

Date: 2026-03-07

## Problem Statement

R34's cell-local quad splitting silently drops **cross-column chain edges**. When a chain edge connects `(row j, col A)` to `(row j+1, col B)` where `A ≠ B`, the current code creates intersection vertices at column boundaries with intermediate T values. These intersection vertices sit between `tBot` and `tTop` — they are NOT on the cell's bottom or top edge. `constrainedSweepCell` uses `bot.indexOf()` / `top.indexOf()` to locate endpoints, gets `-1`, and silently drops the edge.

**Impact**: 1811 missing chain edges (1772 crossRow), 252 non-manifold edges, 20.1% sliver rate, validation FAIL.

## Root Cause Analysis

The intersection vertex approach ([OWT lines 911–956](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L911)) fails because:

1. A cross-column chain edge connects `v_bot` at `(row j, u_bot)` to `v_top` at `(row j+1, u_top)`, where `bsearchFloor(u_bot) ≠ bsearchFloor(u_top)`.
2. The code creates intersection vertices at column boundaries: `uBoundary = unionU[c]`, `tCross = tBot + frac * (tTop - tBot)`. So `tCross` is intermediate — not `tBot` or `tTop`.
3. Sub-edges `[v_bot, intersectionVtx]` and `[intersectionVtx, v_top]` are pushed into each cell's `chainEdges`.
4. But the intersection vertex is never added to `botChainVerts` or `topChainVerts` because it's not on a row boundary.
5. `constrainedSweepCell` builds `botEdge = [BL, ...botChainVerts, BR]` and `topEdge = [TL, ...topChainVerts, TR]`. The intersection vertex is in neither array.
6. `bot.indexOf(intersectionVtx)` → `-1`. Edge dropped.

The approach is fundamentally wrong: `constrainedSweepCell` partitions a cell using edges between its bottom and top edges. An intersection vertex at intermediate T doesn't fit that model.

## Proposal: Super-Cell Fusion

### Idea

Instead of splitting a cross-column chain edge into per-cell sub-edges with artificial intersection vertices, **fuse the cells** the edge crosses into a single wider "super-cell". Both chain endpoints are at proper row boundaries (`tBot` and `tTop`), so they naturally appear in the super-cell's bottom and top edge arrays. `constrainedSweepCell` finds them and enforces the edge.

### Mechanism

**Phase 1 — Identify fusion requirements** (replaces intersection vertex creation at [line 911–956](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L911)):

```
For each cross-column chain edge (gc0 ≠ gc1):
    cMin = min(gc0, gc1)
    cMax = max(gc0, gc1)
    Record fusion request: { band, cMin, cMax }
```

**Phase 2 — Merge overlapping fusion requests** per band:

```
For each band:
    Sort fusion requests by cMin
    Merge overlapping/adjacent intervals:
        if request.cMin ≤ prev.cMax + 1:
            prev.cMax = max(prev.cMax, request.cMax)
        else:
            emit prev, start new interval
```

This produces a set of `SuperCell` intervals per band. Most will be 2 columns wide (micro-rows limit column crosses to ~1).

**Phase 3 — Modified emission loop** (replaces [lines 980–1013](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L980)):

```
For each band:
    Build superCellSet: set of columns consumed by super-cells in this band
    For c = 0 to cellsPerRow-1:
        if c is start of a super-cell:
            emitSuperCell(band, colStart, colEnd)
            c = colEnd  // skip consumed columns (loop does c++)
        else if c is interior of a super-cell:
            skip (already emitted)
        else:
            normal cell emission (standard or chain-cell)
```

### Mathematical Basis

Both chain endpoints of a cross-column edge are at proper row boundaries (rowIdx `j` and `j+1`). They got assigned to cells via `bsearchFloor(unionU, cv.u)` which gives the column of the cell they're IN. The bottom endpoint at row `j` is a `botChainVert` of cell `(j, gc0)`, and the top endpoint at row `j+1` is a `topChainVert` of cell `(j, gc1)`. In the fused super-cell spanning `[cMin, cMax]`, both vertices appear in the super-cell's bot/top edge arrays, exactly where `constrainedSweepCell` expects them.

The monotone sweep (`sweepQuad`) works on any U-monotone polygon regardless of width. A 2-column-wide super-cell is just a wider quad — still U-monotone. `constrainedSweepCell` partitions it into sub-quads at each chain edge, and each sub-quad is also U-monotone. Triangle quality is preserved.

### Files Affected

**Only** [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts), sections 3.7 and 4.

### Exact Code Changes

#### 1. New data structure (add near line 215)

```typescript
/** Super-cell: merged cell spanning multiple columns for cross-column chain edges. */
interface SuperCell {
    band: number;
    colStart: number;  // leftmost column (inclusive)
    colEnd: number;    // rightmost column (inclusive)
}
```

#### 2. Replace cross-column intersection logic (lines 911–956)

Delete the entire `else` branch that creates intersection vertices. Replace with:

```typescript
} else {
    // Cross-column edge: record fusion request (super-cell)
    crossCellEdgeCount++;
    const cMin = Math.min(gc0, gc1);
    const cMax = Math.max(gc0, gc1);

    // Register the chain edge in ALL cells it crosses
    for (let c = cMin; c <= cMax; c++) {
        const key = cellKey(band, c);
        let info = cellChainMap.get(key);
        if (!info) {
            info = { botChainVerts: [], topChainVerts: [], chainEdges: [] };
            cellChainMap.set(key, info);
        }
        info.chainEdges.push([v0, v1]);
    }

    // Record fusion request
    fusionRequests.push({ band, colStart: cMin, colEnd: cMax });
}
```

Where `fusionRequests` is declared before the loop:

```typescript
const fusionRequests: SuperCell[] = [];
```

#### 3. Super-cell interval merge (add after section 3.7, before section 4)

```typescript
// ── 3.8. Merge fusion requests into super-cells ──
// Group by band, sort by colStart, merge overlapping/adjacent intervals
const superCellMap = new Map<number, SuperCell[]>(); // band → merged intervals

if (fusionRequests.length > 0) {
    // Group by band
    const byBand = new Map<number, SuperCell[]>();
    for (const req of fusionRequests) {
        let list = byBand.get(req.band);
        if (!list) { list = []; byBand.set(req.band, list); }
        list.push(req);
    }

    for (const [band, reqs] of byBand) {
        reqs.sort((a, b) => a.colStart - b.colStart);
        const merged: SuperCell[] = [];
        let cur = { ...reqs[0] };
        for (let i = 1; i < reqs.length; i++) {
            if (reqs[i].colStart <= cur.colEnd + 1) {
                cur.colEnd = Math.max(cur.colEnd, reqs[i].colEnd);
            } else {
                merged.push(cur);
                cur = { ...reqs[i] };
            }
        }
        merged.push(cur);
        superCellMap.set(band, merged);
    }
}

// Build quick lookup: (band, col) → true if column is part of a super-cell
const superCellCols = new Set<number>(); // stores cellKey(band, col)
const superCellStarts = new Map<number, SuperCell>(); // cellKey(band, colStart) → SuperCell
for (const [band, cells] of superCellMap) {
    for (const sc of cells) {
        // Seam guard: if ANY constituent cell is seam-spanning, exclude it
        let hasSeam = false;
        for (let c = sc.colStart; c <= sc.colEnd; c++) {
            const uSpan = unionU[c + 1] - unionU[c];
            if (uSpan > SEAM_GUARD || uSpan < -SEAM_GUARD) {
                hasSeam = true;
                break;
            }
        }
        if (hasSeam) continue; // fall back to per-cell emission (edges will be dropped)

        superCellStarts.set(cellKey(band, sc.colStart), sc);
        for (let c = sc.colStart; c <= sc.colEnd; c++) {
            superCellCols.add(cellKey(band, c));
        }
    }
}
```

#### 4. New `emitSuperCell` function (add after `emitChainCell`)

```typescript
/** Emit a super-cell spanning multiple columns for cross-column chain edge enforcement. */
const emitSuperCell = (band: number, colStart: number, colEnd: number): void => {
    // Mark all constituent cells in quadMap
    for (let c = colStart; c <= colEnd; c++) {
        quadMap[band * cellsPerRow + c] = -1;
    }
    chainCellCount += (colEnd - colStart + 1);

    // Grid corner vertices: leftmost BL/TL and rightmost BR/TR
    const BL = band * numU + colStart;
    const BR = band * numU + (colEnd + 1);
    const TL = (band + 1) * numU + colStart;
    const TR = (band + 1) * numU + (colEnd + 1);

    // Build bottom edge: [BL, grid vertices at intermediate columns, chain verts, BR]
    const botEdge: number[] = [BL];
    for (let c = colStart; c <= colEnd; c++) {
        // Add intermediate grid column vertex (right edge of cell c = left edge of c+1)
        if (c < colEnd) {
            botEdge.push(band * numU + (c + 1));
        }
        // Add chain vertices on bottom edge of cell (band, c)
        const info = cellChainMap.get(cellKey(band, c));
        if (info) {
            for (const cvIdx of info.botChainVerts) {
                botEdge.push(cvIdx);
            }
        }
    }
    botEdge.push(BR);
    // Sort by U (grid + chain verts are interleaved)
    botEdge.sort((a, b) => vertices[a * 3] - vertices[b * 3]);

    // Build top edge: [TL, grid vertices at intermediate columns, chain verts, TR]
    const topEdge: number[] = [TL];
    for (let c = colStart; c <= colEnd; c++) {
        if (c < colEnd) {
            topEdge.push((band + 1) * numU + (c + 1));
        }
        const info = cellChainMap.get(cellKey(band, c));
        if (info) {
            for (const cvIdx of info.topChainVerts) {
                topEdge.push(cvIdx);
            }
        }
    }
    topEdge.push(TR);
    topEdge.sort((a, b) => vertices[a * 3] - vertices[b * 3]);

    // Deduplicate (batch2Remap may cause grid vertex = chain vertex)
    const dedupEdge = (edge: number[]): number[] => {
        const seen = new Set<number>();
        return edge.filter(v => { if (seen.has(v)) return false; seen.add(v); return true; });
    };
    const finalBot = dedupEdge(botEdge);
    const finalTop = dedupEdge(topEdge);

    // Collect ALL chain edges from constituent cells
    const allEdges: Array<[number, number]> = [];
    for (let c = colStart; c <= colEnd; c++) {
        const info = cellChainMap.get(cellKey(band, c));
        if (info) {
            for (const edge of info.chainEdges) {
                allEdges.push(edge);
            }
        }
    }
    // Deduplicate edges (cross-column edges registered in multiple cells)
    const edgeSet = new Set<string>();
    const uniqueEdges: Array<[number, number]> = [];
    for (const [v0, v1] of allEdges) {
        const k = v0 < v1 ? `${v0}-${v1}` : `${v1}-${v0}`;
        if (!edgeSet.has(k)) {
            edgeSet.add(k);
            uniqueEdges.push([v0, v1]);
        }
    }

    if (uniqueEdges.length === 0) {
        sweepQuad(indexBuf, finalBot, finalTop, vertices);
    } else {
        constrainedSweepCell(indexBuf, finalBot, finalTop, uniqueEdges, vertices);
    }
};
```

#### 5. Modified main emission loop (replace lines 980–1013)

```typescript
for (let band = 0; band < totalBands; band++) {
    for (let c = 0; c < cellsPerRow; c++) {
        const key = cellKey(band, c);

        // Check if this cell is part of a super-cell
        if (superCellCols.has(key)) {
            const sc = superCellStarts.get(key);
            if (sc) {
                // This is the START of a super-cell — emit it
                emitSuperCell(band, sc.colStart, sc.colEnd);
                c = sc.colEnd; // skip to end (loop does c++)
            }
            // else: interior column of a super-cell, already emitted — skip
            // But we still need degenerate placeholder triangles for quadMap indexing consistency
            // Actually no — quadMap is set to -1 in emitSuperCell, and indexBuf is unordered.
            // We just skip.
            continue;
        }

        const uSpan = unionU[c + 1] - unionU[c];
        if (uSpan > SEAM_GUARD || uSpan < -SEAM_GUARD) {
            indexBuf.push(0, 0, 0, 0, 0, 0);
            quadMap[band * cellsPerRow + c] = -1;
            seamSkipCount++;
            continue;
        }

        const info = cellChainMap.get(key);
        if (!info) {
            emitStandardCell(band, c);
        } else {
            emitChainCell(band, c, info);
        }
    }
}
```

#### 6. Remove intersection vertex buffer reservation

At [line 732–733](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L732):

```typescript
// BEFORE:
const maxCrossColumnVertices = chainEdges.length * 3;
const vertices = new Float32Array((totalVertexCount + maxCrossColumnVertices) * 3);

// AFTER:
const vertices = new Float32Array(totalVertexCount * 3);
```

And remove the `nextIntersectionIdx` variable (no longer incremented). Update the final vertex trim:

```typescript
// BEFORE:
const actualVertCount = nextIntersectionIdx;
const finalVertices = actualVertCount * 3 < vertices.length
    ? vertices.slice(0, actualVertCount * 3)
    : vertices;

// AFTER:
const finalVertices = vertices;
```

### What to Delete

1. **Lines 911–956**: Entire intersection vertex creation branch (the `else` in cross-column edge handling)
2. **Line 732**: `maxCrossColumnVertices` calculation
3. **Line 869**: `let nextIntersectionIdx = totalVertexCount;` declaration
4. **Lines 1237–1240**: `nextIntersectionIdx`-based vertex trimming

### Edge Cases

| Case | Handling |
|------|----------|
| **Super-cell spans seam** | Seam guard check excludes it. Falls back to per-cell (edge dropped — same as current behavior). |
| **3+ column cross** | Rare (micro-rows limit to ~1 column gap). Interval merge handles naturally — super-cell spans 3+ columns. |
| **Overlapping fusion requests in same band** | Interval merge collapses them into one wider super-cell. |
| **batch2Remap'd endpoints** | Remapped chain vertices become grid vertices. They're already grid corners in the super-cell's edge arrays. `constrainedSweepCell` finds them by grid index. |
| **Same-column chain edges in super-cell constituent** | Collected alongside cross-column edges. `constrainedSweepCell` handles mixed edges. |
| **No cross-column edges in a band** | `superCellMap` is empty for that band. All cells emit normally. Zero overhead. |
| **Chain vertex at a grid column boundary** | Already handled by `batch2Remap` (section 3.5). |

### Expected Impact on Quality Metrics

| Metric | Current (R34) | Expected (R35) |
|--------|---------------|-----------------|
| Missing chain edges (crossRow) | 1772 | **~0** (all cross-column edges now enforced) |
| Missing chain edges (total) | 1811 | **~39** (sameRow remainder, if any) |
| Non-manifold edges | 252 | **< 50** (most from dropped cross-column edges) |
| Sliver rate | 20.1% | **< 10%** (fewer degenerate triangles from dropped edges) |
| min_angle | 1.4° | **> 5°** (proper cell partitioning) |

### Trade-offs

- **Slight increase in code complexity**: `emitSuperCell` is ~60 lines, fusion merge is ~30 lines. Net addition ~100 lines, deletion ~50 lines.
- **No performance impact**: Super-cell construction is O(crossColumnEdges) which is small. Super-cell emission is the same cost as emitting constituent cells individually.
- **Wider cells produce more triangles per sweep**: A 2-column super-cell has ~4–6 bottom edge vertices and ~4–6 top edge vertices, producing ~8–12 triangles. The same area as 2 separate cells would produce 4 triangles (standard) + 4–8 (chain cell) = 8–12 triangles. Equal.

## Assumptions for Verifier

1. **Both endpoints of a cross-column chain edge are at row boundaries** (tBot or tTop). This is guaranteed by the interpolation pass at [lines 651–700](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L651) which ensures every chain edge spans exactly one row band, and chain vertices are placed AT row positions (t = activeTPositions[rowIdx]).

2. **Micro-rows limit column crosses to ~1 column width**. `insertMicroRowsForSteepCrossings` ([line 301](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L301)) inserts rows specifically to prevent >1 column crosses. So super-cells are typically 2 columns wide, not wider. Verify: can a chain edge still cross 2+ columns AFTER micro-row insertion?

3. **`constrainedSweepCell` works correctly on wider cells** with multiple grid vertices on bot/top edges. The function uses indexOf to find chain edge endpoints in the edge arrays and partitions into sub-quads. With intermediate grid vertices in the arrays, the sub-quads are narrower (1-column wide within the super-cell). Verify: does the partitioning produce correct sub-quads when bot[botPos] is an intermediate grid vertex?

4. **The sort-by-U deduplication of bot/top edge arrays preserves correctness**. Grid vertices and chain vertices are interleaved and sorted. Verify: if two vertices have identical U (chain vertex merged to grid column via batch2Remap), does the duplicate filtering maintain proper edge structure?

5. **Removing intersection vertex creation doesn't break anything else downstream**. The intersection vertices were only used in the cell-local emission (sections 3.7 and 4). Verify: no other code (batch6 dedup, chainEdges verification, FeatureEdgeGraph) references intersection vertex indices.

## Open Questions

1. Should super-cell fusion be logged separately from regular chain cells in the console output? (Probably yes — helps debug.)
2. Should we add a diagnostic counter for how many super-cells are created per export? (Low cost, high value.)
3. If the seam guard excludes a super-cell, should we attempt partial fusion of the non-seam columns? (Probably not — complexity vs. rarity trade-off.)
