# Chain Strip Fix Round 2 — Corrective Plan

**Date:** 2026-03-01
**Branch:** `refactor/core-migration`
**Status:** Proposed
**Supersedes:** B1–B6 implementation from `2026-03-01-chain-strip-redesign-plan.md` (partially effective)

---

## 1. Problem Statement

Despite implementing all 6 batches of the chain strip redesign plan, the export log reveals catastrophic mesh quality in the chain strip region:

| Metric | Actual | Target |
|--------|--------|--------|
| Aspect ratio >4:1 | 51.2% (23,189/45,326 tris) | ≤5% |
| Max aspect ratio | 60,729:1 | ≤4:1 |
| Max area grading ratio | 645:1 | ≤2:1 |
| Grading violations | 26,267 | 0 |
| Min angle | 0.0° | ≥15° |
| Constraint count | 6,961 | ~250 |
| Chain strip mode used | sweep-repair | cdt |

The implemented changes are structurally correct (graded insertion, stretch estimation, quality metrics, dead code removal) but **five critical gaps** prevent them from achieving the objectives.

---

## 2. Root Cause Analysis

### Gap 1: Constraint filter not applied at triangulation time

**Location:** `OuterWallTessellator.ts:1050-1063` — `segConstraints` builder

**Problem:** The feature-only filter (`pointIdx >= 0`) is only applied when selecting edges for graded transition vertex insertion (line 620). The actual constraint edges passed to the triangulator include ALL 7,184 chain path edges — feature-to-feature, feature-to-micro-row, and micro-row-to-micro-row. Only 250 of these are true feature edges.

**Evidence:** Log shows `Chain edges: 7184`, `Primary chain edges: total=250`, `Chain-strip constraints: total=6961, classified=6957`.

**Impact:** With ~7000 constraints, CDT/sweep is forced into contorted geometry trying to honor edges between micro-row interpolated vertices that serve no structural purpose. This is the exact same problem the original plan identified and was supposed to fix.

**Fix:** Add `pointIdx >= 0` filter to the `segConstraints` builder:

```typescript
const segConstraints: Array<[number, number]> = [];
for (const [v0, v1] of bandConstraintEdges) {
    const cv0 = allChainVertices[v0 - gridVertexCount];
    const cv1 = allChainVertices[v1 - gridVertexCount];
    if (!cv0 || !cv1) continue;
    // R1: Only feature-to-feature edges are hard constraints
    if (cv0.pointIdx < 0 || cv1.pointIdx < 0) continue;
    const uMinE = Math.min(cv0.u, cv1.u);
    const uMaxE = Math.max(cv0.u, cv1.u);
    if (uMaxE >= uStripLeft - 1e-9 && uMinE <= uStripRight + 1e-9) {
        segConstraints.push([v0, v1]);
    }
}
```

### Gap 2: User override to sweep-repair mode defeats CDT

**Location:** `ParametricExportComputer.ts:427`, user-facing config in `ExportDialog.tsx`

**Problem:** The default mode is `'cdt'`, but the user's export dialog was set to `'sweep-repair'`. Sweep mode does not honor CDT's angle-optimizing properties. With sweep-repair, the graded transition vertices are connected in arbitrary scan-line order, producing slivers instead of well-graded triangles.

**Evidence:** Log shows `mode=sweep-repair, cdt=0, sweep=6930`.

**Impact:** All CDT-dependent quality improvements (angle optimization, constraint-optimal triangulation) are bypassed. The sweep connects vertices left-to-right regardless of geometric quality.

**Fix (code):** Force CDT for chain strip bands regardless of user setting. If CDT fails (e.g., cdt2d exception), fall back to sweep-repair. Make the UI dropdown only affect non-chain bands or remove it entirely.

```typescript
// In triangulateChainStrip:
// Always use CDT for chain strips — sweep produces slivers
const effectiveMode = constraints.length > 0 ? 'cdt' : config.mode;
```

**Fix (UI, optional):** Remove the chain strip mode dropdown or rename it to clarify that CDT is always used for chain bands. The dropdown could instead control the **fallback** mode.

### Gap 3: Transition vertices cluster on boundary rows instead of forming interior rings

**Location:** `OuterWallTessellator.ts:380-425` — ring vertex insertion loop

**Problem:** The `rowOffset` calculation `Math.round(rowBase + side * normT * ringDist / rowSpacing)` rounds to the edge's bot or top row for most ring distances because:
- Feature edges span exactly 1 row (`rowGap === 1`)
- `normT` is small (near zero for vertical edges)
- `ringDist` is a fraction of `colSpacing` (much smaller than `rowSpacing`)
- So `side * normT * ringDist / rowSpacing ≈ 0`, and `Math.round(rowBase)` returns the same row

This means the transition vertices are all placed **on the same two rows** as the feature edge endpoints. They expand in U but not in T. This creates a 1D spread, not concentric rings.

**Impact:** The "rings" are actually linear U-offsets at fixed rows, not 2D concentric shells. The mesh has no interior transition layers between feature edges and grid boundaries. Triangles jump directly from chain-dense rows to empty grid rows.

**Fix:** Redesign the transition vertex placement:
1. Insert vertices at **the feature edge's own row pair** (bot and top) with U-offsets — these provide left/right density gradation
2. Also insert vertices at **adjacent rows** (bot-1, top+1, bot-2, top+2, etc.) at the same U range — these provide vertical density gradation
3. The "rings" should be defined as distance-bands in UV space, not row-based offsets. Each ring band places vertices at every row that intersects the ring annulus.

```
New approach:
For ring k at distance ringDist from edge midpoint:
  - At EACH row from (bot.rowIdx - k) to (top.rowIdx + k):
    - Insert vertices at U offsets from chain edge at spacing ≈ ringDist
    - Skip if row is out of bounds or vertex is outside grid
```

### Gap 4: Transition vertex density is far too low for the grid resolution

**Location:** `OuterWallTessellator.ts:265-430` — `insertGradedTransitionVertices()`

**Problem:** For a 795×435 grid (cell spacing ~0.00126 U), 8,696 transition vertices across 250 feature edges = ~35 vertices per edge. With a `maxVertices = 10000` hard cap, density is fundamentally limited. At this grid resolution, a proper transition zone needs ~60-100 vertices per feature edge to create 2+ rings of meaningful density.

**Evidence:** `Chain-vertex mesh: 361725 verts, 15900 chain verts [8696 transition]`. The 8,696 transition vertices are spread across 250 edges × 2 rows × 2 sides = ~8-9 vertices per side per row per edge. This creates at most 2-3 vertices within each cell, which is not enough for a visible ring pattern.

**Impact:** The grid cells adjacent to chain edges are nearly empty — only 2-3 extra vertices compared to the grid's own resolution. The CDT has no material to build graded triangles.

**Fix:**
1. Raise `maxVertices` cap to `50000` (still <15% of total grid vertices)
2. Compute `baseVertsPerRing` from the grid cell count spanned by the edge, not from `edgeLenU / baseSpacing`
3. Ensure at minimum 3 vertices per ring per side for short edges
4. For high-resolution grids (numU > 200), scale `minRings` up proportionally

### Gap 5: No R2 enforcement — triangles connect feature vertices directly to grid boundary

**Location:** No R2 scan exists in the current CDT pipeline

**Problem:** Nothing prevents the CDT from creating a triangle with one vertex on the feature chain and another on the grid boundary row. This is the worst possible sliver — it spans the entire transition zone in a single triangle.

**Evidence:** `v25.0 chain-strip 3D quality: violations(>4:1)=23189/45326 (51.2%)`. Over half the chain strip triangles are slivers, indicating widespread direct feature-to-grid connections.

**Impact:** The fundamental requirement ("no triangle is allowed to link the feature edge and mesh directly") is completely violated.

**Fix:** Add a post-CDT scan that:
1. For each chain strip triangle, check if any edge connects a feature vertex (`pointIdx >= 0`) to a grid boundary vertex
2. If so, insert a midpoint vertex on that edge and re-run CDT on the affected strip
3. This is the "minimum-layer guarantee" from the original plan that was never implemented

---

## 3. Implementation Plan

### Fix 1: Feature-Only Constraint Filter (Critical, do first)

**File:** `OuterWallTessellator.ts`
**Effort:** Small — single condition addition
**Risk:** Low

Add `pointIdx` check to `segConstraints` builder at line ~1053:

```typescript
if (cv0.pointIdx < 0 || cv1.pointIdx < 0) continue;  // R1: feature-to-feature only
```

**Expected result:** Constraint count drops from ~7000 to ~250. CDT can now optimize angles freely among all non-feature vertices.

**Tests:** Verify constraint count in export log. Verify feature edge enforcement ≥ 244/250.

---

### Fix 2: Force CDT Mode for Chain Strips (Critical)

**File:** `ChainStripTriangulator.ts`
**Effort:** Small — 3-line change in `triangulateChainStrip`
**Risk:** Low

```typescript
export function triangulateChainStrip(...): void {
    // Always use CDT for bands with constraints — sweep produces slivers
    // with graded transition vertices. Sweep is only suitable for
    // unconstrained bands (no chain edges).
    let effectiveMode = config.mode;
    if (constraints.length > 0) {
        effectiveMode = 'cdt';
    }

    switch (effectiveMode) {
        case 'cdt': ...
        case 'sweep': ...
        ...
    }
}
```

**Expected result:** All chain-containing bands use CDT regardless of user setting. The mode dropdown only affects non-chain bands (which are already quad-split, so this is effectively a no-op — the dropdown becomes irrelevant).

**Tests:** Verify export log shows `cdt=N, sweep=0` for chain-containing bands.

---

### Fix 3: Redesign Transition Vertex Placement — Multi-Row Rings (Critical)

**File:** `OuterWallTessellator.ts` — rewrite `insertGradedTransitionVertices()`
**Effort:** Medium
**Risk:** Medium — fundamentally changes vertex placement

**Current approach (broken):**
- Ring vertices placed at `Math.round(rowBase + offset)` → always same 2 rows
- Only U-offsets vary; T-offsets are negligible
- Result: 1D spread, not 2D rings

**New approach:**
The key insight is that "rings" should radiate outward from the feature edge **across multiple rows**, not within a single row. For a feature edge spanning rows `j` and `j+1`:

```
Ring 1 (nearest): Vertices at rows j, j+1 — U offset ±baseSpacing from chain
Ring 2: Vertices at rows j-1, j, j+1, j+2 — U offset ±2×baseSpacing from chain
Ring 3: Vertices at rows j-2...j+3 — U offset ±3×baseSpacing from chain
...
```

Each ring covers a wider row range AND a wider U range, creating a true 2D shell:

```
        Ring 3     Ring 2   Ring 1   CHAIN   Ring 1   Ring 2     Ring 3
Row j-2:   *         *                                  *          *
Row j-1:   *         *        *                *        *          *
Row j:     *         *        *       ===      *        *          *
Row j+1:   *         *        *       ===      *        *          *
Row j+2:   *         *                                  *          *
Row j+3:   *         *                                  *          *
```

**Algorithm:**

```typescript
for (let ring = 1; ring <= nRings; ring++) {
    const ringDist = baseSpacing * (Math.pow(gradingRatio, ring) - 1) / (gradingRatio - 1);

    // Rows covered by this ring: expand ±(ring-1) beyond the edge's own rows
    const rowStart = Math.max(0, bot.rowIdx - (ring - 1));
    const rowEnd = Math.min(numT - 1, top.rowIdx + (ring - 1));

    for (let row = rowStart; row <= rowEnd; row++) {
        // U position of the chain at this row (interpolated from edge endpoints)
        const t = (row - bot.rowIdx) / Math.max(1, top.rowIdx - bot.rowIdx);
        const uChain = bot.u + du * Math.max(0, Math.min(1, t));

        // Number of U-offset vertices at this ring distance
        const nVertsSide = Math.max(1, Math.ceil(ringDist / colSpacing));

        for (const side of [-1, 1]) {
            // Place vertex at U offset from chain
            const uOffset = uChain + side * ringDist;
            tryAddVertex(uOffset, row, bot.chainId);

            // For wide rings, also place intermediate U vertices
            if (nVertsSide > 1) {
                for (let k = 1; k < nVertsSide; k++) {
                    const frac = k / nVertsSide;
                    const uIntermediate = uChain + side * ringDist * frac;
                    tryAddVertex(uIntermediate, row, bot.chainId);
                }
            }
        }
    }
}
```

**Vertex budget:** With this approach:
- 250 edges × 5 rings × ~8 rows × ~4 U-positions × 2 sides ≈ 80,000 candidate vertices
- After dedup and proximity filtering: ~30,000-40,000 actual vertices
- Cap at `maxVertices = 50000`

**Tests:**
- Verify vertices span multiple rows (not just edge's own 2 rows)
- Verify ring distance increases geometrically from chain edge
- Verify U-offset increases with ring number

---

### Fix 4: R2 Enforcement — Post-CDT Direct Connection Scan

**File:** `ChainStripTriangulator.ts` — add scan after CDT output
**Effort:** Small-Medium
**Risk:** Low

After CDT produces triangles, scan for R2 violations:

```typescript
// R2 scan: no triangle should connect a feature vertex to a grid boundary vertex
for (let i = 0; i < outputTriangles.length; i += 3) {
    const a = outputTriangles[i], b = outputTriangles[i+1], c = outputTriangles[i+2];
    const verts = [a, b, c];
    const hasFeature = verts.some(v => {
        const cv = chainVerts[v - gridVCount];
        return cv && cv.pointIdx >= 0;
    });
    const hasGridBoundary = verts.some(v => {
        return v < gridVCount && isStripBoundaryVertex(v, ...);
    });
    if (hasFeature && hasGridBoundary) {
        stats.r2Violations++;
    }
}
```

For now, COUNT violations but don't fix them (that would require Steiner insertion + re-CDT, which is complex). The graded rings from Fix 3 should reduce violations to near-zero. If violations persist after Fix 3, implement Steiner midpoint insertion as a follow-up.

**Tests:** Verify R2 violation count approaches zero with proper ring placement.

---

### Fix 5: Raise Vertex Budget and Improve Density Scaling

**File:** `OuterWallTessellator.ts`
**Effort:** Small
**Risk:** Low

1. Change `maxVertices` cap from 10,000 to 50,000
2. Scale `minRings` with grid resolution: `minRings = max(baseMinRings, ceil(log2(numU / 50)))`
3. Ensure `baseVertsPerRing >= 3` even for short edges

```typescript
const gradingConfig = {
    gradingRatio: ...,
    minRings: Math.max(baseMinRings, Math.ceil(Math.log2(numU / 50))),
    maxRings: ...,
    maxVertices: 50000,
};
```

---

## 4. Batch Ordering and Dependencies

```
Fix 1: Feature-only constraints    ← Independent, do first (small, high impact)
Fix 2: Force CDT mode              ← Independent, do second (small, high impact)
Fix 3: Multi-row ring redesign     ← After Fix 1+2 (medium, highest impact)
Fix 4: R2 enforcement scan         ← After Fix 3 (small, validates Fix 3)
Fix 5: Vertex budget scaling       ← After Fix 3 (small, enables Fix 3 at high res)
```

Fixes 1 and 2 should be done together as they are small and provide immediate improvement. Fix 3 is the largest change and addresses the core density/ring problem. Fixes 4 and 5 are refinements.

---

## 5. Expected Results After All Fixes

| Metric | Before | After (Expected) |
|--------|--------|-------------------|
| Constraint count | 6,961 | ~250 |
| Chain strip mode | sweep-repair | cdt |
| Aspect ratio >4:1 | 51.2% | ≤10% |
| Max aspect ratio | 60,729:1 | ≤10:1 |
| Max area grading | 645:1 | ≤3:1 |
| Min angle | 0.0° | ≥10° |
| Transition vertices | 8,696 (2 rows) | ~30,000 (multi-row) |
| R2 violations | Unmeasured (high) | ≤50 |

---

## 6. Validation Checklist

After all fixes:

- [ ] Export log shows `cdt=N, sweep=0` for chain strip bands
- [ ] Constraint count ≈ 250 (feature-only)
- [ ] `v25.0 chain-strip 3D quality: violations(>4:1) < 10%`
- [ ] `grading: max_area_ratio < 3:1`
- [ ] Feature edge enforcement ≥ 244/250
- [ ] Transition vertices span multiple rows (visible in log as ring count)
- [ ] All existing tests pass
- [ ] Build succeeds
- [ ] No performance regression (build time ≤ 3000ms at draft quality)
