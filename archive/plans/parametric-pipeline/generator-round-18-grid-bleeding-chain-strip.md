# Generator Round 18 — Grid Structure Bleeding Through Chain-Strip Triangulation

Date: 2026-03-05

## Problem Statement

22% of chain-strip triangles (34,726 / 157,880) have R2 violations: a triangle containing BOTH a feature chain vertex AND a grid boundary vertex. This means CDT is creating edges that connect chain feature vertices to grid column vertices → visible staircase artifacts where the mesh should flow smoothly along feature ridges.

The root cause is structural: `buildMergedRow()` interleaves every grid column vertex with chain vertices on the row boundary, and `stripBot`/`stripTop` inherit ALL of them. CDT is obligated to triangulate all input boundary points, creating boundary edges between consecutive vertices along the strip row. When a chain vertex sits between two grid column vertices on the boundary, CDT creates grid→chain edges that produce the grid-aligned staircase.

## Root Cause Analysis

### The Boundary Edge Problem

In `cdtTriangulateStrip()` ([ChainStripTriangulator.ts lines 170-220](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L170-L220)), the CDT boundary is constructed from consecutive vertices in `stripBot` and `stripTop`:

```typescript
// Bottom row boundary
for (let i = 0; i < bot.length - 1; i++) {
    addEdge(l0, l1);  // CONSTRAINT: consecutive boundary vertices
}
```

A typical `stripBot` for a strip spanning columns 10-15 looks like:

```
[gridCol10, gridCol11, chainVertA, gridCol12, chainVertB, gridCol13, gridCol14, gridCol15]
```

This produces CDT boundary edges:
- gridCol10 → gridCol11 (grid-aligned ✓, no chain involvement)
- gridCol11 → **chainVertA** ← **R2 violation!** Grid→chain edge
- **chainVertA** → gridCol12 ← **R2 violation!** Chain→grid edge  
- gridCol12 → **chainVertB** ← **R2 violation!** Grid→chain edge
- **chainVertB** → gridCol13 ← **R2 violation!** Chain→grid edge
- gridCol13 → gridCol14 (grid-aligned ✓)
- gridCol14 → gridCol15 (grid-aligned ✓)

Every chain vertex on the row boundary is flanked by grid column vertices, creating 2 R2-violating boundary edges per chain vertex per row. With ~430 rows and multiple chain vertices per row, this trivially generates tens of thousands of R2 violations.

### Why Current Companions Don't Help

The T-Ladder companion system ([OuterWallTessellator.ts lines 560-670](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L560-L670)) adds Steiner points at intermediate T-levels BETWEEN rows. These are true CDT interior points — CDT is free to connect them however it wants. But they don't address the fundamental problem: the ROW BOUNDARY itself is contaminated with grid vertices. Companions break up slivers in the T-direction but can't fix grid-aligned edges that are baked into the boundary edge sequence.

### Why Edge Flips Don't Help

The 3-phase chain-strip edge flip pass ([ChainStripOptimizer.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts)) flips interior CDT edges to improve triangle quality. But it CANNOT flip boundary edges — they are CDT constraints. The grid→chain connections are boundary edges, making them immune to post-CDT optimization. Even the 133,923 flips achieved can't touch the 34,726 R2-violating boundary triangles.

### Key Insight: Interior Grid Vertices Serve No Standard Cell

Within the CDT strip (`segStart` to `segEnd`), every cell is marked `quadMap[...] = -1` at [OuterWallTessellator.ts line 1093](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1093). Standard cells exist ONLY outside the strip. The grid vertices at columns `segStart+1` through `segEnd-1` appear in `stripBot`/`stripTop` but are NOT used by any standard cell — they exist solely as CDT boundary points. Only the boundary columns (`segStart`, `segEnd`) are shared with adjacent standard cells.

This means interior grid vertices can be removed from the CDT boundary without breaking any standard cell adjacency. They are expendable boundary points consuming CDT edges for no structural reason.

### Manifold Safety of Shared Rows

Row `j` is shared between band `j-1` (as top) and band `j` (as bottom). Both CDTs must produce matching edge decompositions at row `j` for manifold correctness.

**Proof that thinning is safe**: The `effectiveColHasChain` 3-way union pass ([OuterWallTessellator.ts lines 984-1000](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L984-L1000)) guarantees: if band `j` marks column `c` as CDT, then band `j-1` also marks column `c` as CDT (because `effectiveColHasChain[j-1]` includes `rawColHasChain[j]`). Both bands at the shared row apply the same thinning rule → same boundary vertex sequence → same boundary edge decomposition → manifold match. CDT boundary edges are the ONLY edges along the row boundary (constraint edges between consecutive boundary vertices prevent CDT from creating alternative row-boundary edges). Therefore identical boundary sequences guarantee identical edge decompositions.

**Caveat — Expansion asymmetry**: The horizontal expansion pass ([lines 1011-1020](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1011-L1020)) runs independently per band AFTER the union. This can cause band `j`'s strip to be wider than band `j-1`'s strip at their shared row. Columns that are CDT in one band but standard in the other at the shared row must retain their grid vertices. A transition guard margin is required (see P1).

## Proposals

### Proposal 1: Strip-Interior Grid Vertex Removal with Transition Guard (Conservative)

**Idea**: During strip vertex collection, remove grid vertices that are deep interior to the strip from `stripBot`/`stripTop`. Do not add them back (as interior CDT points or otherwise). Retain grid vertices at and near the strip boundaries as a transition guard.

**Mechanism**:
At [OuterWallTessellator.ts lines 1108-1130](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1108-L1130), when filtering `botRow` into `stripBot`:

```
Current:  Keep ALL vertices within [uStripLeft, uStripRight]
Proposed: Keep vertex IF:
   (a) it is a chain vertex (isChain === true), OR
   (b) its gridCol === segStart OR gridCol === segEnd, OR
   (c) its gridCol is within M columns of segStart or segEnd (transition guard)
   Skip grid vertices at gridCol in [segStart + M + 1, segEnd - M - 1]
```

Where `M` = `max(1, stripExpansion)` (safety margin matching or exceeding the expansion parameter to handle expansion asymmetry between adjacent bands).

**Mathematical basis**: The R2 violation count is proportional to the number of interior grid vertices on strip boundaries. A strip spanning `N` columns currently has `N-1` interior grid vertices per row, producing up to `2*(N-1)` R2 boundary edges per row. Thinning to keep only `2*M` transition guard vertices reduces R2 boundary edges to at most `2*M` per row — a `(N-1)/(M)` fold reduction.

With `N` ≈ 5-15, `M` = 1: reduction factor ≈ 4-14×. Predicted R2 violations: 34,726 / 4 ≈ **8,700** down to 34,726 / 14 ≈ **2,500** (70-93% reduction).

**Files affected**:
- [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts): Strip vertex collection loop (~lines 1108-1130). Filter logic for `stripBot` and `stripTop`.

**Trade-offs**:
- (+) Simple, surgical, minimal code change (~20 lines)
- (+) No new vertex creation, no new data structures
- (+) Manifold-safe with transition guard
- (-) Reduced vertex density at row boundaries inside strips — strips become sparser
- (-) Larger triangles at row boundaries may increase grading violations

**Assumptions** (for Verifier to attack):
1. Interior grid vertices at columns `segStart+M+1` through `segEnd-M-1` are never shared with standard cells in either adjacent band.
2. The 3-way union + expansion pass ensures `M >= stripExpansion` is sufficient margin for expansion asymmetry.
3. CDT produces quality triangulation with the sparse boundary even when chain vertices are unevenly spaced along the row.
4. R2 violations at the transition guard (columns at ±M from segStart/segEnd) are geometrically in the transition zone and visually acceptable.

---

### Proposal 2: Row-Boundary Companion Injection (Moderate)

**Idea**: After removing interior grid vertices (per P1), insert NEW companion vertices on the row boundaries at feature-following U positions. These provide density that follows the chain geometry instead of the grid structure.

**Mechanism**:
After thinning interior grid vertices from `stripBot`/`stripTop`, scan for gaps between consecutive boundary vertices that exceed a threshold (e.g., `2 * gridCellWidth`). At each gap, insert 1-2 row-boundary companions at evenly-spaced or chain-interpolated U positions.

Row-boundary companions are created as `ChainVertex` entries with `t = undefined` (row-aligned, like other row boundary vertices) and `pointIdx = -1` (non-detected). They are added to `rowChainVerts` and appear in `buildMergedRow` output for both adjacent bands → shared row property satisfied.

Key implementation detail: the companion U-positions must be deterministic and based on the boundary vertex sequence (chain vertex positions + boundary grid positions), NOT on band-specific state. This ensures both adjacent bands at a shared row produce the same boundary companions.

```
Current boundary:  [segStart, grid1, grid2, chainA, grid3, chainB, grid4, segEnd]  
After P1 thin:     [segStart, chainA, chainB, segEnd]
After P2 infill:   [segStart, comp1, chainA, comp2, chainB, comp3, segEnd]
```

Where `comp1, comp2, comp3` are at U-positions midway between their neighbors.

**Mathematical basis**: Target boundary vertex spacing ≈ `gridCellWidth * 2` (0.003 U). For a strip spanning 0.015 U with 2 chain vertices, thin boundary has 4 vertices (spacing 0.005 U). P2 adds ~2-3 companions to bring spacing down to ~0.003 U. CDT boundary edges connect feature-following vertices → R2 violations approach zero.

**Files affected**:
- [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts): New companion generation in strip vertex collection. New vertex allocation. Additions to `rowChainVerts` or a new per-row boundary companion list.
- [ChainStripTriangulator.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts): No changes (companions enter as regular StripVertex entries).

**Trade-offs**:
- (+) Restores density lost by P1, feature-following positioning
- (+) CDT gets well-spaced boundary → good triangle quality
- (+) R2 violations → ~0 (no grid vertices remain in strip interior)
- (-) More complex: new vertex allocation, new companion logic, deterministic position computation
- (-) Additional vertices increase total mesh vertex count (minor: ~2-3 per row per strip)
- (-) Must ensure companion positions are identical for both bands at shared row

**Assumptions** (for Verifier to attack):
1. Row-boundary companions with deterministic U positions (midpoint of neighbors) produce identical buildMergedRow output in both adjacent bands at a shared row.
2. Adding O(N_strips × N_rows × 3) ≈ 5,000-10,000 new vertices is acceptable for total mesh budget.
3. CDT with feature-following boundary companions produces better triangle quality than CDT with grid boundary vertices.
4. The companion U-positions don't collide with chain vertex U-positions (dedup handles this).

---

### Proposal 3: CDT Interior Promotion with T-Perturbation (Moderate)

**Idea**: Remove interior grid vertices from `stripBot`/`stripTop` boundary, but re-add them to CDT as free Steiner points with a tiny T-offset (pushing them slightly inside the strip). CDT treats them as interior points with full edge-creation freedom, rather than boundary-constrained points.

**Mechanism**:
At the strip vertex collection stage:
1. Filter interior grid vertices out of `stripBot`/`stripTop` (same as P1).
2. Collect filtered grid vertices into `stripInteriorVerts` with a modified T-coordinate: `tGrid + epsilon * sign` where `epsilon ≈ 1e-5 * tRange` and `sign` = +1 for bot-row vertices, -1 for top-row vertices.
3. CDT receives these as free interior points — at nearly the row boundary, but not exactly on it.

In `cdtTriangulateStrip()`, the `addVertex()` call for these promoted points uses the perturbed T:

```typescript
// For promoted interior grid vertices from bot row:
addVertex(sv.idx, sv.u, tBot + epsilon);  // NOT tBot
```

CDT sees them as interior points, uses Delaunay criterion to connect them → edges follow circumscribed circle optimality, not grid alignment.

**Mathematical basis**: CDT's Delaunay criterion maximizes the minimum angle of all triangles. When grid vertices are interior free points, CDT may or may not connect them to chain vertices — it depends on the local Delaunay criterion. If a chain vertex and its companion create a well-shaped triangle without the grid vertex, CDT uses the companion. If the grid vertex improves triangle quality, CDT includes it. Either way, the edges are Delaunay-optimal, not grid-forced.

**Files affected**:
- [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts): Strip vertex collection loop. Promoted vertices go to `stripInteriorVerts` with perturbed T.
- [ChainStripTriangulator.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripTriangulator.ts): Minimal or no change — interior vertices already handled via `interiorVerts` parameter with `addVertex(sv.idx, sv.u, cv.t)` path.

**Trade-offs**:
- (+) No vertex density loss — all original vertices participate in CDT
- (+) CDT has maximum freedom to optimize triangle quality
- (+) Grid vertices still contribute density but don't force grid-aligned edges
- (-) T-perturbation is a hack — perturbed vertices are at slightly wrong physical positions
- (-) Manifold risk at shared rows: band `j` and band `j-1` may create different non-boundary edges through promoted grid vertices (detailed analysis in Root Cause section shows boundary edges still match, but non-boundary edge patterns may differ)
- (-) Near-collinear configurations (promoted vertex at T+epsilon near boundary vertex at T) may produce CDT numerical issues

**Assumptions** (for Verifier to attack):
1. A T-perturbation of 1e-5 × tRange (~1e-8 in absolute T) is large enough for CDT numerical stability but small enough to not affect mesh geometry.
2. Non-boundary edge mismatches at shared rows between adjacent bands don't cause manifold violations (both CDTs produce valid triangulations; the question is whether they share edges along the row boundary correctly).
3. CDT with promoted grid vertices doesn't fall back to sweep mode more frequently (crossing constraints with interior points).
4. Promoted grid vertices don't interfere with chain constraint edges (interior points on constraint edge paths cause CDT issues).

---

### Proposal 4: Post-CDT R2-Targeted Edge Collapse (Conservative)

**Idea**: Keep the current CDT input unchanged. After CDT, identify R2-violating triangles and resolve them by collapsing the shorter edge connecting a grid vertex to a chain vertex (merging the grid vertex into the chain vertex or a nearby non-grid vertex).

**Mechanism**:
In [ChainStripOptimizer.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts), add a Phase D after the existing 3-phase flip pass:

For each R2-violating triangle (has both a feature vertex F and a grid boundary vertex G):
1. Identify the edge E connecting F and G.
2. Check if E is a CDT constraint edge (if so, skip — don't collapse constraints).
3. Check if collapsing E maintains manifold integrity (link condition: the vertex neighborhoods of F and G share exactly 2 common vertices for an interior edge, or 1 for a boundary edge).
4. If safe, collapse E by merging G into F: update all triangles referencing G to reference F, remove degenerate triangles.

**Mathematical basis**: Edge collapse is a well-studied mesh simplification operation. Each collapse removes 1 vertex and 2 triangles (interior) or 1 triangle (boundary), converting an R2-violating pair into a locally cleaner mesh. Total mesh simplification: up to 34,726 collapses, removing ~69K triangles and ~35K vertices.

**Files affected**:
- [ChainStripOptimizer.ts](potfoundry-web/src/renderers/webgpu/parametric/ChainStripOptimizer.ts): New Phase D function. ~100-150 lines.
- [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts): Integration point after the edge flip call.

**Trade-offs**:
- (+) No CDT input changes — minimal architectural risk
- (+) Well-understood mesh operation, existing edge flip infrastructure
- (+) Can be enabled/disabled independently as a quality option
- (-) Edge collapse changes topology — some collapses may fail link condition
- (-) Collapsed edges near strip boundary may create T-junctions with standard cells
- (-) 34K collapses is expensive (O(N) per collapse for link condition check)
- (-) Post-hoc — doesn't prevent the bad edges, only repairs them

**Assumptions** (for Verifier to attack):
1. Most R2 edges pass the link condition (interior edges between grid and chain vertices in CDT strips).
2. Collapsing a grid vertex into a chain vertex doesn't create inverted triangles (need to check normals of affected triangles post-collapse).
3. The grid vertices being collapsed aren't shared with standard cells via the strip boundary transition.
4. Edge collapse of boundary edges (the primary R2 source) is manifold-safe.
5. The resulting mesh is still watertight after ~35K vertex merges.

---

### Proposal 5: Hybrid P1+P2 — Interior Thinning + Feature-Following Boundary (Recommended)

**Idea**: Combine P1 and P2. Remove interior grid vertices from strip boundaries (P1), then inject row-boundary companions at feature-following positions (P2). This is the complete solution: eliminates grid contamination AND restores vertex density.

**Mechanism**: Sequential application:
1. Apply P1's transition guard filter during strip vertex collection.
2. Apply P2's gap-filling companion insertion into the thinned boundary.

Implementation in a single modified strip-collection loop:

```
For each vertex in botRow filtered to strip U range:
    if (isChain) → always include in stripBot
    if (gridCol === segStart or segEnd) → always include (boundary match)
    if (gridCol within M of segStart or segEnd) → include (transition guard)
    else → skip (interior grid vertex, thinned)

After filtering, scan stripBot for gaps > gapThreshold:
    Insert row-boundary companions at gap midpoints
```

**Files affected**:
- [OuterWallTessellator.ts](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts): Strip collection loop (~20 lines modified) + gap companion insertion (~30 lines new).
- Possibly new helper function for deterministic gap-filling.

**Expected impact**:
- **R2 violations**: 34,726 → **< 500** (only at transition guard zone, where grid→chain edges are geometrically in the fade-out region and visually acceptable).
- **Aspect ratios**: Improved — feature-following boundary companions eliminate the grid-imposed elongated triangles. UV max aspect should drop from 641:1 to < 50:1 within chain strips.
- **Grading violations**: Mixed — reduced in strip interior (better-spaced boundary), possibly slightly increased at transition guard boundary. Net improvement expected.
- **Triangle count**: Roughly unchanged (removed grid vertices replaced by companions at similar density).

**Assumptions** (for Verifier to attack):
1. All P1 assumptions (1-4) hold.
2. All P2 assumptions (1-4) hold.
3. The gap-filling companion creation is deterministic and produces identical output for both adjacent bands at a shared row.
4. Combining P1+P2 doesn't introduce interaction effects (edge cases where thinning + infilling produces worse results than either alone).
5. The transition guard zone (M columns at each strip edge) is sufficient to handle all cases where adjacent bands have different strip widths.

## Recommended Approach

**Implement P1 first, then P2** (which together constitute P5).

**Phase A: P1 alone (1 session)**. Apply the interior grid vertex filter with transition guard `M = max(1, stripExpansion)`. Measure R2 violations, aspect ratios, and grading violations. This is low-risk and immediately quantifies the impact.

**Phase B: P2 on top of P1 (1 session)**. If P1 leaves unacceptable gaps in boundary density (elevated aspect ratios or visual sparsity), add the row-boundary companion injection. This restores density at feature-following positions.

**Why not P3 (Interior Promotion)?** The T-perturbation is a numerical hack with manifold risk. The promoted grid vertices at near-boundary T-positions may cause CDT numerical instability (near-collinear configurations). The potential benefit (CDT optimality with all original vertices) is outweighed by the risk and complexity.

**Why not P4 (Post-CDT Collapse)?** It's reactive rather than preventive. Edge collapse of 35K vertices is computationally expensive, has failure modes (link condition failures, inverted triangles), and doesn't address the root cause. If P1+P2 achieves < 500 R2 violations, a small post-CDT cleanup of residual violations in the transition zone is a fine addendum, but it shouldn't be the primary strategy.

## Open Questions

1. **What is the actual strip width distribution?** The user says 5-15 columns, but we need to verify: what fraction of strips have width ≤ 3 columns (where thinning leaves only boundary vertices with no interior)? These narrow strips are already nearly R2-free and don't need P1.

2. **Does `expansion` vary by export configuration?** The default is 1, but users or the parametric exporter might set a different value. The transition guard `M = max(1, stripExpansion)` should be robust, but verify.

3. **How many chain vertices per row per strip?** If some strips have 0 chain vertices on certain rows (interpolation gap), the thinned boundary would be just `[segStart, segEnd]` — a very sparse 2-vertex boundary. Is this acceptable for CDT?

4. **Are there strips where the expansion pass creates asymmetric widths between adjacent bands by more than `M` columns?** If so, the transition guard margin needs to be wider. The 3-way union should prevent this, but edge cases near the seam or at the T-extremes (first/last rows) might be vulnerable.

5. **R2 violation distribution**: Are R2 violations concentrated in specific bands (where chains have many vertices per row) or uniformly distributed? This affects whether P2 companion density should be uniform or adaptive.

## Implementation Sketch (P1 — for Executioner reference)

Location: [OuterWallTessellator.ts lines 1108-1130](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1108-L1130)

```typescript
// Current: collect ALL botRow vertices within strip U range
for (let bi = 0; bi < botRow.length; bi++) {
    const sv = botRow[bi];
    if (sv.u >= uStripLeft - 1e-9 && sv.u <= uStripRight + 1e-9) {
        stripBot.push(sv);
    }
}

// Proposed: thin interior grid vertices, keep chain + boundary + guard
const guardMargin = Math.max(1, stripExpansion);
for (let bi = 0; bi < botRow.length; bi++) {
    const sv = botRow[bi];
    if (sv.u < uStripLeft - 1e-9 || sv.u > uStripRight + 1e-9) continue;
    
    if (sv.isChain) {
        stripBot.push(sv);  // always keep chain vertices
    } else {
        // Grid vertex: keep if at boundary or within guard margin
        const distFromLeft = sv.gridCol - segStart;
        const distFromRight = segEnd - sv.gridCol;
        if (distFromLeft <= guardMargin || distFromRight <= guardMargin) {
            stripBot.push(sv);  // transition guard zone
        }
        // else: interior grid vertex — skip
    }
}
// Same logic for stripTop
```

This is ~15 lines of change per strip boundary (bot + top), pure filtering, no new data structures.

## Appendix: Why The Problem Is In The Boundary, Not The Interior

A common intuition is "CDT should optimize away grid-aligned edges via its Delaunay criterion." This is wrong because:

1. **Boundary edges are inviolable.** CDT constraint edges (including boundary edges between consecutive `stripBot` vertices) CANNOT be flipped, collapsed, or removed. They persist in the final triangulation.

2. **All grid→chain edges at the row boundary are boundary edges.** The consecutive vertex ordering in `stripBot` places grid and chain vertices in alternating sequence, making the grid→chain connections boundary constraints.

3. **Interior edges CAN be Delaunay-optimal.** The companion system improves interior edges (via T-Ladder). But this is fighting the wrong battle — the R2 violations are at the boundary, not the interior.

The only way to eliminate grid→chain boundary edges is to remove grid vertices from the boundary. This is exactly what P1/P5 does.
