# Phase 6: Anisotropic Edge Collapse + Fix Disabled Cleanup Passes

## Context

The anisotropic refinement pipeline (Phases 1–5) can only **add** triangles via splitting. It cannot **remove** them. When the initial mesh is over-tessellated in smooth regions (cylinder sections, flat bases), those regions waste triangles that could be allocated to high-curvature features. Additionally, two cleanup passes (`localEdgeFlip` and `smoothNewVertices`) were implemented but **disabled** due to bugs found during integration — these must be fixed as prerequisites.

**Goal:** Add edge collapse (QEM-scored vertex removal) so the refinement loop can both split AND collapse, achieving optimal triangle budget allocation. Fix the two disabled cleanup passes. Gate everything behind a new `edgeCollapseEnabled` feature flag.

## Review Findings Addressed

From the code review (Issues I1, I5):
- **I1:** Phases 3.1/3.2 (edge flip + vertex smoothing) implemented but disabled due to stale adjacency + seam UV bugs
- **I5:** `localEdgeFlip` stale adjacency after flips — needs incremental adjacency update

## Prerequisites: Fix Disabled Cleanup Passes

### Prereq A: Fix `localEdgeFlip()` — Stale Adjacency

**File:** `src/renderers/webgpu/parametric/AdaptiveRefinement.ts` (lines 895-970)

**Bug:** Adjacency map built once, then `indices` mutated during flip loop. After flipping edge (eA,eB)→(opp0,opp1), subsequent lookups find stale triangle offsets → triangles linking distant vertices.

**Fix:** Multi-pass approach — rebuild adjacency fresh at the start of each pass (2-3 passes max):

```typescript
function localEdgeFlip(
    indices: Uint32Array,
    positions: Float32Array,
    affectedVertices: Set<number>,
    featureGraph: FeatureEdgeGraph,
    outerIdxCount: number,
    maxPasses: number = 3,
): number {
    let totalFlips = 0;
    for (let pass = 0; pass < maxPasses; pass++) {
        const edgeAdj = buildEdgeAdjacency(indices, outerIdxCount);
        let passFlips = 0;
        // ... existing flip logic with fresh adjacency ...
        totalFlips += passFlips;
        if (passFlips === 0) break;
    }
    return totalFlips;
}
```

**Tests:** Flip dense mesh over multiple passes — verify no degenerate triangles created.

### Prereq B: Fix `smoothNewVertices()` — Seam UV Wrapping

**File:** `src/renderers/webgpu/parametric/AdaptiveRefinement.ts` (lines 994-1078)

**Bug:** Laplacian UV averaging at seam (u≈0, u≈1) computes arithmetic mean → midpoint near u=0.5 instead of u≈0/1.

**Fix:** Circular mean for U coordinate:

```typescript
function circularMeanU(neighborUs: number[]): number {
    let sinSum = 0, cosSum = 0;
    for (const u of neighborUs) {
        const angle = u * 2 * Math.PI;
        sinSum += Math.sin(angle);
        cosSum += Math.cos(angle);
    }
    let mean = Math.atan2(sinSum, cosSum) / (2 * Math.PI);
    if (mean < 0) mean += 1;
    return mean;
}
```

**Test:** Vertex at u=0.98 with neighbors at u=0.02 and u=0.96 → smooth to ≈0.987, not 0.65.

## Phase 6 Tasks

### Task 6.1: `EdgeCollapser` module — QEM data structures

**File:** Create `src/renderers/webgpu/parametric/EdgeCollapser.ts`

**QEM (Quadric Error Metric):** Per-vertex 4×4 symmetric matrix (10 unique floats) representing sum of squared distances to incident triangle planes. Stored as `Float64Array(vertexCount * 10)` for numerical stability.

**Types:**

```typescript
interface CollapseCandidate {
    edgeKey: string;
    vRemove: number;     // vertex to delete
    vKeep: number;       // vertex to keep (lower QEM error)
    cost: number;        // QEM collapse cost
    metricLength: number; // metric-weighted edge length
}

interface CollapseResult {
    positions: Float32Array;
    uvs: Float32Array;
    indices: Uint32Array;
    outerIdxCount: number;
    collapseCount: number;
    removedVertices: Set<number>;
}
```

**Min-heap:** Array-based binary min-heap keyed by collapse priority (~50 lines).

### Task 6.2: QEM initialization and scoring

**`initQuadrics(positions, indices, outerIdxCount) → Float64Array`**
- For each triangle: compute plane equation, form quadric Q_p = p·pᵀ, accumulate into vertex quadrics

**`computeCollapseCost(quadrics, positions, v0, v1) → { cost, vKeep, vRemove }`**
- Half-edge collapse: evaluate error at both vertex positions, keep the one with lower error
- No optimal vertex computation (pot vertices are GPU-snapped to analytic surface — moving off-surface is worse than keeping either endpoint)

**Metric-aware priority:**
- `priority = metricLength * (1 + cost / medianCost)`
- Edges shorter than `targetEdgeLength * 0.5` in metric space are over-sampled → collapse first

### Task 6.3: Collapse validity checks

Five checks, all O(1) or O(degree) per edge:

1. **Feature edge protection:** `isFeatureEdge(graph, v0, v1)` → skip
2. **Feature vertex protection:** Either vertex in `featureVertexSet` → skip (preserves chain topology)
3. **Seam safety:** Mixed seam/interior vertices → skip. Both seam → same side only
4. **Link condition:** Shared 1-ring neighbors of v0 and v1 must be exactly 2 (manifold interior) or 1 (boundary)
5. **Inversion prevention:** No incident triangle would flip normal after collapse (dot product check)

Uses:
- `FeatureEdgeGraph.isFeatureEdge()` from `FeatureEdgeGraph.ts`
- `identifySeamVertices()` from `SeamTopology.ts`
- `triangleNormal()` from `AdaptiveRefinement.ts`

### Task 6.4: `collapseOverBudgetEdges()` — main entry point

```typescript
async function collapseOverBudgetEdges(
    positions: Float32Array,
    uvs: Float32Array,
    indices: Uint32Array,
    outerIdxCount: number,
    featureGraph: FeatureEdgeGraph,
    targetTriangles: number,
    vertexMetrics?: VertexMetrics,
    numU?: number, numT?: number,
): Promise<CollapseResult>
```

**Algorithm:**
1. Init quadrics from triangles
2. Build vertex 1-ring adjacency + vertex-to-triangle map
3. Build feature vertex set + seam vertex sets
4. Score all non-protected edges → insert into min-heap
5. While heap non-empty AND currentTris > target:
   - Pop min-cost candidate
   - Skip if either vertex already removed (lazy deletion via generation counter)
   - Run validity checks (link condition, inversion, min angle)
   - Execute: remap all `vRemove` references in `indices` to `vKeep`, update quadric of `vKeep`
   - Re-score edges incident on `vKeep`, push to heap
6. Compact: remove degenerate triangles, renumber vertices

**Performance:** 200k triangles → 150k (25% reduction) in <500ms. Min-heap gives O(log E) per collapse.

### Task 6.5: Mesh compaction

```typescript
function compactMesh(positions, uvs, indices, outerIdxCount, removedVertices)
    → { positions, uvs, indices, outerIdxCount }
```

1. Build old→new vertex index map (skip removed vertices)
2. Copy surviving positions/uvs to new contiguous arrays
3. Filter degenerate triangles (two identical indices), remap remaining
4. Set `outerIdxCount = newIndices.length` (maintains outer-only invariant)

### Task 6.6: Integration into refinement loop

**File:** `src/renderers/webgpu/parametric/AdaptiveRefinement.ts`

After splits (line ~1344), before next iteration:

```typescript
if (edgeCollapseEnabled && currentTris > maxTriangles * 0.9) {
    const result = await collapseOverBudgetEdges(...);
    // Update curPositions, curUVs, curIndices, curOuterIdxCount
}
// Re-enable fixed edge flip + smoothing
if (splitCount > 0 || collapseCount > 0) {
    localEdgeFlip(curIndices, curPositions, affected, featureGraph, curOuterIdxCount);
    await smoothNewVertices(...);
}
```

**Config changes:**
- Add `numU?: number`, `numT?: number` to `RefinementConfig`
- Add `collapseCount` to `RefinementIterationStats`
- Add `edgeCollapseEnabled` to `PipelineFeatureFlags` in `contracts.ts`

**Orchestrator:** Pass `numU`/`numT` from grid builder output. Wire `edgeCollapseEnabled` flag.

### Task 6.7: Tests

**File:** Create `src/renderers/webgpu/parametric/EdgeCollapser.test.ts`

| # | Test | Category |
|---|---|---|
| 1 | Flat square: zero QEM error at vertex positions | Unit |
| 2 | 90° dihedral edge: high collapse cost | Unit |
| 3 | Link condition: 2 shared neighbors → pass | Unit |
| 4 | Link condition: 3+ shared → reject | Unit |
| 5 | Concave quad inversion → rejected | Unit |
| 6 | Feature edge never collapsed | Unit |
| 7 | Feature vertex never collapsed | Unit |
| 8 | Seam boundary edge: mixed seam/interior → skip | Unit |
| 9 | Min-heap: collapses in ascending cost order | Unit |
| 10 | Compaction: no degenerates, no gaps | Unit |
| 11 | Metric-aware: cylinder body collapses before lip | Unit |
| 12 | Budget enforcement: 162→~100 triangles | Integration |
| 13 | Quality: min angle + aspect ratio within bounds | Integration |
| 14 | Feature preservation: all feature edges survive 30% collapse | Integration |
| 15 | Split+collapse round-trip: count between original and post-split | Integration |
| 16 | Idempotence: second collapse run is no-op | Integration |

## File Change Summary

| File | Action | Description |
|---|---|---|
| `src/renderers/webgpu/parametric/EdgeCollapser.ts` | **Create** | QEM structures, validity checks, `collapseOverBudgetEdges()`, compaction |
| `src/renderers/webgpu/parametric/EdgeCollapser.test.ts` | **Create** | 16 tests |
| `src/renderers/webgpu/parametric/AdaptiveRefinement.ts` | **Modify** | Fix `localEdgeFlip` (multi-pass), fix `smoothNewVertices` (circular U), integrate collapse, add iteration stats |
| `src/renderers/webgpu/parametric/contracts.ts` | **Modify** | Add `edgeCollapseEnabled` to `PipelineFeatureFlags` |
| `src/renderers/webgpu/ParametricExportComputer.ts` | **Modify** | Pass `numU`/`numT` to config, wire `edgeCollapseEnabled` flag |

## Key Design Decisions

1. **Half-edge collapse** (not full-edge): Pot vertices are GPU-snapped to analytic surface. Moving a vertex to an "optimal" off-surface position is worse than keeping either existing on-surface endpoint.
2. **Float64 for quadrics:** Plane coefficients can reach ±100 for a 100mm pot. Summing hundreds of outer products in Float32 loses precision.
3. **Lazy heap deletion:** Stale entries skipped via vertex generation counter. Avoids O(log n) decrease-key.
4. **Feature vertex lock (not just edge lock):** Blocks collapse of any edge where either vertex is a feature vertex, preserving chain topology.
5. **No GPU re-evaluation:** Unlike splitting, collapse only removes vertices. Surviving vertex is already at GPU-evaluated position.

## Verification

1. `npm run typecheck` — clean
2. `npm run test` — all EdgeCollapser + AdaptiveRefinement tests pass
3. **Manual:** Export pot at ultra, toggle `edgeCollapseEnabled` → smooth regions have fewer triangles, feature regions unchanged
4. **Manual:** Compare triangle counts: with collapse, budget more efficiently allocated (more triangles at features, fewer in cylinders)
5. **Regression:** Feature chain edges survive collapse (100% preservation)
6. **Regression:** Seam gap does not increase after collapse
