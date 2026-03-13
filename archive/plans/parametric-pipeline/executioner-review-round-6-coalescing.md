# Executioner Review — Round 6 Edge-Local Grid/Chain Vertex Coalescing
Date: 2026-03-10

## Verdict: FEASIBLE WITH NOTES

The converged plan is implementable. Estimated **80-100 LOC** net new code, confined to `OuterWallTessellator.ts`. Complexity **2.5 / 5**. One architectural improvement is proposed for the T-junction fix that reduces risk and LOC.

---

## Feasibility Assessment

### The plan is sound
The coalescing mechanism is geometrically correct and surgically targeted. Dropping near-coincident grid vertices from chain/super-cell edge arrays before sweep eliminates pin triangles at the source. The implementation has clear insertion points, and the `sweepQuad`/`constrainedSweepCell` functions require zero modification — only their inputs change.

### Simpler T-junction fix than proposed
The Verifier's C5 mandates that T-junctions be eliminated when a grid vertex is dropped. The converged plan proposes a "horizontal BPP" — pre-computing a map and modifying `emitStandardCell`/`emitSplitCell` to consult it. **I propose a simpler approach: post-processing index buffer replacement.**

**Why it's simpler**:
- The codebase already has two precedents: `batch2Remap` (R52, disabled) and `batch6Remap` both perform post-emission index buffer scans with vertex substitution.
- No pre-computation phase needed. No modifications to `emitStandardCell` or `emitSplitCell`.
- Automatically handles ALL T-junctions including cross-band boundaries where emission order prevents pre-computation.

**Why pre-computation has an ordering problem**:
- The main emission loop iterates `band=0..totalBands-1`, emitting all cells in band b before band b+1.
- A super-cell at band b's bottom edge shares vertices with band b-1's top edge. Band b-1 is already emitted.
- Pre-computation would require duplicating the entire edge-building logic from `emitSuperCell` in a separate pre-pass, which is fragile and maintenance-heavy.

**The post-processing approach** (6 LOC insertion after all cells emitted, before batch6):
```typescript
// R55: Replace coalesced grid vertex references with surviving chain vertices
if (coalesceMap.size > 0) {
    for (let i = 0; i < indexBuf.length; i++) {
        const mapped = coalesceMap.get(indexBuf[i]);
        if (mapped !== undefined) indexBuf[i] = mapped;
    }
    for (let i = 0; i < fanDiagEdges.length; i++) {
        const [v0, v1] = fanDiagEdges[i];
        fanDiagEdges[i] = [coalesceMap.get(v0) ?? v0, coalesceMap.get(v1) ?? v1];
    }
}
```

**Why this is geometrically safe**: The coalesced grid vertex and surviving chain vertex are within 0.0006 U ≈ 0.15mm. Replacing the grid vertex index globally means standard cells now reference the chain vertex position instead — a displacement below printer resolution, and geometrically more precise (chain vertices are GPU re-snapped).

---

## File Impact Analysis

### Single file: `OuterWallTessellator.ts` (~2250 lines)

| Location | Change | LOC |
|---|---|---|
| Constants (after L224) | Add `GRID_CHAIN_COALESCE_RADIUS = 0.0006` | 3 |
| New helper (after `sweepQuad`, ~L310) | `coalesceNearGridChain()` function | 25 |
| `emitSuperCell` (after L1912 `dedupEdge`) | Apply coalescing to `finalBot`/`finalTop` | 6 |
| `emitSuperCell` R37 loop (L1940-1960) | Apply coalescing to each `subBot`/`subTop` | 4 |
| `emitChainCell` (after L1679 edge building) | Apply coalescing to `botEdge`/`topEdge` | 4 |
| `emitChainSplitCell` (L1843 sub-band loop) | Apply coalescing to each boundary | 4 |
| Post-emission (~L2043, before batch6) | T-junction fix: index buffer + fanDiagEdges remap | 10 |
| Post-emission | Diagnostics logging | 8 |
| Throughout | R55 documentation blocks | 12 |
| **Total** | | **~80** |

No changes to: `ParametricExportComputer.ts`, `ChainStripOptimizer.ts`, `GridBuilder.ts`, `MeshValidator.ts`, `ChainStripTriangulator.ts`, or any test files.

---

## Risk Zones

### R1 [LOW]: Phantom row vertex classification
R37 phantom rows contain two vertex types sharing the `vertexIndices` array:
- **Chain anchor** vertices (in `phantomChainAnchorSet`) — functionally chain-like, must survive
- **Column boundary** vertices (not in set) — functionally grid-like, candidates for coalescing

The `coalesceNearGridChain` function cannot use the simple `idx < gridVertexCount` test. It must accept `phantomChainAnchorSet` to classify phantom vertices. This is a 2-line parameter addition but is the most subtle correctness point.

**Proposed vertex classification**:
```typescript
const isGridLike = (idx: number): boolean =>
    idx < gridVertexCount || (idx >= totalVertexCount && !phantomChainAnchorSet.has(idx));
const isChainLike = (idx: number): boolean =>
    (idx >= gridVertexCount && idx < totalVertexCount) || phantomChainAnchorSet.has(idx);
```

### R2 [LOW]: Multi-chain coalescing conflicts
Two chain vertices from different chains could be near the same grid vertex. The coalescing function must pick the NEAREST chain vertex, not the first found. Since edges are sorted by U and chains typically don't overlap in U at the same row, conflicts are rare. The function should track nearest distance.

### R3 [LOW]: Corner vertex coalescing scope
R36.1 explicitly excludes super-cell corner vertices (at `colStart` and `colEnd+1`) from `chainAdjacentGridVerts`. The Generator proposes coalescing only intermediate vertices; the Verifier (C10) recommends including corners. 

**Recommendation**: Include corners in the coalescing. The `coalesceNearGridChain` function operates on the full sorted edge array and doesn't distinguish corners from intermediates. Corner coalescing creates T-junctions that the post-processing fix handles automatically. The geometric displacement (<0.0006 U) is negligible.

### R4 [MEDIUM]: Post-processing remap interaction with downstream consumers
After the index buffer remap, several downstream systems process the result:
- **Batch6 dedup**: Operates on `indices` (Uint32Array copy of indexBuf). Index buffer is remapped BEFORE batch6 creates its copy. ✅ Safe — coalesced grid vertices no longer appear in indices.
- **Chain edge verification**: Scans `meshEdgeSet` built from `indexBuf`. Must happen AFTER the remap. ✅ Current code builds `meshEdgeSet` after batch6, which is after our remap.
- **`chainAdjacentGridVerts`**: Built during `emitSuperCell`. Coalesced grid vertices will be in this set but won't appear in any triangle. Harmless — the set is used for optimizer visibility, not mesh topology.
- **`chainStripTriSet`** (in ChainStripOptimizer): Identifies triangles for quality measurement. Triangles now reference chain vertices instead of coalesced grid vertices. Quality measurement is MORE accurate because it sees the actual vertex used.

### R5 [LOW]: R52 compatibility
Verified clean. The R52 invariant states: *"Chain vertices and grid vertices NEVER merge, average, snap, or move toward each other."* Our approach:
- Chain vertices survive at their exact positions ✅
- Grid vertices are DROPPED from edge arrays, not moved ✅
- The post-processing remap replaces grid vertex REFERENCES with chain vertex references — the grid vertex DATA in the vertex buffer is untouched ✅

This is a pragmatic retreat from "both vertices coexist" to "the less-precise vertex is omitted." Add an R55 documentation block explaining this relationship.

### R6 [LOW]: Performance impact
The coalescing function is O(n²) per edge, where n = edge length (typically 5-20 vertices for a super-cell spanning 2-5 columns). Total edges processed: ~2× super-cell count (bot+top) + R37 sub-bands. On a typical export (300 bands, ~100 super-cells), this is ~500 coalescing calls × ~15 vertices = negligible. The post-processing remap is O(indexBuf.length) = O(400k), also negligible.

---

## Unstated Dependencies

### D1: `phantomChainAnchorSet` must be visible in emit functions
This set is already in scope — it's declared at OWT L1170 in the same function body as the emit functions. ✅

### D2: `totalVertexCount` must be stable during emission
Used for phantom vertex classification (`idx >= totalVertexCount`). It's computed at L784 and doesn't change during emission. ✅ But `nextPhantomIdx` does change (emitChainSplitCell creates phantom vertices). Phantom vertices created during emission will have indices >= totalVertexCount but might not be in `phantomChainAnchorSet`. The `isChainLike` check handles this correctly — only `phantomChainAnchorSet` members are chain-like.

### D3: The `coalesceMap` must be declared before the main emission loop
It's a simple `new Map<number, number>()` at the same scope as `indexBuf`, `quadMap`, etc. No issue.

### D4: Degenerate triangle collapse
When a grid vertex is coalesced and the post-processing replaces it in standard-cell triangles, some triangles might become degenerate (all three vertices coincide or two coincide). This is already handled by batch6's degenerate collapse at OWT L2100. However, with COALESCE_RADIUS=0.0006, the vertices are close but not identical, so degenerate triangles are unlikely. Edge case: if batch6 subsequently merges the chain vertex with a nearby phantom vertex (same-type dedup), then degeneracy could occur. Batch6 already handles this.

---

## Implementation Sequence

### Step 1: Add constant and vertex classification helpers
```typescript
/** R55: Drop grid vertices within this U-distance of a chain vertex on shared edges. */
const GRID_CHAIN_COALESCE_RADIUS = 0.0006;
```

Two closures (capturing `gridVertexCount`, `totalVertexCount`, `phantomChainAnchorSet`):
```typescript
const isGridLike = (idx: number): boolean =>
    idx < gridVertexCount || (idx >= totalVertexCount && !phantomChainAnchorSet.has(idx));
const isChainLike = (idx: number): boolean =>
    (idx >= gridVertexCount && idx < totalVertexCount) || phantomChainAnchorSet.has(idx);
```

### Step 2: Add `coalesceNearGridChain` function
```typescript
function coalesceNearGridChain(
    edge: number[],
    verts: Float32Array,
    isGridLikeFn: (idx: number) => boolean,
    isChainLikeFn: (idx: number) => boolean,
    radius: number,
    coalMap: Map<number, number>,
): number[] {
    const result: number[] = [];
    for (let i = 0; i < edge.length; i++) {
        const v = edge[i];
        if (!isGridLikeFn(v)) { result.push(v); continue; }
        const vU = verts[v * 3];
        let nearestChain = -1;
        let nearestDist = Infinity;
        for (let j = 0; j < edge.length; j++) {
            if (i === j) continue;
            const cv = edge[j];
            if (!isChainLikeFn(cv)) continue;
            const dist = Math.abs(verts[cv * 3] - vU);
            if (dist < radius && dist < nearestDist) {
                nearestChain = cv;
                nearestDist = dist;
            }
        }
        if (nearestChain >= 0) {
            coalMap.set(v, nearestChain);
            // Do NOT push v — it's coalesced away
        } else {
            result.push(v);
        }
    }
    return result;
}
```

This is a module-level pure function (same as `sweepQuad`, `constrainedSweepCell`).

### Step 3: Apply in `emitSuperCell`
After `const finalBot = dedupEdge(botEdge)` / `const finalTop = dedupEdge(topEdge)` (L1912-1913):
```typescript
const coalBot = coalesceNearGridChain(finalBot, vertices, isGridLike, isChainLike, GRID_CHAIN_COALESCE_RADIUS, coalesceMap);
const coalTop = coalesceNearGridChain(finalTop, vertices, isGridLike, isChainLike, GRID_CHAIN_COALESCE_RADIUS, coalesceMap);
```
Use `coalBot`/`coalTop` instead of `finalBot`/`finalTop` in:
- R36.1 chainAdjacentGridVerts loop (needs adjustment: skip coalesced vertices, OR keep as-is since harmless)
- A2 degenerate guard
- R37 boundaries[0] and boundaries[last]
- Non-R37 path: `sweepQuad`/`constrainedSweepCell` calls

In R37 sub-band loop, after constructing boundaries but before sweep calls:
```typescript
for (let i = 0; i < boundaries.length; i++) {
    boundaries[i] = coalesceNearGridChain(boundaries[i], vertices, isGridLike, isChainLike, GRID_CHAIN_COALESCE_RADIUS, coalesceMap);
}
```

### Step 4: Apply in `emitChainCell`
After building `botEdge` and `topEdge` (L1675), before the sweep call:
```typescript
const coalBot = coalesceNearGridChain(botEdge, vertices, isGridLike, isChainLike, GRID_CHAIN_COALESCE_RADIUS, coalesceMap);
const coalTop = coalesceNearGridChain(topEdge, vertices, isGridLike, isChainLike, GRID_CHAIN_COALESCE_RADIUS, coalesceMap);
```
Use `coalBot`/`coalTop` in the sweep/constrainedSweep calls.

### Step 5: Apply in `emitChainSplitCell`
In the sub-band loop (L1843), after sorting each boundary:
```typescript
const coalBot = coalesceNearGridChain(subBot, vertices, isGridLike, isChainLike, GRID_CHAIN_COALESCE_RADIUS, coalesceMap);
const coalTop = coalesceNearGridChain(subTop, vertices, isGridLike, isChainLike, GRID_CHAIN_COALESCE_RADIUS, coalesceMap);
```

### Step 6: Post-processing T-junction fix
Insert after the main emission loop (after L2041, before batch6 dedup):
```typescript
// ── R55: Coalesced vertex remap — T-junction elimination ──
// Grid vertices dropped from chain/super-cell edges may still be referenced
// by adjacent standard cells. Replace all references with the surviving
// chain vertex to maintain watertight mesh topology.
if (coalesceMap.size > 0) {
    let coalesceRemapCount = 0;
    for (let i = 0; i < indexBuf.length; i++) {
        const mapped = coalesceMap.get(indexBuf[i]);
        if (mapped !== undefined) { indexBuf[i] = mapped; coalesceRemapCount++; }
    }
    for (let i = 0; i < fanDiagEdges.length; i++) {
        const [v0, v1] = fanDiagEdges[i];
        fanDiagEdges[i] = [coalesceMap.get(v0) ?? v0, coalesceMap.get(v1) ?? v1];
    }
    console.log(`[CDT] R55 coalescing: ${coalesceMap.size} grid vertices coalesced, ${coalesceRemapCount} index references remapped`);
}
```

### Step 7: Documentation
Add R55 comment block at each insertion point:
```typescript
// ╔══════════════════════════════════════════════════════════════════════╗
// ║ R55 GRID/CHAIN VERTEX COALESCING                                    ║
// ║ Near-coincident grid+chain vertex pairs on shared edges create pin  ║
// ║ triangles with extreme aspect ratios (up to 2364:1). CDF clustering ║
// ║ places grid columns near chain vertices; R52 prevents merging.      ║
// ║ This coalescing drops the grid vertex (less precise) and keeps the  ║
// ║ chain vertex (GPU re-snapped). Post-processing remaps standard cell ║
// ║ references to the surviving chain vertex for T-junction elimination. ║
// ║ COALESCE_RADIUS = 0.0006 = mathematical 4:1 aspect violation bound. ║
// ╚══════════════════════════════════════════════════════════════════════╝
```

---

## Questions for Generator/Verifier

### Q1: `chainAdjacentGridVerts` — should coalesced vertices be removed?
Currently, `emitSuperCell` marks intermediate grid vertices in `chainAdjacentGridVerts` at OWT L1921-1924. If a grid vertex is coalesced, it no longer appears in any triangle. Should it be removed from `chainAdjacentGridVerts`? 

**My assessment**: Leave it. The set is used by ChainStripOptimizer for visibility — having a stale entry is harmless. The optimizer checks triangle membership (via `chainStripTriSet`), and coalesced vertices won't be in any triangle, so the entry is simply ignored.

### Q2: `constrainedSweepCell` partition lookup after coalescing
When chain edges reference bot/top edge vertices, `constrainedSweepCell` does `bot.indexOf(v0)` to find partition positions. If a grid vertex near a chain edge endpoint was coalesced from the edge, the chain edge endpoint (a chain vertex) is still present. No impact — the chain vertex was never the coalesced one. But if a chain edge endpoint is a companion vertex near a grid vertex... actually, chain edges always connect chain vertices, never grid vertices. No issue.

### Q3: Diagnostic pass sequencing
The Verifier (C7) mandates a diagnostic pass BEFORE implementation to validate the 80% estimate. I recommend implementing the diagnostic as part of the implementation PR, gated behind an existing `console.log` flag, rather than as a separate PR. The diagnostic would partition `computeChainStrip3DQuality` violations by cell type — this requires reading `quadMap` and `cellChainMap`, which are already available in ChainStripOptimizer. This adds ~20 LOC to ChainStripOptimizer but is orthogonal to the coalescing change.

---

## Blockers

**None identified.** The code structure supports this change cleanly. Key evidence:
1. The R53 BPP precedent establishes the pattern of auxiliary maps + emission-time consultation
2. The batch2Remap/batch6Remap precedent establishes post-emission index buffer remapping
3. `phantomChainAnchorSet` is already in scope for vertex classification
4. The `coalesceNearGridChain` function is a pure, testable helper that doesn't depend on any global state

---

## Summary Table

| Aspect | Assessment |
|---|---|
| **Verdict** | FEASIBLE WITH NOTES |
| **LOC estimate** | 80-100 net new (single file) |
| **Complexity** | 2.5 / 5 |
| **Files changed** | 1 (OuterWallTessellator.ts) |
| **Functions modified** | 3 (emitSuperCell, emitChainCell, emitChainSplitCell) |
| **Functions added** | 1 (coalesceNearGridChain) |
| **Highest risk** | R4: Post-processing remap interaction with batch6 and edge verification (LOW-MEDIUM) |
| **Key improvement over plan** | Post-processing index remap instead of pre-computed horizontal BPP |
| **R52 safe** | Yes — chain vertices never move; grid vertices dropped, not merged |
| **Implementation time** | Single atomic changeset |
