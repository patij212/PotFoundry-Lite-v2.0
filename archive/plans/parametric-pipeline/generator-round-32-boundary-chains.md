# Generator Round 32 — Boundary Chain CDT Architecture
Date: 2026-03-07

## Problem Statement

R31 (boundary companions + column constraints) is insufficient. The CDT-to-grid transition remains visibly poor because mid-row grid vertices at `segStart`/`segEnd` are **interior Steiner points** in the CDT. Interior points at normalized U=0 lie exactly on the left boundary constraint edge `stripBot[0] → stripTop[0]`, forcing cdt2d to produce degenerate slivers spanning from the hull edge to the nearest interior companion. No amount of companion injection or constraint enrichment fixes this — the fundamental geometry is wrong.

The fix: make these grid vertices **boundary vertices** of the CDT polygon by incorporating them into the left/right edge chains of the boundary polygon.

## Root Cause Analysis (Summary)

Current CDT boundary polygon in `cdtTriangulateStrip()` ([ChainStripTriangulator.ts](../../src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L147)):

```
Bottom: bot[0] ──── bot[1] ─── ... ─── bot[N]
                                            │
Left:   bot[0] ──── topLeft       Right:    botRight ── topRight
                                            │
Top:    top[0] ──── top[1] ─── ... ─── top[M]
```

Left/right boundaries are **single edges** (line ~258):
```typescript
addEdge(botLeftLocal, topLeftLocal);
addEdge(botRightLocal, topRightLocal);
```

Mid-row grid vertices at `col === segStart` land in `stripInteriorVerts` ([OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1462)) and are registered via `addVertex()` as interior Steiner points. After normalization, they sit at U=0 — exactly ON the left boundary edge. CDT2d splits this edge at each collinear point, producing per-band sub-edges that must triangulate to the nearest interior vertex. With the companion desert near the boundary (R31 analysis confirmed: T-Ladder's `SHELL_FRACTIONS` max at 0.25 of half-width), the slivers are inevitable.

## Architectural Change

### Current (broken):
```
CDT boundary:
  Bottom: stripBot[0] → ... → stripBot[N]
  Right:  stripBot[N] ────────────────────→ stripTop[M]   (single edge)
  Top:    stripTop[M] → ... → stripTop[0]
  Left:   stripTop[0] ────────────────────→ stripBot[0]   (single edge)

Mid-row grid verts at segStart/segEnd → stripInteriorVerts (interior Steiner)
```

### Required (correct):
```
CDT boundary:
  Bottom: stripBot[0] → ... → stripBot[N]
  Right:  stripBot[N] → rightChain[0] → ... → rightChain[K] → stripTop[M]
  Top:    stripTop[M] → ... → stripTop[0]
  Left:   stripTop[0] → leftChain[0]  → ... → leftChain[K]  → stripBot[0]

Mid-row grid verts at segStart/segEnd → leftChain/rightChain (BOUNDARY vertices)
NOT in stripInteriorVerts
```

Where:
- `leftChain[k]` = grid vertex at `(localJTop - 1 - k) * numU + segStart` for k = 0..localJTop-localJ-2
  - The chain runs **top→bot** in T order (T descending), matching the CCW polygon winding: top boundary goes left, left boundary descends.
- `rightChain[k]` = grid vertex at `(localJ + 1 + k) * numU + segEnd` for k = 0..localJTop-localJ-2
  - The chain runs **bot→top** in T order (T ascending), matching the winding: bottom boundary goes right, right boundary ascends.

These vertices are at fixed positions: T = `activeTPositions[row]`, U = `unionU[segStart]` (or `segEnd`). They are **collinear** (same U) but at distinct T-values. This creates a proper closed polygon where every vertex is a boundary vertex.

---

## Proposals

### Proposal 1: Boundary Chain Promotion (Recommended)

**Idea**: Divert mid-row grid vertices at segStart/segEnd from `stripInteriorVerts` into separate `leftBoundaryChain` / `rightBoundaryChain` arrays. Pass these into `triangulateChainStrip()` → `cdtTriangulateStrip()`. Replace the single left/right boundary edges with segmented chains through these vertices.

**Mechanism**: Two files change: OuterWallTessellator (routing change) and ChainStripTriangulator (boundary construction change).

---

#### Change 1: ChainStripTriangulator.ts — Interface Extension

**File**: [ChainStripTriangulator.ts](../../src/renderers/webgpu/parametric/ChainStripTriangulator.ts)

##### 1a. `triangulateChainStrip()` signature (line 102)

Add two new parameters after `interiorVerts`:

```typescript
export function triangulateChainStrip(
    buf: number[],
    bot: StripVertex[],
    top: StripVertex[],
    constraints: Array<[number, number]>,
    interiorVerts: StripVertex[],
    leftBoundary: StripVertex[],   // NEW: boundary vertices along left edge (top→bot T-order)
    rightBoundary: StripVertex[],  // NEW: boundary vertices along right edge (bot→top T-order)
    chainVerts: ChainVertex[],
    gridVCount: number,
    tBot: number,
    tTop: number,
    config: ChainStripConfig,
    stats: ChainStripStats,
    potGeometry?: PotGeometryParams,
): void
```

**Rationale**: Placing them after `interiorVerts` and before `chainVerts` groups all vertex inputs together. `leftBoundary` and `rightBoundary` are structural (boundary polygon), distinct from `interiorVerts` (free Steiner points).

**All callers must update**: The `switch` body at line 120-135 must pass the arrays to `cdtTriangulateStrip`. The `sweep` and `sweep-repair` modes receive them but ignore them (see §1d below).

##### 1b. `cdtTriangulateStrip()` signature (line 147)

Add matching parameters:

```typescript
function cdtTriangulateStrip(
    buf: number[],
    bot: StripVertex[],
    top: StripVertex[],
    constraints: Array<[number, number]>,
    interiorVerts: StripVertex[],
    leftBoundary: StripVertex[],   // NEW
    rightBoundary: StripVertex[],  // NEW
    chainVerts: ChainVertex[],
    gridVCount: number,
    tBot: number,
    tTop: number,
    stats: ChainStripStats,
    potGeometry?: PotGeometryParams,
): void
```

##### 1c. Boundary construction change in `cdtTriangulateStrip()` (lines ~253-259)

**Current code** (lines 253-259):
```typescript
const botLeftLocal = globalToLocal.get(bot[0].idx)!;
const botRightLocal = globalToLocal.get(bot[bot.length - 1].idx)!;
const topLeftLocal = globalToLocal.get(top[0].idx)!;
const topRightLocal = globalToLocal.get(top[top.length - 1].idx)!;
addEdge(botLeftLocal, topLeftLocal);
addEdge(botRightLocal, topRightLocal);
```

**Replace with**:
```typescript
const botLeftLocal = globalToLocal.get(bot[0].idx)!;
const botRightLocal = globalToLocal.get(bot[bot.length - 1].idx)!;
const topLeftLocal = globalToLocal.get(top[0].idx)!;
const topRightLocal = globalToLocal.get(top[top.length - 1].idx)!;

// Left boundary chain: topLeft → leftBoundary[0] → ... → leftBoundary[N] → botLeft
// Winding: top row goes left-to-right, left edge descends (CCW polygon)
if (leftBoundary.length > 0) {
    let prevLocal = topLeftLocal;
    for (const sv of leftBoundary) {
        const local = addVertex(sv.idx, sv.u, sv.promotedT!);
        addEdge(prevLocal, local);
        prevLocal = local;
    }
    addEdge(prevLocal, botLeftLocal);
} else {
    addEdge(topLeftLocal, botLeftLocal);
}

// Right boundary chain: botRight → rightBoundary[0] → ... → rightBoundary[N] → topRight
// Winding: bottom row goes left-to-right, right edge ascends (CCW polygon)
if (rightBoundary.length > 0) {
    let prevLocal = botRightLocal;
    for (const sv of rightBoundary) {
        const local = addVertex(sv.idx, sv.u, sv.promotedT!);
        addEdge(prevLocal, local);
        prevLocal = local;
    }
    addEdge(prevLocal, topRightLocal);
} else {
    addEdge(botRightLocal, topRightLocal);
}
```

**Key details**:
1. `addVertex` is the existing closure (line ~193). It deduplicates by global index via `globalToLocal`, so if a boundary vertex was already registered (e.g., via constraint endpoint rescue), it returns the existing local index. No double-registration.
2. `sv.promotedT!` is guaranteed non-undefined because we set it during collection in OWT. The non-null assertion is safe here.
3. The `addEdge` function (line ~231) deduplicates by edge key, so if a boundary column constraint was already added from `segConstraints`, it won't create a duplicate.
4. When `leftBoundary` is empty (single-band strip: `localJTop - localJ == 1`, so no mid-rows), the fallback is the original single edge. **No behavior change for single-band strips.**

##### 1d. Sweep and sweep-repair pass-through

`sweepTriangulateStrip` and `sweepRepairTriangulateStrip` signatures do NOT change. The `leftBoundary`/`rightBoundary` arrays are consumed only by CDT mode. In the `switch` at line 120:

```typescript
case 'cdt':
    cdtTriangulateStrip(buf, bot, top, constraints, interiorVerts,
        leftBoundary, rightBoundary,  // NEW
        chainVerts, gridVCount, tBot, tTop, stats, potGeometry);
    break;
case 'sweep':
    // leftBoundary/rightBoundary ignored — sweep uses bot/top only
    sweepTriangulateStrip(buf, bot, top, constraints, chainVerts, gridVCount, tBot, tTop, stats);
    break;
case 'sweep-repair':
    // leftBoundary/rightBoundary ignored — sweep-repair uses bot/top only
    sweepRepairTriangulateStrip(buf, bot, top, constraints, chainVerts, gridVCount, tBot, tTop, stats);
    break;
```

**Rationale**: Sweep modes don't use CDT or boundary polygons. The boundary chain vertices are implicitly handled by the grid cells adjacent to the strip in sweep mode — no action needed.

---

#### Change 2: OuterWallTessellator.ts — Mid-row Grid Vertex Routing

**File**: [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts)

##### 2a. Declare boundary chain arrays (after line 1376, near `stripInteriorVerts` declaration)

```typescript
const stripInteriorVerts: StripVertex[] = [];
const leftBoundaryChain: StripVertex[] = [];   // NEW
const rightBoundaryChain: StripVertex[] = [];  // NEW
```

##### 2b. Modify mid-row grid vertex filter (lines 1460-1475)

**Current code** (lines 1460-1475):
```typescript
for (const midRow of midRows) {
    for (const sv of midRow.verts) {
        if (sv.u >= uStripLeft - 1e-9 && sv.u <= uStripRight + 1e-9) {
            if (sv.idx < gridVertexCount) {
                const col = sv.idx % numU;
                if (col !== segStart && col !== segEnd) {
                    stripGridInteriorSkipCount++;
                    continue;
                }
            }
            stripInteriorVerts.push({
                idx: sv.idx, u: sv.u, isChain: sv.isChain,
                gridCol: sv.gridCol,
                promotedT: activeTPositions[midRow.row],
            });
        }
    }
}
```

**Replace with**:
```typescript
for (const midRow of midRows) {
    for (const sv of midRow.verts) {
        if (sv.u >= uStripLeft - 1e-9 && sv.u <= uStripRight + 1e-9) {
            if (sv.idx < gridVertexCount) {
                const col = sv.idx % numU;
                if (col === segStart) {
                    // R32: Promote to left boundary chain vertex (not interior Steiner)
                    leftBoundaryChain.push({
                        idx: sv.idx, u: sv.u, isChain: false,
                        gridCol: col, promotedT: activeTPositions[midRow.row],
                    });
                    continue;
                }
                if (col === segEnd) {
                    // R32: Promote to right boundary chain vertex (not interior Steiner)
                    rightBoundaryChain.push({
                        idx: sv.idx, u: sv.u, isChain: false,
                        gridCol: col, promotedT: activeTPositions[midRow.row],
                    });
                    continue;
                }
                // Interior grid vertices — skip entirely (strip independence)
                stripGridInteriorSkipCount++;
                continue;
            }
            // Non-grid vertices (chain/companion) route to interior as before
            stripInteriorVerts.push({
                idx: sv.idx, u: sv.u, isChain: sv.isChain,
                gridCol: sv.gridCol,
                promotedT: activeTPositions[midRow.row],
            });
        }
    }
}
```

**Important**: `midRows` iterates row indices from `localJ + 1` to `localJTop - 1` in **ascending** order. So `leftBoundaryChain` accumulates in **ascending T-order** (bot→top). For the left boundary (which must be in **top→bot = descending T-order** to match CCW winding), we reverse it before passing to `triangulateChainStrip`. Similarly, `rightBoundaryChain` accumulates in ascending T-order which is correct for the right boundary (bot→top).

##### 2c. Sort and orient boundary chains (after the midRows loop, before the call to triangulateChainStrip)

```typescript
// R32: Sort boundary chains by T (ascending), then orient for polygon winding.
// leftBoundaryChain: collected in ascending T-order from midRows loop.
// Required: top→bot (descending T) for CCW left-edge winding.
// Reverse in-place.
leftBoundaryChain.sort((a, b) => a.promotedT! - b.promotedT!);
leftBoundaryChain.reverse();  // Now descending T (top→bot)

// rightBoundaryChain: collected in ascending T-order — already correct for
// CCW right-edge winding (bot→top ascending T).
rightBoundaryChain.sort((a, b) => a.promotedT! - b.promotedT!);
```

**Why explicit sort?** `midRows` iterates `localJ+1..localJTop-1` in ascending order, producing ascending T naturally. But `buildMergedRow` may include chain vertices at different T-positions in the same row. The explicit sort is a safety net. In practice, each midRow contributes exactly one grid vertex per boundary column, so the sort is a no-op.

##### 2d. Pass boundary chains to `triangulateChainStrip` (line ~1762)

**Current call** (line 1758-1766):
```typescript
triangulateChainStrip(
    indexBuf, stripBot, stripTop, segConstraints,
    stripInteriorVerts,
    allChainVertices, gridVertexCount,
    tBot, tTop,
    chainStripConfig, chainStripStats,
    potGeometry,
);
```

**Replace with**:
```typescript
triangulateChainStrip(
    indexBuf, stripBot, stripTop, segConstraints,
    stripInteriorVerts,
    leftBoundaryChain,    // NEW: R32 boundary vertices
    rightBoundaryChain,   // NEW: R32 boundary vertices
    allChainVertices, gridVertexCount,
    tBot, tTop,
    chainStripConfig, chainStripStats,
    potGeometry,
);
```

---

#### Change 3: Interaction with R31 Boundary Companions and Column Constraints

##### 3a. R31 Boundary Companions (lines ~1635-1670): KEEP

The R31 boundary companion injection emits Steiner points at `0.3 * colGap` inward from each boundary column at the band T-midpoint. With R32, these companions are no longer at the mercy of a degenerate left-boundary constraint. Instead, the CDT boundary polygon has proper segmented edges at the boundary columns, and the boundary companions become **well-positioned interior Steiner points** that the CDT can connect to the boundary chain vertices with well-formed triangles.

**No change needed. R31 companions become MORE useful with R32, not less.**

##### 3b. R31 Boundary Column Constraints (lines ~1675-1695): KEEP (belt-and-suspenders)

The boundary column constraints add `segConstraints` entries for `[m*numU+bndCol, (m+1)*numU+bndCol]`. With R32, these same edges are now explicitly in the boundary polygon (via `leftBoundaryChain`). The `addEdge` dedup in `cdtTriangulateStrip` will skip duplicates. No harm, slight safety benefit if the boundary chain construction has a gap.

**No change needed. The constraint dedup prevents double-counting.**

##### 3c. Boundary chain arrays must be reset per-segment

`leftBoundaryChain` and `rightBoundaryChain` are declared inside the segment loop (per-segment scope). They are fresh arrays for each CDT strip. No stale data risk.

---

## CDT2d Collinearity Analysis (Critical)

### The Question

Left boundary chain vertices all have U = `unionU[segStart]`. After CDT normalization, this maps to `(unionU[segStart] - uMin) / uRange`. Since `uMin = Math.min(bot[0].u, top[0].u)` and both `bot[0]` and `top[0]` are at `unionU[segStart]`, this gives normalized U = **0** for all left boundary vertices.

All left boundary vertices (including `botLeft` and `topLeft`) are at normalized U = 0, with varying normalized T-values. They are **collinear** — all on the vertical line x=0 in CDT coordinate space.

**Will cdt2d handle this correctly?**

### Analysis

**cdt2d's monotone sweep** ([monotone.js](../../node_modules/cdt2d/lib/monotone.js)):

The sweep processes events sorted by x-coordinate (U). Constraint edges with `a[0] === b[0]` (same x) are neither START nor END events — they are **silently skipped** (Verifier C3 from R31). This means the left boundary chain constraint edges between collinear vertices are not processed as active sweep events.

**However**, cdt2d still adds all vertices to the triangulation. The `delaunay-refine` step ensures constraint edges are preserved by preventing flips that would destroy them. Since the left boundary vertices are on the convex hull (minimum x = 0), the initial Delaunay triangulation naturally creates edges between consecutive hull vertices. The constraint edges coincide with these natural hull edges, so no flip prevention is needed — the edges exist by default.

**Key insight**: For boundary vertices on the convex hull, collinear constraint edges are **automatically satisfied** by the Delaunay triangulation itself. The monotone sweep's silent skipping is irrelevant because the hull geometry already produces the correct edges.

### Numerical Stability Concern

When all left boundary vertices are at exactly x=0, the Delaunay triangulation must distinguish them by y-coordinate (T) only. For `robust-predicates` (used by cdt2d for geometric predicates), collinear points at identical x-values are handled correctly — the orientation test returns 0 (collinear) and the `incircle` test is exact. However, some sweep implementations have trouble with vertically-aligned points due to the x-sort breaking ties by y.

**Mitigation (Proposal 1A — optional)**: Apply a tiny U-perturbation of `+1e-9` to left boundary chain vertices in `addVertex` to break exact collinearity while being geometrically invisible:

```typescript
// In cdtTriangulateStrip, within the leftBoundary loop:
const local = addVertex(sv.idx, sv.u + 1e-9, sv.promotedT!);
```

This makes boundary chain vertices at U = unionU[segStart] + 1e-9, still effectively on the boundary but not exactly collinear with bot[0]/top[0]. At normalized scale, this perturbation is `1e-9 / uRange ≈ 1e-6 to 1e-7` — invisible in the mesh but sufficient to break degeneracy.

**Recommendation**: Start WITHOUT the perturbation. If cdt2d produces degenerate output for specific pots (detectable via `stats.minAngleUV < 1°`), add the perturbation as a targeted fix. The convex-hull mechanism should handle the common case.

---

## Winding Direction Analysis

### CCW Polygon Winding Convention

cdt2d expects a CCW-wound boundary polygon (when `exterior: true`, it classifies triangles by side). The CDT strip polygon traverses:

```
Bottom (left→right): bot[0] ──U increasing──→ bot[N]
Right  (bot→top):    bot[N] ──T increasing──→ top[M]
Top    (right→left): top[M] ──U decreasing──→ top[0]
Left   (top→bot):    top[0] ──T decreasing──→ bot[0]
```

This traces a **counter-clockwise** rectangle in (U, T) space (U=x, T=y), which is `+z` in the cross-product sense. Correct for CCW convention.

### Boundary Chain Vertex Order

**Left boundary** (top→bot): After transitioning from `top[0]` at T=tTop, the left chain descends through intermediate T-values to reach `bot[0]` at T=tBot.

Required order: **descending T** (tTop → tBot direction).
- `leftBoundaryChain[0]`: highest T (row closest to topRow) = grid vertex at row `(localJTop - 1)` → T = `activeTPositions[localJTop - 1]`
- `leftBoundaryChain[K]`: lowest T (row closest to botRow) = grid vertex at row `(localJ + 1)` → T = `activeTPositions[localJ + 1]`

Since mid-rows span from `localJ+1` to `localJTop-1`:
```
leftBoundaryChain = [
    gridVertex(localJTop-1, segStart),  // T = activeTPositions[localJTop-1]
    gridVertex(localJTop-2, segStart),  // T = activeTPositions[localJTop-2]
    ...
    gridVertex(localJ+1, segStart),     // T = activeTPositions[localJ+1]
]
```

**Right boundary** (bot→top): After the bottom row at T=tBot, the right chain ascends through intermediate T-values to reach `top[M]` at T=tTop.

Required order: **ascending T** (tBot → tTop direction).
- `rightBoundaryChain[0]`: lowest T (row closest to botRow) = grid vertex at row `(localJ + 1)` → T = `activeTPositions[localJ + 1]`
- `rightBoundaryChain[K]`: highest T (row closest to topRow) = grid vertex at row `(localJTop - 1)` → T = `activeTPositions[localJTop - 1]`

```
rightBoundaryChain = [
    gridVertex(localJ+1, segEnd),       // T = activeTPositions[localJ+1]
    gridVertex(localJ+2, segEnd),       // T = activeTPositions[localJ+2]
    ...
    gridVertex(localJTop-1, segEnd),    // T = activeTPositions[localJTop-1]
]
```

---

## T-Junction Prevention Analysis

### The Critical Invariant

Adjacent standard grid cells at column `segStart - 1` (outside the CDT strip) share grid vertex indices with the CDT strip at column `segStart`. Specifically:

- Standard cell `(b, segStart - 1)` uses corner vertices:
  - `BL = b * numU + (segStart - 1)`
  - `BR = b * numU + segStart`       ← shared with CDT
  - `TL = (b+1) * numU + (segStart - 1)`
  - `TR = (b+1) * numU + segStart`   ← shared with CDT

- CDT strip uses boundary vertices:
  - `stripBot[0].idx = localJ * numU + segStart`
  - Left boundary chain includes `(localJ+1)*numU + segStart`, ..., `(localJTop-1)*numU + segStart`
  - `stripTop[0].idx = localJTop * numU + segStart`

For band `b` where `localJ ≤ b < localJTop`:
- Grid `BR` = `b * numU + segStart`
- Grid `TR` = `(b+1) * numU + segStart`
- These are IDENTICAL vertex indices to the CDT's boundary chain vertices (for intermediate bands) or stripBot/stripTop vertices (for first/last bands).

**T-junction safety**: Because the CDT boundary polygon includes constraint edges between consecutive boundary chain vertices `(b*numU+segStart) → ((b+1)*numU+segStart)`, the CDT is FORCED to have a triangle edge at this exact position. The adjacent standard grid cell also has an edge at this position (as part of its quad diagonal). Same vertex indices = shared edge = no T-junction. ✓

### What if the CDT "flips" the boundary edge?

Boundary edges are CONSTRAINT edges (added via `addEdge`). cdt2d CANNOT flip constrained edges. The edge between `gridVertex(b, segStart)` and `gridVertex(b+1, segStart)` is enforced in the triangulation. ✓

---

## Edge Cases

### E1: Single-band strip (localJTop - localJ == 1)

No mid-rows exist. `leftBoundaryChain` and `rightBoundaryChain` are empty. The fallback in `cdtTriangulateStrip` emits the original single-edge boundaries. **No behavior change.**

### E2: Multi-band strip (localJTop - localJ > 1)

The typical case. Each intermediate row contributes one vertex to each boundary chain (at segStart and segEnd). With 3 bands (localJTop - localJ = 3), each chain has 2 vertices. The boundary polygon becomes an octagon (4 corners + 2×2 chain vertices).

### E3: Strip spanning all T-rows

If the strip spans all rows (localJ = 0, localJTop = numT - 1), the boundary chains include ALL intermediate row vertices. The boundary polygon has `2 × (numT - 2)` extra vertices. For numT = 100, this is 196 boundary vertices. The CDT handles this efficiently — they're all on the convex hull.

### E4: Seam crossing (unionU wraps)

The strip assembly code already breaks segments at seam columns (line ~1303, `SEAM_GUARD` check). Boundary chains are per-segment, so they don't cross the seam.

### E5: Bot/top at different U values

If `bot[0].u ≠ top[0].u` (chain vertex at strip start has different U than grid vertex), the left boundary isn't strictly vertical — it goes from `(top[0].u, tTop)` through `(unionU[segStart], T_mid_1)` ... to `(bot[0].u, tBot)`. This is a valid simple polygon as long as the U-values are close (they differ by at most one column width). The CDT handles non-convex boundaries correctly.

### E6: Batch2Remap'd vertices

Some chain vertices at segStart/segEnd positions are replaced by grid vertex indices via `batch2Remap`. These appear in the mid-row merged row as grid vertices. Since `sv.idx < gridVertexCount` and `sv.idx % numU === segStart`, they are correctly routed to the boundary chain (not `stripInteriorVerts`). **batch2Remap transparency is preserved.**

---

## Test Impact

### Existing tests (131 total)

The `triangulateChainStrip` signature change adds two parameters. All existing test calls pass `[]` (empty arrays) for `leftBoundary` and `rightBoundary` unless the test specifically constructs multi-band scenarios. Most tests create single-band strips (bot + top, no mid-rows), so empty boundary chains give identical behavior.

**Required test changes**:
1. All `triangulateChainStrip()` calls in `ChainStripTriangulator.test.ts` must add two `[]` arguments after `interiorVerts`.
2. The OWT tests that exercise multi-band CDT strips verify the output mesh via triangle count and watertightness checks — they should still pass because the boundary chain promotion produces the same (or better) triangles covering the same vertex set.

### New tests to add

1. **Boundary chain basic**: Create a 3-band (4-row) strip with boundary chain vertices. Verify triangles connect boundary chain vertices to interior vertices, not as degenerate slivers.
2. **Boundary chain winding**: Verify all output triangles are CCW in UV space.
3. **Empty boundary chain fallback**: Verify single-band strip produces identical output with `[]` boundary chains.

---

## Summary of Changes

| Location | Change | Lines | Risk |
|----------|--------|-------|------|
| `ChainStripTriangulator.ts` line 102 | Add `leftBoundary`, `rightBoundary` params to `triangulateChainStrip` | +2 | None |
| `ChainStripTriangulator.ts` line 120-135 | Pass boundary arrays to `cdtTriangulateStrip` in switch | +2 | None |
| `ChainStripTriangulator.ts` line 147 | Add params to `cdtTriangulateStrip` | +2 | None |
| `ChainStripTriangulator.ts` lines 253-259 | Replace single-edge boundaries with chain construction | +18, -2 | Low |
| `OuterWallTessellator.ts` line 1376 | Declare `leftBoundaryChain`, `rightBoundaryChain` | +2 | None |
| `OuterWallTessellator.ts` lines 1460-1475 | Route segStart/segEnd grid verts to boundary chains | +12, -4 | Low |
| `OuterWallTessellator.ts` after midRows loop | Sort/orient boundary chains | +4 | None |
| `OuterWallTessellator.ts` line 1762 | Pass boundary chains to `triangulateChainStrip` | +2 | None |
| `ChainStripTriangulator.test.ts` | Add `[], []` to all `triangulateChainStrip` calls | ~19×2 | None |
| **Total** | | ~46 net | **Low** |

---

## Open Questions (for Verifier scrutiny)

### Q1: Is the collinear boundary polygon numerically safe without perturbation?

I believe yes for the common case (convex hull vertices), but edge cases with bot[0]/top[0] at different U values create a non-strictly-collinear left boundary. The Verifier should analyze whether cdt2d's `robust-predicates` correctly handles the near-collinear case where some vertices are at U=unionU[segStart] and one is at U=unionU[segStart]+0.0001 (chain vertex offset).

### Q2: Does the boundary chain break the centroid-based triangle filter?

The centroid filter at [ChainStripTriangulator.ts](../../src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L304) rejects triangles with centroids outside `[-0.01, 1.01]` in normalized U. Boundary chain vertices at U=0 produce triangles with centroids near U=0, which is within bounds. No issue.

### Q3: Can the CDT boundary polygon be self-intersecting?

If `bot[0].u > unionU[segStart]` (chain vertex in bot row has higher U than the grid segStart column), the left boundary zigzags: `top[0]` at some U' > unionU[segStart], then leftBoundaryChain vertices at exactly unionU[segStart], then `bot[0]` at some U'' > unionU[segStart]. This creates a "dent" in the polygon at the boundary chain vertices. CDT2d handles non-convex boundary polygons correctly (it's Constrained Delaunay, not convex-hull Delaunay), but the polygon must be simple (non-self-intersecting). The "dent" is non-intersecting as long as no boundary chain vertex's U is LESS than the minimum of bot[0].u and top[0].u, which cannot happen since boundary chain vertices are at exactly unionU[segStart] and bot[0]/top[0] are at unionU[segStart] or to the right (chain vertex U ≥ unionU[segStart]).

**Actually, wait**: if a chain vertex in stripBot was placed at U < unionU[segStart] (which shouldn't happen given the U-clamping in strip assembly), the polygon could self-intersect. The Verifier should verify that stripBot/stripTop vertices always have U ≥ unionU[segStart].

### Q4: Does this interact with the R31 boundary-column constraint dedup?

Yes — the `addEdge` dedup in `cdtTriangulateStrip` handles this. When the boundary chain adds edges `topLeft → leftBoundary[0] → ... → botLeft`, and R31 column constraints add edges `gridVertex(m, segStart) → gridVertex(m+1, segStart)`, these may be the same edges (left boundary chain vertices ARE the grid vertices at segStart). The `edgeSet` dedup prevents double-registration. No conflict.

### Q5: What happens to the R2 violation count?

Boundary chain vertices are grid vertices (idx < gridVCount) that are now on the CDT boundary instead of interior. The `isBoundary` function at [line 320](../../src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L320) classifies them as boundary (`idx < gridVCount && !featureVerts.has(idx)`). Triangles connecting boundary chain vertices to feature chain vertices still count as R2 violations. This is correct behavior — the R2 metric should track all grid-to-feature transitions, including boundary chain vertices. However, with proper boundary chain construction, these triangles should be well-formed (not slivers), so the R2 count is informative rather than pathological.

## Recommended Approach

**Implement Proposal 1 as described.** It is:
- Minimal (46 net lines)
- Low risk (the only structural change is boundary polygon construction)
- Compatible with all existing R31 features (companions, constraints)
- Self-consistent (no dead code, no workarounds)
- Testable (new boundary chain tests + existing 131 tests)

The optional collinearity perturbation (Proposal 1A) should be held in reserve, deployed only if cdt2d produces degenerate output for specific pot styles.

---

*Signature: Generator Agent — 2026-03-07*
