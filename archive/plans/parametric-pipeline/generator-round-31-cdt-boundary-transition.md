# Generator Round 31 — CDT Strip-to-Grid Boundary Transition
Date: 2026-03-07

## Problem Statement

At the boundary columns of CDT chain strips (`segStart` and `segEnd`), mid-row grid vertices are included as interior Steiner points in the CDT. These vertices:

1. Sit at `U = unionU[segStart]` (normalized CDT coordinate `U = 0`), **exactly on the left boundary constraint edge** `stripBot[0] → stripTop[0]`
2. Are collinear with the boundary constraint, forcing CDT2d to split the constraint into per-band sub-segments
3. Each sub-segment endpoint must connect to the nearest interior chain/companion vertex, which is typically **2–4 expansion columns to the right**
4. This creates long, thin slivers spanning from the extreme-left boundary to distant interior vertices — the "absolutely horrible" boundary zones

The boundary grid vertices exist specifically to prevent T-junctions: the standard grid cell at column `segStart-1` shares gridVertex(m, segStart) with the CDT strip.

## Root Cause Analysis

### The Geometric Inevitability

In [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1463), mid-row grid vertices at segStart/segEnd are kept:

```typescript
if (col !== segStart && col !== segEnd) {
    stripGridInteriorSkipCount++;
    continue;
}
```

In `cdtTriangulateStrip` ([ChainStripTriangulator.ts](../../src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L177)), these vertices are added at `promotedT`:

```typescript
addVertex(sv.idx, sv.u, sv.promotedT);
```

After CDT normalization, they map to `U = (unionU[segStart] - uMin) / uRange = 0`. They lie on the left boundary constraint (`addEdge(botLeftLocal, topLeftLocal)` at line ~258). CDT2d splits this constraint at each collinear vertex, creating per-band sub-constraints, then must triangulate from each sub-constraint to the nearest interior vertex.

With `expansion = 2` (default), the nearest chain/companion vertex is ~2 grid columns (≈ 0.003 in U) to the right. The band T-gap is ~0.0024 in T. The resulting sliver triangle has aspect ratio ~2:1 at best, but often much worse when companion density is low near the boundary.

### Why Existing Companion Cloud Doesn't Help

The T-Ladder companion system ([OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L695)) emits companions around **chain vertices**, not around boundary grid vertices. The U-graded fan's shell fractions reach outward from each chain vertex toward the strip boundary, but for chains centered ~3 columns inside the strip, the outermost fan shell reaches only to ~75% of the distance to the boundary (SHELL_FRACTIONS maxes at 1.0 of half-width, centered on chain U).

Result: a **companion desert** near the boundary columns, with the CDT forced to bridge from boundary grid vertices across the desert to the first companion or chain vertex.

## Proposals

### Proposal 1: Grid-Side Adaptive Fan (Approach D) — Radical

**Idea**: Remove grid vertices from the CDT entirely. Make the CDT strip fully independent. Fill the gap between the standard grid and the CDT strip with explicit "transition fan" triangles.

**Mechanism**:

1. **Strip assembly**: Change the mid-row grid vertex filter from `col !== segStart && col !== segEnd` to `continue` (skip ALL grid vertices in mid-rows — same as interior). Bot/top grid endpoints in `stripBot`/`stripTop` remain.

2. **Grid cell emission**: Don't emit `emitStandardCell(b, segStart-1)` for bands `[localJ, localJTop)`. Mark these as "transition cells." Similarly for column `segEnd`.

3. **CDT triangulation**: Runs without grid contamination. The left boundary constraint `stripBot[0] → stripTop[0]` is a single unbroken edge at `U = unionU[segStart]`. CDT is free to optimize interior triangles.

4. **Boundary extraction**: After CDT produces triangles, build an edge-adjacency map. Extract the left boundary vertex chain (from `stripBot[0]` to `stripTop[0]` via boundary edges with increasing T). Similarly extract the right boundary chain.

5. **Transition fan emission**: For each band `b` in `[localJ, localJTop)`:
   - **Left edge** (grid side): `BL = gridVertex(b, segStart-1)`, `TL = gridVertex(b+1, segStart-1)`
   - **Right edge** (CDT side): subset of left-boundary vertices between `T[b]` and `T[b+1]`, plus gridVertex(b, segStart) and gridVertex(b+1, segStart) as connecting nodes
   - Triangulate this polygon via monotone sweep: left edge is a single segment, right edge has 0+ CDT boundary vertices. Creates a fan that adapts to whatever the CDT produced.

**Mathematical basis**: The CDT left boundary without grid vertices is the convex hull edge at minimum U. If no interior points project to lower U, this boundary is a single vertical edge, and the transition polygon degenerates to a standard quad. If CDT boundary has intermediate vertices, the fan adapts.

**Files affected**:
- `OuterWallTessellator.ts`: ~80 lines for boundary extraction + transition fan emission. Modify mid-row grid skip, grid cell emission skip, post-CDT stitching.
- `ChainStripTriangulator.ts`: No changes (CDT interface unchanged).

**Trade-offs**:
- (+) CDT quality is maximized — zero grid contamination
- (+) Works for any companion distribution — no dependency on companion placement
- (−) Requires post-CDT boundary extraction (~30 lines, O(triangles) traversal)
- (−) Grid vertices at (m, segStart) become unused dangling vertices (harmless but wasteful)
- (−) Must handle edge case where CDT boundary has vertices at non-grid T-positions: the grid side expects vertices at row `b` and `b+1`, but the CDT boundary might have a vertex at T = 0.37 × T[b] + 0.63 × T[b+1], requiring the transition polygon to include both grid vertices AND CDT boundary vertices

**Assumptions** (for Verifier to attack):
1. The CDT left boundary is extractable via edge-adjacency in O(n) after CDT
2. The CDT left boundary is monotone in T (no backtracking), allowing simple fan triangulation
3. Grid vertices at (m, segStart) are safe to leave unused (Batch 6 dedup won't break)
4. Transition fan triangles have acceptable quality (quad or near-quad shapes)
5. The CDT boundary extraction works correctly across the R29.2 windowing system

### Proposal 2: Boundary Column Constraints + Boundary Companions (Approach G+) — Moderate

**Idea**: Keep grid vertices in the CDT, but (a) add explicit constraint edges along the boundary columns to isolate per-band triangulation, and (b) inject targeted boundary companion vertices to eliminate the companion desert.

**Mechanism**:

**Part A — Boundary Column Constraints**:

1. After assembling `segConstraints`, add vertical constraint edges along segStart and segEnd columns:
   ```
   For m from localJ to localJTop-1:
     add constraint: gridVertex(m, segStart) → gridVertex(m+1, segStart)
     add constraint: gridVertex(m, segEnd) → gridVertex(m+1, segEnd)
   ```

2. These constraints partition the CDT boundary into per-band segments. The CDT CANNOT create triangles crossing these edges. Each band's boundary triangles are confined to one band height.

3. Pass through existing crossing-constraint removal (P5): if a boundary constraint crosses a chain constraint, the lower-confidence one is removed (graceful degradation).

**Part B — Boundary Companion Injection**:

4. During companion generation (Section 1.5), after emitting T-Ladder companions and U-graded fans for chain vertices, run a **boundary companion pass** for each chain vertex:

   ```
   For each chain vertex cv:
     For each boundary column B in {leftCol, rightCol}:  // strip boundary columns
       For each T-level k in 1..nTLevels:
         tFrac = k / (nTLevels + 1)
         tLevel = tLo + tFrac * tGap
         emit companion at (unionU[B] + smallOffset, tLevel)
   ```

   Where `leftCol` and `rightCol` are already computed as `Math.max(0, col - expansion)` and `Math.min(numU-1, col + expansion + 1)` (line 703-705).

5. The small U-offset (e.g., ±0.5 column widths INWARD from boundary) ensures companions are near-but-not-on the constraint edges, preventing collinearity issues.

6. These boundary companions fill the "companion desert" so CDT has nearby vertices to triangulate from the boundary grid vertices, producing well-proportioned triangles.

**Mathematical basis**: Adding constraint edges converts the CDT boundary from one long edge (height of entire strip) into N short edges (one per band). This bounds the worst-case triangle aspect ratio: boundary-to-interior distance ≤ a few column widths, and height ≤ one band. With boundary companions providing intermediate vertices, the CDT can create near-equilateral triangles within each band.

**Files affected**:
- `OuterWallTessellator.ts`:
  - ~10 lines: Add boundary column constraints after `segConstraints` assembly (~line 1500)
  - ~20 lines: Add boundary companion emission in Section 1.5 (~line 730)
- `ChainStripTriangulator.ts`: No changes.

**Trade-offs**:
- (+) Minimal code change — ~30 lines total
- (+) No post-CDT processing or boundary extraction needed
- (+) T-junction prevention maintained (same shared grid vertices)
- (+) Works within existing R29.2 windowing system without modification
- (+) Boundary companions use existing vertex buffer allocation (companions already have pre-allocated slots)
- (−) CDT still has grid boundary vertices as interior Steiner points (but constrained, so quality is bounded)
- (−) Boundary companion count increases total vertex count by ~5-10% (for 24 windows × 2 boundaries × ~6 companions/band, ≈ 300-600 additional vertices per segment — negligible vs 282K total)
- (−) Constraint crossings with chain edges could cause some boundary constraints to be removed, reverting to current behavior in those bands
- (−) Grid vertices at boundary are still AT U=0 in normalized CDT space, creating triangles from U=0 to the first companion at U≈0.5 columns — improved but not eliminated

**Assumptions** (for Verifier to attack):
1. CDT2d correctly enforces per-band constraint edges without assertion errors
2. Boundary constraints rarely cross chain constraints (chains are inside the strip, not at the boundary)
3. Companion buffer allocation has enough slack for ~300-600 additional boundary companions per segment
4. Boundary companions don't violate the constraint guard radius (`CONSTRAINT_GUARD_RADIUS = 0.001`)
5. Boundary companion injection during Section 1.5 can determine strip boundary columns before the main window loop

### Proposal 3: Per-Band CDT with Row-Constraint Stitching (Approach F) — Conservative

**Idea**: Instead of one multi-band CDT per segment, run a separate CDT call per band. Every grid vertex at segStart/segEnd becomes a boundary vertex (in stripBot/stripTop), not an interior Steiner point.

**Mechanism**:

1. Replace the multi-band CDT call with a per-band loop:
   ```
   for b from localJ to localJTop - 1:
     bandBot = buildMergedRow(b), filtered to strip U-range
     bandTop = buildMergedRow(b+1), filtered to strip U-range
     bandConstraints = constraints with both endpoints in [T[b], T[b+1]]
     bandInterior = interiorByBand.get(b) companions
     triangulateChainStrip(buf, bandBot, bandTop, bandConstraints, bandInterior, ...)
   ```

2. Grid vertices at (b, segStart) and (b+1, segStart) are in `bandBot`/`bandTop` → they're CDT BOUNDARY vertices, not interior Steiner points. CDT handles boundary vertices correctly (convex hull placement, no long slivers to interior).

3. **Cross-band consistency**: Adjacent CDT calls share a common row. To prevent T-junctions at shared rows, add constraint edges along the shared row between consecutive vertices:
   ```
   For row b+1 (shared between band b and band b+1):
     Add constraint edges connecting consecutive stripBot/stripTop vertices
   ```
   Since both CDTs use the same row vertices (from `buildMergedRow(b+1)`) and the same constraint edges along that row, CDT2d produces identical triangulations at the shared boundary.

**Mathematical basis**: CDT2d is deterministic — identical input produces identical output. If both bands constrain the shared row identically, the shared row's triangulation matches perfectly. The key invariant is that `buildMergedRow(m)` returns the same vertices regardless of which band calls it.

**Files affected**:
- `OuterWallTessellator.ts`: ~40 lines — restructure the per-segment CDT call into a per-band loop
- `ChainStripTriangulator.ts`: No changes.

**Trade-offs**:
- (+) Eliminates the root cause: no interior grid Steiner points at boundaries
- (+) Each CDT call processes fewer vertices → faster per call (O(n log n) per band)
- (+) No post-CDT boundary extraction or transition fan logic
- (+) T-junction prevention inherent (shared boundary row vertices)
- (−) More CDT calls: N bands × M segments instead of 1 call per window × M segments. For 24 bands × 13 segments = 312 CDT calls vs current 13. Total vertex count per call is lower, so wall-clock time may be comparable.
- (−) Cross-band constraint edges must be constructed carefully to guarantee deterministic matching
- (−) Chain constraint edges spanning multiple bands must be split at band boundaries (some edges go from row b to row b+2 → need to interpolate at row b+1)
- (−) bandMergeFactor config becomes meaningless (always = 1)
- (−) Loses the multi-band CDT's ability to create smooth cross-band triangulations

**Assumptions** (for Verifier to attack):
1. CDT2d is truly deterministic for identical inputs (float precision across calls)
2. Adding row-constraint edges doesn't cause CDT assertion failures when combined with chain constraints
3. Chain edges spanning >1 band (after interpolation, should all be ≤1 band) are correctly handled
4. Per-band CDT calls don't create artifacts at band boundaries from differing chain edge sets
5. Performance: 312 small CDT calls ≤ 13 large CDT calls in total time

## Recommended Approach

**Proposal 2 (Boundary Column Constraints + Boundary Companions)** as the primary implementation path.

### Rationale:

1. **Lowest risk**: ~30 lines of code, no architectural changes, no post-CDT processing, no grid emission changes.

2. **Addresses both failure modes**:
   - Boundary column constraints prevent cross-band slivers (height-bounded triangles)
   - Boundary companions eliminate the companion desert (width-bounded triangles)

3. **Graceful degradation**: If boundary constraints cross chain constraints, the crossing removal (P5) drops the boundary constraint and behavior reverts to current (no worse than today). If boundary companions fall too close to constraint edges, the guard radius rejects them (no corruption).

4. **Performance-neutral**: Adding ~300 companions and ~48 constraints per segment is negligible for a CDT processing ~10K+ vertices.

5. **Verifiable**: R2 violation count should drop significantly. `stats.minAngleUV` should increase. Both metrics are already tracked.

**Proposal 1 (Grid-Side Adaptive Fan)** should be kept as the Phase 2 escalation if Proposal 2's quality improvement is insufficient. It's architecturally cleaner but higher-risk and more complex to implement.

**Proposal 3 (Per-Band CDT)** is theoretically elegant but I'm not confident in cross-band determinism guarantees with floating-point CDT2d. It also loses multi-band optimization and adds significant restructuring.

## Implementation Sketch for Proposal 2

### Change 1: Boundary Column Constraints (~10 lines)

Location: After `segConstraints` assembly, before P5 crossing removal (~line 1500).

```typescript
// ── Boundary column constraints: isolate per-band boundary triangulation ──
// Vertical constraint edges at segStart/segEnd prevent cross-band slivers
// from boundary grid vertices connecting to distant interior chain vertices.
for (let m = localJ; m < localJTop; m++) {
    const botIdx = m * numU + segStart;
    const topIdx = (m + 1) * numU + segStart;
    segConstraints.push([botIdx, topIdx]);

    if (segEnd < numU) {
        const botIdxR = m * numU + segEnd;
        const topIdxR = (m + 1) * numU + segEnd;
        segConstraints.push([botIdxR, topIdxR]);
    }
}
```

These grid vertex indices are already in the CDT (as `stripInteriorVerts` with `promotedT`). The constraint edges force CDT2d to include them as mesh edges, preventing cross-band triangulation.

### Change 2: Boundary Companion Injection (~20 lines)

Location: In Section 1.5, after the main T-Ladder companion loop (~line 817).

```typescript
// ── Boundary companion injection: fill companion desert at strip edges ──
// Emit companions at intermediate T-positions near the strip boundary
// columns so CDT has nearby vertices to connect boundary grid vertices to.
for (const cv of chainVertices) {
    if (cv.pointIdx < 0) continue;
    const col = bsearchFloor(unionU, cv.u);
    const expansion = chainStripConfig.expansion;
    const leftCol = Math.max(0, col - expansion);
    const rightCol = Math.min(numU - 1, col + expansion + 1);

    for (const bndCol of [leftCol, rightCol]) {
        const bndU = unionU[bndCol];
        // Inward offset: 0.3 of the column gap toward interior
        const inwardSign = bndCol === leftCol ? 1 : -1;
        const colGap = Math.abs(unionU[Math.min(bndCol + 1, numU - 1)] - bndU);
        const uOffset = inwardSign * colGap * 0.3;

        for (const bandDir of ['above', 'below'] as const) {
            const tRow = activeTPositions[cv.rowIdx];
            const adj = bandDir === 'above' ? cv.rowIdx + 1 : cv.rowIdx - 1;
            if (adj < 0 || adj >= numT) continue;
            const tAdj = activeTPositions[adj];
            const tGap = Math.abs(tAdj - tRow);
            if (tGap < MIN_TGAP_FOR_COMPANIONS) continue;
            const tLo = Math.min(tRow, tAdj);

            for (let k = 1; k <= nTLevels; k++) {
                const tFrac = k / (nTLevels + 1);
                const tLevel = tLo + tFrac * tGap;
                const cu = bndU + uOffset;
                if (!isNearConstraintEdge(cu, tLevel, bandDir === 'above' ? cv.rowIdx : adj)) {
                    tryEmitCompanion(cu, tLevel, cv);
                }
            }
        }
    }
}
```

### Expected Impact

| Metric | Before | After (estimated) |
|---|---|---|
| R2 violations | High (boundary grid + feature mix) | ~0 (boundary triangles isolated per-band) |
| minAngleUV at boundary | ~2-5° (long slivers) | ~15-25° (bounded by companion distance) |
| maxAspectUV at boundary | ~20+ | ~3-5 |
| Total companion count | ~282K | ~283K (+0.3%) |
| CDT constraint count | ~N | ~N + 48/segment (~+20%) |

## Open Questions

1. **Does CDT2d handle correctly the case where an interior Steiner point lies exactly on a constraint edge?** The grid vertices at segStart mid-rows are at normalized U=0, exactly on the left boundary constraint. CDT2d should split the constraint automatically, but the behavior with additional explicit per-band constraints (which duplicate the split points) needs verification. Will CDT2d assert on duplicate constraint edges?

2. **Are there chain edges that cross the segStart column?** If a chain edge spans from column segStart-1 to segStart+1 (unusual but possible with expansion), its constraint edge crosses the new boundary column constraint. P5 removes the lower-confidence one — is this always correct? Could we lose an important chain constraint?

3. **Companion dedup**: Boundary companions at `bndU + uOffset` might coincide with existing U-graded fan companions at the same position. The `COMPANION_DEDUP_THRESHOLD = 1e-5` should handle this, but verify the dedup pass catches them.

4. **Seam wrap-around**: If `segStart = 0`, the left boundary is the seam column. Boundary companions and constraints near U=0 must not wrap to U≈1. The existing `SEAM_COMPANION_GUARD` check should handle this, but needs verification.

5. **Single-column segments**: If `segEnd - segStart = 1`, the boundary column constraints on left and right would be at the same columns. What happens when the left boundary constraint and right boundary constraint occupy the same vertex pair?

6. **Proposal 1 escalation trigger**: What metric threshold should trigger escalation from Proposal 2 to Proposal 1? Suggested: if `stats.minAngleUV < 10°` persists at boundary zones after Proposal 2, escalate.
