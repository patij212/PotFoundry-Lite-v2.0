# Generator Round 36 — Super-Cell Triangle Quality Fix

Date: 2026-03-07

## Problem Statement

R35 super-cell fusion successfully enforced ALL cross-column chain edges (6172/6172, 0 missing). However, chain-strip triangle quality remains poor:

| Metric | Value | Target |
|---|---|---|
| Sliver violations (AR > 4:1) | 25.9% (5750/22176) | < 5% |
| Minimum angle | 1.7° | > 15° |
| Maximum aspect ratio | 37.1:1 | < 10:1 |
| Grading violations (area > 2:1) | 9298 | < 1000 |
| Cross-row triangles | 46 | 0 |
| Non-manifold edges | 2 | 0 |

Chain edges are fully enforced — this is a **quality-only** problem.

## Root Cause Analysis

### Root Cause 1: Super-cell triangles are invisible to 3 of 4 optimization passes

Super-cell and chain-cell emission sets `quadMap[quad] = -1`. Three Phase 4 passes skip them:

1. **`chainDirectedFlip`** ([MeshOptimizer.ts line ~140](../../src/renderers/webgpu/parametric/MeshOptimizer.ts#L140)): `if (triBase < 0) return` — requires `quadMap[quadIdx] >= 0` to locate the two triangles of a quad. Super-cells have variable triangle counts (not fixed 2-per-quad), so the quad model is structurally incompatible.

2. **`flipEdges3D`** ([MeshOptimizer.ts line ~370](../../src/renderers/webgpu/parametric/MeshOptimizer.ts#L370)): `if (triBase < 0) continue` — same quad-pair assumption. Performs ~163K quality flips on standard cells but **zero** on super-cell tris.

3. **`optimizeBoundaryDiagonals`** ([ChainStripOptimizer.ts line ~835](../../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L835)): `if (triBase < 0) continue` — same skip.

4. **`optimizeChainStrips`** ([ChainStripOptimizer.ts line ~370](../../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L370)): **CAN** process super-cell tris, but only those with at least one chain vertex (`index >= outerGridVertexCount`). Detection code:
   ```typescript
   if (a >= outerGridVertexCount || b >= outerGridVertexCount || c >= outerGridVertexCount) {
       chainStripTriSet.add(t);
   }
   ```

**Critical gap identified:** Super-cell triangles composed entirely of grid vertices (e.g., triangle `BL3-BR3-TL3` within a super-cell spanning columns 3-5) are invisible to ALL FOUR passes. They have `quadMap = -1` AND all vertices `< outerGridVertexCount`. Zero optimization.

Furthermore, the `chainAdjacentVertices` parameter that could catch these via UV-proximity is **not being passed** to `optimizeChainStrips` from `ParametricExportComputer.ts` (line ~1529). The call doesn't include it:
```typescript
csResult = optimizeChainStrips({
    combinedIdxs,
    positions: resultData,
    combinedVerts,
    constraintEdgeSet,
    outerGridVertexCount,
    outerIdxCount,
    finalT,
    // chainAdjacentVertices is MISSING
});
```

### Root Cause 2: `sweepQuad` has systematic diagonal bias

The `sweepQuad` function ([OuterWallTessellator.ts line ~201](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L201)):
```typescript
if (botNextU <= topNextU) {
    emitTriCCW(buf, bot[bi], bot[bi + 1], top[ti], verts);
    bi++;
} else {
    emitTriCCW(buf, top[ti], top[ti + 1], bot[bi], verts);
    ti++;
}
```

When `botNextU ≈ topNextU` (common case: evenly-spaced grid vertices), the `<=` always picks the bottom-advance. This creates a consistent diagonal slant direction across the entire mesh. On a flat surface this is harmless, but on curved pottery surfaces it systematically creates elongated triangles along the "wrong" diagonal — the one that cuts across curvature contours rather than along them.

**The `<=` tie-break produces the worst possible diagonal in ~50% of cases.** Normal cells get this fixed by `flipEdges3D`. Super-cell tris get no fix.

### Why `optimizeChainStrips` isn't enough (even when it sees the triangles)

`optimizeChainStrips` runs 3 phases of edge flips on chain-strip triangles. But it has structural limitations:

1. **Boundary-only adjacency.** It only builds `edgeToTris` for chain-strip triangles. Internal edges between a chain-strip tri and a standard-grid tri are boundary edges with only 1 entry — they can't be flipped. This limits the "reach" of quality improvement.

2. **Guard strictness.** Row-span, edge-length, and aspect-ratio guards reject flips that would help quality but violate conservative limits. The `csRowSpanRejects` + `csEdgeLenRejects` + `csAspectRejects` counts are often significant.

3. **Fixed iteration order.** Phases A/B/C iterate over edge keys in insertion order. Beneficial flip cascades that require a specific ordering may not be found.

4. **One-ring locality.** Edge flips can only improve the min-angle of the two triangles sharing the edge. Global quality issues requiring 3+ simultaneous flips are unreachable.

## Proposals

### Proposal 1: UV-Space Delaunay Tie-Break in `sweepQuad` (Conservative)

**Idea**: Replace the `<=` tie-break with a 2D Delaunay criterion. When both bot-advance and top-advance are valid, emit the triangle that maximizes the minimum angle in UV space.

**Mechanism**: At each tie-break point, we have four vertices forming a quad: `bot[bi]`, `bot[bi+1]`, `top[ti]`, `top[ti+1]`. The two candidate triangles create two diagonal choices. Compute the 2D circumcircle criterion (or simply compare the minimum angle of both candidate triangles) and pick the better one.

```
Current:  if (botNextU <= topNextU) → always advance bot
Proposed: if (botNextU < topNextU - ε) → advance bot (clear winner)
          if (topNextU < botNextU - ε) → advance top (clear winner)
          else → comparison zone: compute both candidate tris, pick better min-angle
```

**Mathematical basis**: The 2D Delaunay triangulation maximizes the minimum angle. While we're in UV space (not 3D), UV-Delaunay is a much better initial guess than a fixed `<=` bias. For pottery surfaces where the UV→3D mapping has moderate, smooth distortion, UV-Delaunay produces near-optimal initial triangulations.

The circumcircle check is equivalent to: given quad ABCD, diagonal AC is Delaunay iff angle at B + angle at D < 180°. Implementation using the `inCircle` determinant:

```
inCircle(a, b, c, d) = | ax-dx  ay-dy  (ax-dx)²+(ay-dy)² |
                        | bx-dx  by-dy  (bx-dx)²+(by-dy)² |
                        | cx-dx  cy-dy  (cx-dx)²+(cy-dy)² |
```

If `inCircle > 0`, point d is inside circumcircle of triangle abc → flip diagonal.

**Files affected**: `OuterWallTessellator.ts` — `sweepQuad` function only (~15 lines changed)

**Trade-offs**:
- **Pro**: Surgically minimal change, no new data structures, no API changes
- **Pro**: Fixes root cause at the source — better triangles from the start
- **Con**: UV-space quality doesn't guarantee 3D quality on highly curved surfaces
- **Con**: Only helps at tie-break points (when `botNextU ≈ topNextU`); forced advances still produce whatever triangle they produce

**Assumptions** (for Verifier to attack):
1. The tie-break case (`botNextU ≈ topNextU`) is responsible for a significant fraction of slivers
2. UV-Delaunay is a reasonable proxy for 3D quality on pottery surfaces
3. The `inCircle` computation won't cause numerical issues with nearly-collinear points

---

### Proposal 2: Super-Cell Vertex Marking for `optimizeChainStrips` (Conservative)

**Idea**: OWT already knows which grid vertices belong to super-cells and chain-cells. Collect them into a `Set<number>` and pass it as `chainAdjacentVertices` to `optimizeChainStrips`. This makes ALL super-cell triangles visible to the 3-phase edge flip optimizer.

**Mechanism**:

**Step 2a — Collect super-cell grid vertices in OWT:**

Inside `emitSuperCell`, every grid vertex that appears in the bot/top edge arrays is a "chain-adjacent" vertex. Collect them:

```typescript
// In emitSuperCell, after building finalBot and finalTop:
for (const v of finalBot) {
    if (v < gridVertexCount) chainAdjacentGridVerts.add(v);
}
for (const v of finalTop) {
    if (v < gridVertexCount) chainAdjacentGridVerts.add(v);
}
```

Similarly in `emitChainCell`:
```typescript
// Grid corner vertices BL, BR, TL, TR are chain-adjacent
chainAdjacentGridVerts.add(BL);
chainAdjacentGridVerts.add(BR);
chainAdjacentGridVerts.add(TL);
chainAdjacentGridVerts.add(TR);
```

**Step 2b — Return from `buildCDTOuterWall` and pass to `optimizeChainStrips`:**

Add `chainAdjacentVertices: Set<number>` to the return value of `buildCDTOuterWall`. In `ParametricExportComputer.ts`, pass it through:

```typescript
csResult = optimizeChainStrips({
    ...existing params,
    chainAdjacentVertices: cdtResult.chainAdjacentVertices, // NEW
});
```

**Step 2c — `optimizeChainStrips` detection already works:**

The existing UV-proximity detection code at [ChainStripOptimizer.ts line ~380](../../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L380):
```typescript
if (chainAdjacentVertices &&
    (chainAdjacentVertices.has(a) || chainAdjacentVertices.has(b) || chainAdjacentVertices.has(c))) {
    chainStripTriSet.add(t);
}
```
This already works — it just needs the set to be populated and passed.

**Files affected**:
- `OuterWallTessellator.ts`: ~10 lines — collect vertices, add to return value
- `ParametricExportComputer.ts`: ~2 lines — pass `chainAdjacentVertices` to optimizer
- No changes to `ChainStripOptimizer.ts` — existing code handles it

**Trade-offs**:
- **Pro**: Minimal code change, uses existing infrastructure
- **Pro**: Makes `optimizeChainStrips` see ALL super-cell tris, not just ones with chain vertices
- **Pro**: 3D quality improvement (using actual GPU-evaluated positions)
- **Con**: `optimizeChainStrips` may still not flip enough edges due to guard strictness
- **Con**: Boundary edges between chain-strip and standard regions remain un-flippable

**Assumptions** (for Verifier to attack):
1. The `chainAdjacentVertices` set correctly identifies all grid vertices in super-cells/chain-cells
2. `optimizeChainStrips` will find beneficial flips for the newly-visible triangles
3. No false positives: we won't accidentally mark standard-cell vertices as chain-adjacent

---

### Proposal 3: Post-Sweep UV Edge Flip Inside OWT (Moderate)

**Idea**: After `constrainedSweepCell` produces triangles for a super-cell or chain-cell, run a local UV-space Delaunay edge flip pass on just those triangles before they're committed to the index buffer.

**Mechanism**:

After `sweepQuad` fills the sub-quad triangles, run edge flips:

```typescript
function localDelaunayFlip(
    buf: number[],       // triangle indices to optimize (start..end range)
    startIdx: number,    // first index in buf to consider
    constraintEdges: Set<string>,  // edges that cannot be flipped
    verts: Float32Array,  // UV vertex data
): number {
    // Build local edge→tri adjacency for buf[startIdx..]
    // For each non-constraint interior edge shared by 2 tris:
    //   Compute inCircle test
    //   If flip improves Delaunay criterion: flip
    // Iterate until no more flips (max 3 passes)
}
```

Called inside `emitSuperCell` and `emitChainCell`:
```typescript
const triStart = indexBuf.length;
constrainedSweepCell(indexBuf, finalBot, finalTop, uniqueEdges, vertices);
const constraintSet = new Set(uniqueEdges.map(([a,b]) => edgeKeyStr(a,b)));
localDelaunayFlip(indexBuf, triStart, constraintSet, vertices);
```

**Mathematical basis**: Local Delaunay flipping on a 2D point set converges to the Delaunay triangulation in O(n²) flips. For small super-cells (typically 5-15 triangles), this is essentially free. The constraint edges prevent chain edges from being flipped.

**Files affected**: `OuterWallTessellator.ts` — new ~40-line helper function + ~5 lines per call site

**Trade-offs**:
- **Pro**: Produces UV-optimal triangulation before 3D positions are computed
- **Pro**: Handles the general case — works for any cell size, any vertex distribution
- **Pro**: Combined with Proposal 1, eliminates nearly all UV-space quality issues
- **Con**: UV-optimal may not be 3D-optimal (same limitation as Proposal 1)
- **Con**: More code complexity than Proposal 1 alone
- **Con**: Needs careful constraint edge handling to avoid flipping chain edges

**Assumptions** (for Verifier to attack):
1. Super-cells are small enough (5-15 tris) that local Delaunay flipping is fast
2. UV-space Delaunay is a good enough proxy for 3D quality
3. Constraint edge protection won't block beneficial flips (leaving quality holes)

---

### Proposal 4: Relax `optimizeChainStrips` Guards (Moderate)

**Idea**: The current guard thresholds in `optimizeChainStrips` may be too conservative, rejecting flips that would improve quality. Relax key guards for super-cell triangles specifically.

**Mechanism**:

1. **Row-span guard relaxation**: The current `tSpanLimit = min(origTExtent * 1.1 + maxSingleRowTSpan * 0.1, maxSingleRowTSpan * 2.5)` may be too tight for super-cells that span multiple columns (wider cells = wider T variation). For triangles identified as super-cell tris, increase the multiplier:
   ```typescript
   const isSuperCellTri = ...; // use chainAdjacentVertices
   const tSpanLimit = isSuperCellTri
       ? maxSingleRowTSpan * 3.5  // relaxed for multi-column super-cells
       : Math.min(origTExtent * 1.1 + maxSingleRowTSpan * 0.1, maxSingleRowTSpan * 2.5);
   ```

2. **Aspect ratio guard**: Currently rejects if `newAspect > 12.0 && newAspect > curAspect`. For super-cell tris starting at `37:1`, this means ANY flip that produces `> 12:1` is rejected even if it's a massive improvement (37 → 13). Change to `newAspect > curAspect * 0.9` for super-cell tris — only reject if new aspect is ≥ 90% of current.

3. **Angle floor**: Currently `MIN_ANGLE_FLOOR = 0.04 rad ≈ 2.3°`. With `min_angle = 1.7°` in current output, many beneficial flips are blocked because even the "improved" triangle has `< 2.3°` floor. Lower to `0.02 rad ≈ 1.1°` or remove the floor for pairs where current min-angle is already below it.

**Files affected**: `ChainStripOptimizer.ts` — ~10 lines of guard condition changes

**Trade-offs**:
- **Pro**: No new infrastructure needed
- **Pro**: Directly addresses "guards rejecting beneficial flips" problem
- **Con**: Relaxing guards increases risk of creating topological problems (inverted normals, cross-row artifacts)
- **Con**: Hard to tune — each guard protects against a specific failure mode

**Assumptions** (for Verifier to attack):
1. Guard rejects are a significant fraction of "could have been flipped" edges
2. Relaxing guards won't create worse problems than the slivers they're fixing
3. The current guard values were calibrated for old CDT strips and may be over-conservative for R34 cell-local geometry

---

### Proposal 5: Extend `flipEdges3D` With Non-Quad Mode (Radical)

**Idea**: Add a second pass to `flipEdges3D` that works on arbitrary triangle pairs (not quad-based). After the quad-based pass, iterate over all edges in the outer wall index buffer, find triangle pairs, and apply the same dihedral+angle criterion.

**Mechanism**:

After the existing quad-based loop, add:
```typescript
// Phase 2: Non-quad edge flips for super-cell triangles
const edge2tri = new Map<bigint, number[]>();
for (let t = 0; t < outerIdxCount; t += 3) {
    // Build edge→tri adjacency
    ...
}
for (const [ek, tris] of edge2tri) {
    if (tris.length !== 2) continue;
    if (constraintEdgeSet.has(ek)) continue;
    // Same quality criterion as quad-based pass
    // But uses actual triangle vertices instead of assumed vA/vB/vC/vD grid positions
    ...
}
```

**Files affected**: `MeshOptimizer.ts` — ~80-100 lines added to `flipEdges3D`

**Trade-offs**:
- **Pro**: Brings the full power of `flipEdges3D` to super-cell tris
- **Pro**: Uses 3D positions from GPU — optimal quality decisions
- **Con**: Significant code addition to an already complex function
- **Con**: Needs `constraintEdgeSet` passed to `flipEdges3D` (API change)
- **Con**: Overlaps with `optimizeChainStrips` — two systems doing the same job

**Assumptions** (for Verifier to attack):
1. The dihedral+angle criterion from `flipEdges3D` is better than the min-angle criterion in `optimizeChainStrips`
2. The API change to `flipEdges3D` won't break callers
3. The two-system overlap doesn't cause interference (one pass undoing the other's work)

---

## Recommended Approach

**Proposals 1 + 2 + 4 combined**, with Proposal 3 as a backup.

### Rationale

**Layer 1 — Proposal 1 (UV Delaunay tie-break)**: Fixes Root Cause 2 at the source. The `sweepQuad` `<=` bias creates systematically bad triangles that all downstream passes then struggle to fix. By making the initial triangulation better, we reduce the optimization burden on Phase 4 passes. **Estimated impact: 30-50% sliver reduction.**

**Layer 2 — Proposal 2 (Super-cell vertex marking)**: Fixes Root Cause 1. Currently, grid-only super-cell tris are invisible to ALL passes. This is the single biggest gap. By passing `chainAdjacentVertices`, we make `optimizeChainStrips` see ~100% of super-cell tris instead of ~60-70%. **Estimated impact: 20-40% additional sliver reduction.**

**Layer 3 — Proposal 4 (Guard relaxation)**: Fine-tunes the optimizer for the new R34 geometry. The guards were calibrated for old CDT strip geometry, which had different failure modes. R34's cell-local tris are structurally simpler and need less conservative protection. **Estimated impact: 10-20% additional sliver reduction.**

**Combined expected sliver rate: 5-10%** (from current 25.9%), with min_angle improving from 1.7° to 8-15° and max_aspect dropping from 37:1 to < 15:1.

### Why not Proposal 3

Proposal 3 (post-sweep UV edge flip) is elegant but redundant if Proposals 1+2+4 work. The UV Delaunay tie-break (P1) handles the initial quality, and the 3D edge flips (P2+P4) handle the UV→3D distortion. Adding UV-local flips in between adds complexity without clear marginal benefit. **Reserve as backup if P1+P2+P4 achieve < 50% of expected improvement.**

### Why not Proposal 5

Proposal 5 (extend `flipEdges3D`) creates a second 3D edge-flip system competing with `optimizeChainStrips`. This violates the single-responsibility principle. `optimizeChainStrips` already has constraint edge protection, valence tracking, and guard infrastructure purpose-built for chain-strip tris. Making it see all super-cell tris (P2) and tuning its guards (P4) is less risky than building a parallel system.

## Detailed Implementation Plan

### Phase 1: Proposal 2 — Super-Cell Vertex Marking (Do first — highest impact per line changed)

#### Step 1.1: Add `chainAdjacentGridVerts` set in OWT

**File**: `OuterWallTessellator.ts`  
**Location**: Inside `buildCDTOuterWall`, near line ~1000 (before cell emission loop)

```typescript
// R36: Track grid vertices in chain-cells and super-cells for optimizer visibility
const chainAdjacentGridVerts = new Set<number>();
```

#### Step 1.2: Populate in `emitChainCell`

**File**: `OuterWallTessellator.ts`  
**Location**: Inside `emitChainCell` closure, after computing BL/BR/TL/TR

```typescript
// R36: Mark grid corner vertices as chain-adjacent
chainAdjacentGridVerts.add(BL);
chainAdjacentGridVerts.add(BR);
chainAdjacentGridVerts.add(TL);
chainAdjacentGridVerts.add(TR);
```

#### Step 1.3: Populate in `emitSuperCell`

**File**: `OuterWallTessellator.ts`  
**Location**: Inside `emitSuperCell` closure, after building `finalBot`/`finalTop`

```typescript
// R36: Mark all grid vertices in super-cell as chain-adjacent
for (const v of finalBot) {
    if (v < gridVertexCount) chainAdjacentGridVerts.add(v);
}
for (const v of finalTop) {
    if (v < gridVertexCount) chainAdjacentGridVerts.add(v);
}
```

#### Step 1.4: Return from `buildCDTOuterWall`

**File**: `OuterWallTessellator.ts`  
**Location**: Return object, and the `CDTOuterWallResult` interface

Add `chainAdjacentVertices: Set<number>` to the interface and return value:
```typescript
chainAdjacentVertices: chainAdjacentGridVerts,
```

#### Step 1.5: Pass through in `ParametricExportComputer.ts`

**File**: `ParametricExportComputer.ts`  
**Location**: Line ~1529, the `optimizeChainStrips` call

```typescript
csResult = optimizeChainStrips({
    combinedIdxs,
    positions: resultData,
    combinedVerts,
    constraintEdgeSet,
    outerGridVertexCount,
    outerIdxCount,
    finalT,
    chainAdjacentVertices: cdtResult.chainAdjacentVertices, // R36
});
```

Also pass to `optimizeBoundaryDiagonals`:
```typescript
bdResult = optimizeBoundaryDiagonals({
    ...existing params,
    chainAdjacentVertices: cdtResult.chainAdjacentVertices, // R36
});
```

#### Step 1.6: Store `chainAdjacentVertices` from cdtResult

**File**: `ParametricExportComputer.ts`  
**Location**: After `outerChainEdges = cdtResult.chainEdges;` (line ~1337)

```typescript
let outerChainAdjacentVertices: Set<number> = new Set(); // R36
// ... inside the surf.id === 0 block:
outerChainAdjacentVertices = cdtResult.chainAdjacentVertices;
```

**Total lines changed**: ~15 across 2 files. Zero risk to existing tests.

---

### Phase 2: Proposal 1 — UV Delaunay Tie-Break

#### Step 2.1: Replace tie-break in `sweepQuad`

**File**: `OuterWallTessellator.ts`  
**Location**: `sweepQuad` function, line ~201

Replace:
```typescript
if (botNextU <= topNextU) {
    emitTriCCW(buf, bot[bi], bot[bi + 1], top[ti], verts);
    bi++;
} else {
    emitTriCCW(buf, top[ti], top[ti + 1], bot[bi], verts);
    ti++;
}
```

With:
```typescript
// R36: Quality-aware diagonal choice using 2D Delaunay criterion
const EPS = 1e-8;
if (botNextU < topNextU - EPS) {
    // Bot vertex clearly first in U — must advance bot
    emitTriCCW(buf, bot[bi], bot[bi + 1], top[ti], verts);
    bi++;
} else if (topNextU < botNextU - EPS) {
    // Top vertex clearly first in U — must advance top
    emitTriCCW(buf, top[ti], top[ti + 1], bot[bi], verts);
    ti++;
} else {
    // Tie-break zone: both advances valid, pick better diagonal
    // Candidate A: advance bot → tri(bot[bi], bot[bi+1], top[ti])
    // Candidate B: advance top → tri(top[ti], top[ti+1], bot[bi])
    // Choose the one with larger minimum angle (2D)
    const minA = minAngle2D(
        verts[bot[bi] * 3], verts[bot[bi] * 3 + 1],
        verts[bot[bi + 1] * 3], verts[bot[bi + 1] * 3 + 1],
        verts[top[ti] * 3], verts[top[ti] * 3 + 1],
    );
    const minB = minAngle2D(
        verts[top[ti] * 3], verts[top[ti] * 3 + 1],
        verts[top[ti + 1] * 3], verts[top[ti + 1] * 3 + 1],
        verts[bot[bi] * 3], verts[bot[bi] * 3 + 1],
    );
    if (minA >= minB) {
        emitTriCCW(buf, bot[bi], bot[bi + 1], top[ti], verts);
        bi++;
    } else {
        emitTriCCW(buf, top[ti], top[ti + 1], bot[bi], verts);
        ti++;
    }
}
```

#### Step 2.2: Add `minAngle2D` helper

**File**: `OuterWallTessellator.ts`  
**Location**: Near `emitTriCCW` (before `sweepQuad`)

```typescript
/** Minimum interior angle of a 2D triangle (radians). Returns 0 for degenerate. */
function minAngle2D(
    ax: number, ay: number,
    bx: number, by: number,
    cx: number, cy: number,
): number {
    const abx = bx - ax, aby = by - ay;
    const acx = cx - ax, acy = cy - ay;
    const bcx = cx - bx, bcy = cy - by;
    const lab = Math.sqrt(abx * abx + aby * aby);
    const lac = Math.sqrt(acx * acx + acy * acy);
    const lbc = Math.sqrt(bcx * bcx + bcy * bcy);
    if (lab < 1e-12 || lac < 1e-12 || lbc < 1e-12) return 0;
    const cosA = (abx * acx + aby * acy) / (lab * lac);
    const cosB = (-abx * bcx - aby * bcy) / (lab * lbc);
    const cosC = (acx * bcx + acy * bcy) / (lac * lbc);
    return Math.min(
        Math.acos(Math.max(-1, Math.min(1, cosA))),
        Math.acos(Math.max(-1, Math.min(1, cosB))),
        Math.acos(Math.max(-1, Math.min(1, cosC))),
    );
}
```

**Total lines changed**: ~35 in `OuterWallTessellator.ts`. Low risk — `sweepQuad` behavior changes only at tie-break points (about 50% of iterations on a regular grid).

**Unit test update**: `sweepQuad` tests may need updated expected triangle counts/orders if the tie-break changes output. Existing winding correctness tests should still pass since `emitTriCCW` handles winding.

---

### Phase 3: Proposal 4 — Guard Relaxation

#### Step 3.1: Identify super-cell tris in guard logic

**File**: `ChainStripOptimizer.ts`  
**Location**: Phase A loop, after `decodeEdge`

```typescript
// R36: Check if either triangle is from a super-cell (has a chain-adjacent grid vertex)
const isSuperCellEdge = chainAdjacentVertices && (
    chainAdjacentVertices.has(shLo) || chainAdjacentVertices.has(shHi) ||
    chainAdjacentVertices.has(opp0) || chainAdjacentVertices.has(opp1)
);
```

#### Step 3.2: Relax row-span guard for super-cells

**File**: `ChainStripOptimizer.ts`  
**Location**: `rowSpanExceeds` function

Pass a `relaxed` parameter. When true, use `maxSingleRowTSpan * 3.5` instead of `* 2.5`:
```typescript
const rowSpanExceeds = (shLo, shHi, opp0, opp1, relaxed = false): boolean => {
    ...
    const tSpanLimit = relaxed
        ? maxSingleRowTSpan * 3.5
        : Math.min(origTExtent * 1.1 + maxSingleRowTSpan * 0.1, maxSingleRowTSpan * 2.5);
    return maxNewTSpan > tSpanLimit;
};
```

#### Step 3.3: Relax aspect ratio guard for super-cells

**File**: `ChainStripOptimizer.ts`  
**Location**: Phase A, aspect ratio check

```typescript
// Current: if (newAspect > 12.0 && newAspect > curAspect) continue;
// R36: For super-cell tris, only reject if new aspect is >= 80% of current
if (isSuperCellEdge) {
    if (newAspect > curAspect * 0.8) continue;
} else {
    if (newAspect > 12.0 && newAspect > curAspect) continue;
}
```

#### Step 3.4: Lower angle floor for already-bad triangles

**File**: `ChainStripOptimizer.ts`  
**Location**: Phase A, angle floor check

```typescript
// Current: if (flipMin < MIN_ANGLE_FLOOR && flipMin < curMin) continue;
// R36: If current min-angle is already below floor, any improvement is welcome
if (flipMin < MIN_ANGLE_FLOOR && flipMin < curMin && curMin >= MIN_ANGLE_FLOOR) continue;
```

This change applies globally, not just to super-cells: if the current triangle pair already has min-angle below the floor, don't reject a flip that improves it (even if the result is still below floor).

**Total lines changed**: ~20 in `ChainStripOptimizer.ts`. Moderate risk — guard relaxation must be validated carefully to ensure no topology regressions.

---

## Chain Edge Constraint Protection

All three proposals preserve chain edge constraints:

1. **Proposal 1**: `sweepQuad` doesn't flip edges — it creates triangles. The `constrainedSweepCell` partitioning ensures chain edges fall on triangle boundaries. The tie-break change only affects which diagonal is chosen within a partition sub-quad. Chain edges define partition boundaries, not diagonals.

2. **Proposal 2**: `optimizeChainStrips` already has constraint edge protection via `constraintEdgeSet.has(ek)` on every flip candidate (6 checks across phases A/B/C). Making more triangles visible to the optimizer doesn't change the protection logic.

3. **Proposal 4**: Guard relaxation doesn't touch constraint edge checks. The `constraintEdgeSet.has(ek)` guards are separate from the row-span/aspect/angle guards being relaxed.

**Chain edge enforcement remains non-negotiable: 0 missing chain edges.**

## Validation Protocol

### Pre-Implementation Baseline
Run Gothic Arches export, record:
- Chain edge enforcement: must stay at 6172/6172 (0 missing)
- Chain-strip sliver rate (AR > 4:1)
- min_angle, max_aspect
- Grading violations
- Cross-row triangles
- Non-manifold edges
- Total triangle count (should not change significantly)

### After Each Phase

**Phase 1 (Proposal 2 — vertex marking):**
- [ ] Tests pass: `npm test` (1879 tests)
- [ ] Chain edges: 0 missing
- [ ] `chainStripTriCount` in optimizer output INCREASES (more tris visible)
- [ ] Sliver rate decreases
- [ ] No new non-manifold edges

**Phase 2 (Proposal 1 — Delaunay tie-break):**
- [ ] Tests pass
- [ ] Chain edges: 0 missing
- [ ] Sliver rate decreases further
- [ ] min_angle improves
- [ ] Standard-cell quality unchanged (tie-break only affects `sweepQuad` in chain/super cells, but standard cells also use `sweepQuad` trivially — verify no regression)

**Phase 3 (Proposal 4 — guard relaxation):**
- [ ] Tests pass
- [ ] Chain edges: 0 missing
- [ ] Sliver rate decreases further
- [ ] No new cross-row triangles (row-span relaxation must be tested carefully)
- [ ] max_aspect decreases
- [ ] No new non-manifold edges

### Final Acceptance Criteria
- Sliver rate (AR > 4:1): **< 10%** (stretch goal: < 5%)
- min_angle: **> 8°** (stretch goal: > 15°)
- max_aspect: **< 15:1** (stretch goal: < 10:1)
- Cross-row triangles: **0**
- Non-manifold edges: **0**
- Chain edge enforcement: **0 missing**
- All existing tests pass

## Blast Radius / Risk Assessment

| Phase | Files | Lines Changed | Risk | Reversibility |
|---|---|---|---|---|
| Phase 1 (P2) | OWT + PEC | ~15 | **Very Low** — only adds data, no behavior change to triangulation | Trivial — remove param |
| Phase 2 (P1) | OWT | ~35 | **Low** — changes `sweepQuad` behavior at tie-break points only | Revert `sweepQuad` |
| Phase 3 (P4) | CSO | ~20 | **Moderate** — guard relaxation may allow flips that create topology issues | Revert guard values |

**Total blast radius**: 3 files, ~70 lines. All changes are independently reversible. Phases can be deployed incrementally.

**Highest risk**: Phase 3 guard relaxation. The row-span relaxation (2.5→3.5 for super-cells) could allow cross-row triangles if the limit is too loose. The aspect-ratio relaxation (12.0 hard cap → 80% of current) could allow creation of moderate slivers if the flip doesn't improve enough. **Mitigation**: Run full export validation after Phase 3 specifically looking for cross-row and topology regressions.

## Open Questions

1. **What fraction of super-cell tris have all-grid vertices?** If it's > 30%, Phase 1 (vertex marking) is critical. If < 5%, Phase 1 helps less and Phases 2+3 carry more weight. The Verifier should check this by inspection or by adding a diagnostic counter.

2. **Do standard cells ever go through `sweepQuad` with ties?** Standard cells call `emitStandardCell` which emits 2 fixed triangles without calling `sweepQuad`. So Phase 2's Delaunay tie-break only affects chain-cells and super-cells. The Verifier should confirm this — if standard cells DO call `sweepQuad`, Phase 2 has broader impact (could be positive or needs care).

3. **Are `optimizeChainStrips` boundary edges (1-tri adjacency) a significant limiting factor?** If many super-cell tri edges are boundaries (shared with standard cells), `optimizeChainStrips` can't flip them regardless of guard settings. The Verifier should estimate the fraction of interior vs boundary edges in the chain-strip region.

4. **Phase 3 guard relaxation values**: The specific numbers (3.5× row-span, 0.8× aspect) are educated guesses. The Verifier should attack these with worst-case geometry scenarios.

5. **Should `emitStandardCell` also use `sweepQuad`?** Currently it directly emits 2 triangles. If the grid is non-uniform (CDF-adaptive), the fixed diagonal may not be optimal. This is out of scope for R36 but worth noting.
