# Generator Round 41 — Response to Verifier CCT Critique
Date: 2026-03-08

## 1. Proposal 1 Amendments: ALL ACCEPTED

### A1: Restrict to 2×2 sub-quads only — ACCEPT

The Verifier is correct: `chainBiasedSweep` for N×M sub-quads is underspecified (C2). The 2×2 case covers the vast majority of chain-adjacent sub-quads because `constrainedSweepCell` partitions the cell along each chain edge, and most cells have exactly one chain edge, yielding two 2×2 sub-quads (left-of-chain and right-of-chain). Multi-chain-per-cell situations are rare and handled by super-cells. Defer N×M until a concrete tangent-selection spec exists.

### A2: Degenerate guard — ACCEPT

When `batch2Remap` merges a chain vertex with a grid corner (MERGE_THRESHOLD = 1e-4, [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L827)), a sub-quad edge can collapse to a single vertex. The fan logic must guard: if either `subBot.length < 2` or `subTop.length < 2`, skip the fan and fall through to `sweepQuad` (which already handles 3-vertex degenerate quads via its exhaustion branches at [L219-L224](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L219-L224)).

### A3: No additional CSO protection — ACCEPT

The Verifier's analysis is rigorous (C3, revised severity). In a 2×2 fan, the two fan triangles share exactly the chain edge as their common edge. That chain edge is in `constraintEdgeSet`. The CSO skips constraint edges at [ChainStripOptimizer.ts:L581](../../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L581). There is no other shared edge to flip. **The fan is already CSO-proof for 2×2.**

---

## 2. Problem B: Addressing Surface Quality Near Features

### Why Proposal 1 alone is insufficient for Problem B

The fan diagonal eliminates the PATTERN problem (sawtooth alternation from `sweepQuad`'s U-comparison at [L231-L235](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L231-L235)). But it does not address the DENSITY problem: the fan arms (chain_vertex → grid_corner) can span significant surface curvature. A flat triangle approximating a curved region creates chord error:

$$s = \frac{\kappa d^2}{8}$$

The fan makes the chord error *consistent* (no alternating zigzag), but the magnitude $s$ is unchanged because the triangle size $d$ hasn't changed. The user's complaint about "triangles not aligning to create smooth curves" is a density issue, not a pattern issue.

### Why Original Proposal 2 (Bridge Supports) fails

The Verifier's C6 is correct and fatal. I re-read `emitStandardCell` at [OuterWallTessellator.ts:L1393-L1427](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1393-L1427):

```typescript
const emitStandardCell = (b: number, c: number): void => {
    const bl = b * numU + c;
    const br = b * numU + (c + 1);
    const tl = (b + 1) * numU + c;
    const tr = (b + 1) * numU + (c + 1);
    // ... emits two triangles using ONLY bl, br, tl, tr
```

No consultation of `rowChainVerts`, `cellChainMap`, or any phantom list. Placing a bridge support vertex on a shared horizontal edge between a standard cell and a chain cell creates a T-junction: the chain cell sees the vertex on its bot/top edge, but the adjacent standard cell's triangles span that same geometric edge with no intermediate vertex. This is a mesh gap.

I withdraw Proposal 2 as originally stated. The Verifier's historical pattern analysis (§5) is also correct — this is the same failure mode as buffer zones.

### Proposal 2B: Feature-Aware Subdivision Threshold (FAST)

**Key Insight**: The right place to add density near features is NOT at tessellation time (where the cell architecture creates T-junction risks) but at SUBDIVISION time (where cells no longer exist and edge splits are inherently T-junction-free).

#### The Problem

The existing `subdivideLongEdges` at [MeshSubdivision.ts:L274](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L274) uses two thresholds:

| Edge type | Threshold | Code location |
|-----------|-----------|---------------|
| Interior chain-strip | `(avgGridEdge × 1.8)²` | [MeshSubdivision.ts:L307](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L307) |
| Boundary (chain-strip ↔ grid) | `(avgGridEdge × 1.2)²` | [MeshSubdivision.ts:L367](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L367) |

Fan arms (chain_vertex → grid_corner) are typically ~0.5–1.0× `avgGridEdge` in 3D length. **Neither threshold triggers for most fan arms.** The 1.8× interior threshold is designed for long, rare edges — not for the systematic fan arms that Proposal 1 creates.

#### The Solution

Add a third threshold class: **feature edges**, defined as edges where exactly one endpoint is a chain/phantom vertex and the other is a grid vertex. These are the fan arms that bridge the curvature gap between features and the grid.

**Detection** (requires NO new parameters — `outerGridVertexCount` is already in `SubdivisionParams`):

```
isFanArm(v0, v1) = (v0 < outerGridVertexCount) !== (v1 < outerGridVertexCount)
```

**Threshold**:

```
featureThreshold² = (avgGridEdge × FEATURE_SCALE)²
```

where `FEATURE_SCALE ≈ 0.7–0.8`. This means fan arms wider than ~70–80% of an average grid edge get split with a GPU-evaluated midpoint.

**Integration point** — in the edge evaluation loop at [MeshSubdivision.ts:L370-L385](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L370-L385):

```
// EXISTING:
const isBoundaryEdge = (csTriSetNow.has(tris[0]) !== csTriSetNow.has(tris[1]));
const threshold = isBoundaryEdge ? boundarySubdivThreshold2 : subdivThreshold2;

// PROPOSED (insert before the existing code):
const isFeatureEdge = (v0 < outerGridVertexCount) !== (v1 < outerGridVertexCount);
const featureThreshold2 = (avgGridEdge * 0.75) ** 2;
const isBoundaryEdge = (csTriSetNow.has(tris[0]) !== csTriSetNow.has(tris[1]));
const threshold = isFeatureEdge
    ? featureThreshold2
    : (isBoundaryEdge ? boundarySubdivThreshold2 : subdivThreshold2);
```

#### Why this avoids every Proposal 2 failure mode

| Verifier critique | Bridge Supports (rejected) | Feature-Aware Subdivision |
|---|---|---|
| C6: T-junction | FATAL — `emitStandardCell` doesn't see bridge vertices | **Non-issue.** Subdivision splits an edge shared by two adjacent triangles. Both triangles get the midpoint vertex. No cell boundaries exist at this stage. |
| C7: Phantom buffer mismatch | Different registration mechanism needed | **Non-issue.** Uses existing subdivision vertex allocation: `resultData` is grown at [MeshSubdivision.ts:L435](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L435) when needed. |
| C8: Scale (~9,720 vertices) | Each requires cell conversion | **Comparable vertex count but zero cell impact.** Subdivision midpoints are added to the triangle mesh, not to the cell grid. Each split replaces 2 triangles with 4 — pure mesh refinement. |
| C9: Close-chain collision | Same-cell phantom degeneration | **Non-issue.** Splitting is per-edge with a one-tri-per-split guard (`modifiedTris` set at [MeshSubdivision.ts:L403](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L403)). Close chains produce separate edges evaluated independently. |
| C10: Curvature error estimate | 2–3× for superformula, not 4× | **Exact.** GPU evaluation at [ParametricExportComputer.ts:L1615](../../src/renderers/webgpu/ParametricExportComputer.ts#L1615) computes the actual parametric surface position at the midpoint UV. No geometric approximation. Error reduction depends on exact surface shape, not a chord formula. |

#### Why this works with the protected corridor

Normal chain cells: chain vertices and their grid corners are **NOT** in `protectedStripVertices`. Only R37/R38 phantom crossing anchors and companions are protected at [OuterWallTessellator.ts:L1090+](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1090). So `touchesProtectedPatch` at [MeshSubdivision.ts:L393-L398](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L393-L398) does **not** block fan arm splits in normal chain cells.

Super-cell phantom vertices: their fan arms to grid corners WILL be blocked by `touchesProtectedPatch` because the phantom anchor endpoint is in the protected set. This is a minor limitation — super-cell regions are already densely populated by the R37 phantom row infrastructure.

#### Estimated scope

| Change | File | Lines |
|--------|------|-------|
| Compute `featureThreshold2` | MeshSubdivision.ts:L307 | +1 |
| Add `isFeatureEdge` check + threshold selection | MeshSubdivision.ts:L370-L385 | +5 |
| Log the feature threshold in stats | MeshSubdivision.ts stats | +3 |
| Add `featureThreshold` to `SubdivisionStats` | MeshSubdivision.ts:L100 | +2 |
| Log feature stats in PEC | ParametricExportComputer.ts:L1622 | +1 |
| **Total** | | **~12 lines** |

No new fields in `SubdivisionParams`. No changes to `OuterWallTessellator.ts`. No changes to `emitStandardCell` or `emitChainCell`. No cell infrastructure changes whatsoever.

#### Expected impact

For a pot with 20 chains × 243 rows:
- ~4,860 chain cells × 2 sub-quads × 2 fan arms = ~19,440 fan arm edges
- Of those, edges exceeding 0.75× avgGridEdge: likely ~60–80% = ~12,000–15,000 edges
- Subdivision budget: `maxSplits = floor(csTriSetNow.size * 0.5)`. For ~10,000 chain-strip tris, budget ≈ 5,000 splits. Top 5,000 longest fan arms get split.
- Each split adds 1 GPU-evaluated vertex + 2 new triangles. Total: ~5,000 new vertices, ~10,000 new triangles.
- This is well within the existing memory allocation strategy.

---

## 3. Combined Implementation Plan

### Phase 1: chainFanQuad (Proposal 1 with amendments A1–A3)

**What**: In `constrainedSweepCell`, before calling `sweepQuad` on each sub-quad, check if the sub-quad is 2×2 (2 vertices on bottom, 2 on top) and contains exactly one chain edge. If so, emit two fan triangles from the chain edge to the two grid corners instead of calling `sweepQuad`.

**Where**: [OuterWallTessellator.ts:L340-L360](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L340-L360) — inside the sub-quad emission in `constrainedSweepCell`.

**Guards**:
- A2: Skip fan if `subBot.length < 2 || subTop.length < 2`
- A1: Only for 2×2 sub-quads (`subBot.length === 2 && subTop.length === 2`)
- Identify which vertex pair is the chain edge (check if edge is in chain edge list or one endpoint is a chain vertex via index >= gridVertexCount)

**Scope**: ~50–60 lines.

### Phase 2: Feature-Aware Subdivision Threshold (Proposal 2B)

**What**: Add `featureThreshold2` for mixed chain/grid edges in `subdivideLongEdges`.

**Where**: [MeshSubdivision.ts:L307](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L307) and [L370-L385](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L370-L385).

**Scope**: ~12 lines.

### Phase order

Phase 1 first. It fixes the dominant visual artifact (sawtooth). Phase 2 follows to improve surface quality near features. Both are independent and can be verified separately.

---

## 4. Assumptions for Verifier to Check

1. **Fan arms are NOT protected:** Normal chain cell vertices (chain vertices and their grid corners BL/BR/TL/TR) are NOT in `protectedStripVertices`. Only R37/R38 phantom crossing anchors are. Therefore `touchesProtectedPatch` does not block fan arm splits in the subdivision pass. *Evidence: protectedStripVertices is populated only at [OuterWallTessellator.ts:L1094-L1100](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1094-L1100) for phantom anchors and companions.*

2. **Fan arms are in the candidate set:** Chain cell triangles are identified as chain-strip triangles by `identifyChainStripTriangles` (via vertex index >= outerGridVertexCount). Their edges are in `subEdgeToTris` and are eligible for splitting. *Evidence: [MeshSubdivision.ts:L328-L340](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L328-L340).*

3. **`(v0 < outerGridVertexCount) !== (v1 < outerGridVertexCount)` correctly identifies fan arms:** An edge with one chain/phantom endpoint and one grid endpoint is a fan arm by construction. Batch2Remap'd chain vertices have grid indices, so their "fan arms" are grid→grid edges — correct to exclude because the chain vertex WAS the grid vertex (merged within 1e-4 UV distance). *Evidence: batch2Remap at [OuterWallTessellator.ts:L830-L845](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L830-L845).*

4. **FEATURE_SCALE = 0.75 is conservative enough:** Fan arms ~0.75× avgGridEdge in 3D correspond to ~0.75× a grid cell width. Splitting at this threshold produces sub-triangles of ~0.375 grid cell width — well above the degenerate triangle threshold. The `modifiedTris` guard at [MeshSubdivision.ts:L403](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L403) prevents cascading splits that could create slivers.

5. **The subdivision budget (maxSplits = csTriSetNow.size × 0.5) is sufficient:** With feature-aware thresholds, more edges will exceed the threshold. The budget may need to increase (e.g., 0.75 instead of 0.5) to accommodate the additional feature-edge splits. *Open question: is the current budget sufficient, or should it scale with the number of feature edges?*

6. **Edge sorting favors the longest edges first:** The `edgesToSplit.sort((a, b) => b.len2 - a.len2)` at [MeshSubdivision.ts:L389](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L389) means the longest fan arms get split first. If the budget is tight, shorter fan arms (closer to the 0.75× threshold) may be skipped. This is the correct priority — longest arms have the most chord error.

---

## 5. Open Questions

1. **Budget scaling:** Should `maxSplits` be increased for meshes with many feature edges? A possible heuristic: `maxSplits = floor((csTriSetNow.size + featureEdgeCount) * 0.5)`.

2. **FEATURE_SCALE tuning:** 0.75 is a starting point. Should this be exposed as a config parameter in the export pipeline, or hard-coded? Historical precedent: `subdivThreshold` multiplier (1.8) is hard-coded.

3. **Super-cell fan arms:** These ARE blocked by `touchesProtectedPatch`. Is this acceptable, or should we carve out a "split-only" exception for protected feature edges? The argument for the exception: splitting doesn't change topology (no diagonal flip), it only adds a midpoint on an existing edge. The risk: the midpoint vertex isn't in the protected set, so subsequent optimizer passes could flip adjacent triangles involving the new vertex.

4. **Interaction with Phase 1:** After Phase 1 sets fan diagonals, does the subdivision pass treat the fan-produced triangles differently from sweepQuad-produced triangles? No — both are triangle meshes at this point. The subdivision doesn't know how the triangles were produced. But the fan's consistent diagonal means the subdivision midpoints will be placed on consistently-oriented edges, producing more uniform sub-triangles.
