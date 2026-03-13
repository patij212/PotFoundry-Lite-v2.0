# Generator Round 22 — Grid Vertex Demotion from CDT Strip Boundaries

Date: 2026-03-05

## Problem Statement

R21 (shadow boundary vertices) provided a 38% improvement in UV R2 violations but made 3D mesh quality **catastrophically worse**: 100× worse max aspect ratio (315M:1 → up from 3.3M:1), 13× worse average aspect ratio, 32,500× worse max area ratio, and 60% more non-manifold edges.

**Root cause**: CDF-adaptive grid column placement positions grid vertices near feature U-positions. Shadow vertices at chain U-positions (R21) appear on the boundary within 0.0001–0.001 U of existing grid vertices. CDT connects these near-coincident boundary points to far interior vertices, creating extreme slivers in 3D.

**The deeper problem**: The CDT strip boundary IS the grid. Horizontal boundary edges follow row T-positions. Vertical boundary structure follows grid column U-positions. Interior enrichment (companions, fans, shells, shadows) can improve the interior triangulation quality but **cannot fix boundary-driven structure**. The boundary itself imposes row/column patterns on the CDT output.

**What the user wants**: "No rows and no column structures should be present within the chain strip." This requires removing the grid from the boundary.

---

## Root Cause Analysis

### Current boundary construction ([OWT lines 1300–1318](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1300-L1318))

```typescript
for (let bi = 0; bi < botRow.length; bi++) {
    const sv = botRow[bi];
    if (sv.u >= uStripLeft - 1e-9 && sv.u <= uStripRight + 1e-9) {
        if (sv.isChain) {
            stripInteriorVerts.push({ ...sv, promotedT: tBot + PROMO_EPSILON * tGap });
        } else {
            stripBot.push(sv);  // ALL grid+shadow → boundary
        }
    }
}
```

`botRow` comes from `buildMergedRow(j)` which produces a sorted array of: grid vertices (`isChain: false`, `idx < gridVertexCount`), shadow vertices (`isChain: false`, `idx >= totalVertexCount + rowBoundaryCvCount`), and chain vertices (`isChain: true`). The filter sends ALL non-chain vertices to the boundary.

For a typical strip spanning cols 3–11 (9 columns), `stripBot` contains ~9 grid vertices + 1–2 shadow vertices = ~11 boundary points. CDT produces boundary-constrained edges between consecutive boundary points. These edges align perfectly with grid columns → grid structure visible in the mesh.

### Why shadow vertices made it worse

R21's shadow vertices at chain U-positions (e.g., U=0.5123) sit between grid columns (e.g., grid@0.509 and grid@0.515). But CDF-adaptive grid placement often puts a grid column very close to the feature: grid@0.512 at distance 0.0003 from shadow@0.5123. CDT creates a boundary edge of length 0.0003U between grid@0.512 and shadow@0.5123. This ultra-short boundary edge connects to a far interior point → extreme sliver in 3D.

**The fix is not to move shadows away from grid columns. The fix is to remove intermediate grid columns from the boundary entirely.**

---

## Proposals

### Proposal 1: Boundary Thinning (RECOMMENDED — Primary Fix)

**Idea**: In the strip boundary construction loop, include only:
1. **Strip endpoint grid vertices** (segStart, segEnd) — mandatory for mesh continuity with adjacent standard cells
2. **Shadow vertices** — feature-aligned boundary points from R21

All **intermediate grid vertices** (between segStart and segEnd) are simply NOT included in the CDT strip — not as boundary, not as interior.

**Mathematical basis**: A CDT with N boundary vertices produces N boundary-constrained edges. Each boundary edge forces the CDT to connect to interior points at the edge's angle, limiting the Delaunay optimizer's freedom. With 11 boundary points per row (current), CDT has 10 constrained boundary edges per row. With 2–4 boundary points per row (proposed), CDT has 1–3 constrained boundary edges. The Delaunay criterion has dramatically more freedom to optimize triangle quality.

**Mechanism**: Modify the strip construction loops at [OWT lines 1300–1318](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1300-L1318) and [OWT lines 1320–1338](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1320-L1338):

**Current code (botRow loop):**
```typescript
for (let bi = 0; bi < botRow.length; bi++) {
    const sv = botRow[bi];
    if (sv.u >= uStripLeft - 1e-9 && sv.u <= uStripRight + 1e-9) {
        if (sv.isChain) {
            stripInteriorVerts.push({ ...sv, promotedT: tBot + PROMO_EPSILON * tGap });
        } else {
            stripBot.push(sv);
        }
    }
}
```

**Proposed code (botRow loop):**
```typescript
const botLeftIdx = j * numU + segStart;
const botRightIdx = j * numU + segEnd;

for (let bi = 0; bi < botRow.length; bi++) {
    const sv = botRow[bi];
    if (sv.u >= uStripLeft - 1e-9 && sv.u <= uStripRight + 1e-9) {
        if (sv.isChain) {
            stripInteriorVerts.push({ ...sv, promotedT: tBot + PROMO_EPSILON * tGap });
        } else {
            // R22: Boundary thinning — only endpoints and shadows
            const isGridVertex = sv.idx < gridVertexCount;
            if (isGridVertex) {
                // Keep only the strip endpoint grid vertices
                if (sv.idx === botLeftIdx || sv.idx === botRightIdx) {
                    stripBot.push(sv);
                }
                // Intermediate grid vertices: omitted entirely (dead vertices)
            } else {
                // Shadow vertex (idx >= gridVertexCount, isChain=false) → keep on boundary
                stripBot.push(sv);
            }
        }
    }
}
```

**Same transformation for topRow loop**, using `topLeftIdx` and `topRightIdx` instead, and applying the D-Radical topDup mapping for chain vertices as before.

**Proposed code (topRow loop):**
```typescript
const topLeftIdx = (j + 1) * numU + segStart;
const topRightIdx = (j + 1) * numU + segEnd;

for (let ti = 0; ti < topRow.length; ti++) {
    const sv = topRow[ti];
    if (sv.u >= uStripLeft - 1e-9 && sv.u <= uStripRight + 1e-9) {
        if (sv.isChain) {
            const dupIdx = topDupMap.get(sv.idx);
            stripInteriorVerts.push({ ...sv, idx: dupIdx ?? sv.idx, promotedT: tTop - PROMO_EPSILON * tGap });
        } else {
            // R22: Boundary thinning — only endpoints and shadows
            const isGridVertex = sv.idx < gridVertexCount;
            if (isGridVertex) {
                if (sv.idx === topLeftIdx || sv.idx === topRightIdx) {
                    stripTop.push(sv);
                }
            } else {
                stripTop.push(sv);
            }
        }
    }
}
```

**Why `sv.idx < gridVertexCount` identifies grid vertices:**
- Grid vertices: `idx = row * numU + col`, where `0 ≤ row < numT`, `0 ≤ col < numU`. Max idx = `numT * numU - 1 = gridVertexCount - 1`.
- Chain vertices: `idx = gridVertexCount + offset`, but have `isChain: true` (already filtered).
- TopDup vertices: `idx ≥ totalVertexCount`, `isChain: true` (already filtered).
- Shadow vertices: `idx ≥ totalVertexCount + rowBoundaryCvCount`, `isChain: false`.
- Any non-chain vertex with `idx ≥ gridVertexCount` must be a shadow vertex (no other non-chain path produces indices in this range).

The existing endpoint enforcement after the loop (lines 1312–1317) becomes a safety net — it inserts endpoints if they were somehow missing, but the new loop should always catch them.

**Additional code change**: Move `botLeftIdx`/`botRightIdx` computation BEFORE the loop (currently after it). This requires reordering ~3 lines:

```typescript
// Move these BEFORE the botRow loop:
const botLeftIdx = j * numU + segStart;
const botRightIdx = j * numU + segEnd;

// ... botRow loop using botLeftIdx/botRightIdx ...

// Existing endpoint enforcement remains as safety net:
if (stripBot.length === 0 || stripBot[0].idx !== botLeftIdx) {
    stripBot.unshift({ idx: botLeftIdx, u: uStripLeft, isChain: false, gridCol: segStart });
}
if (stripBot[stripBot.length - 1].idx !== botRightIdx) {
    stripBot.push({ idx: botRightIdx, u: uStripRight, isChain: false, gridCol: segEnd });
}
```

Same reordering for topRow (move `topLeftIdx`/`topRightIdx` before the topRow loop).

**Files affected**: `OuterWallTessellator.ts` only.

**Expected metric improvements**:

| Metric | R21 (Current) | Predicted R22 | Basis |
|--------|---------------|---------------|-------|
| 3D max_aspect | 315M:1 | <10M:1 | Elimination of ultra-short grid→shadow boundary edges |
| 3D avg_aspect | 1,689:1 | <200:1 | CDT free to optimize without grid-locked boundary constraints |
| max_area_ratio | 30.8B:1 | <1M:1 | No more sliver triangles from near-coincident boundary pairs |
| Non-manifold | 370 | ~233 or less | Fewer boundary vertices → fewer shared boundary edge conflicts |
| UV R2 violations | 24,732 | <10,000 | Only 4 grid boundary vertices (endpoints) instead of ~18 |

**Trade-offs**:
- (+) Dramatic reduction in grid-structure visibility
- (+) CDT has maximum angular freedom in the strip interior
- (+) Eliminates the shadow-grid proximity problem entirely (grid columns aren't on the boundary)
- (+) Simpler boundary polygon → faster CDT (fewer boundary constraints)
- (-) Intermediate grid vertices become unreferenced (dead vertices in the array — harmless but wasteful)
- (-) Sparse boundary may create large triangles at strip edges if companion cloud is insufficient

**Assumptions** (for Verifier to attack):
1. All intermediate grid vertices (between segStart and segEnd) are exclusively referenced by the CDT strip in the current code — no standard cell references them. Therefore, omitting them creates no T-junctions.
2. The companion cloud (T-Ladder + shells) provides sufficient interior point density near the boundary to prevent CDT from creating excessively large triangles.
3. Shadow vertices at chain U-positions provide meaningful boundary subdivisions that align the CDT with feature geometry.
4. The endpoint enforcement safety net (existing lines 1312–1317) guarantees the endpoints are always present even if the merged row doesn't contain them exactly at the expected index.
5. `sv.idx < gridVertexCount` correctly identifies all grid vertices and only grid vertices among non-chain `StripVertex` entries from `buildMergedRow`.

---

### Proposal 2: Shadow-Endpoint Proximity Guard (Complementary)

**Idea**: With intermediate grid vertices removed, the only remaining short-edge risk is a shadow vertex near a strip ENDPOINT. If a chain's U-position happens to be very close to segStart or segEnd's U-position, the CDT boundary still has a short edge.

**Mechanism**: After constructing `stripBot`/`stripTop` with Proposal 1, check shadow→endpoint distances. If a shadow is within a threshold of an endpoint, drop the shadow:

```typescript
// After stripBot construction, before sort:
const ENDPOINT_SHADOW_GUARD = 0.001; // minimum U-distance between shadow and endpoint
const endpointU = [uStripLeft, uStripRight];
const filteredBot: StripVertex[] = [];
for (const sv of stripBot) {
    const isEndpoint = sv.idx === botLeftIdx || sv.idx === botRightIdx;
    if (isEndpoint) {
        filteredBot.push(sv);
    } else {
        // Shadow vertex — check proximity to endpoints
        const nearEndpoint = endpointU.some(eu => Math.abs(sv.u - eu) < ENDPOINT_SHADOW_GUARD);
        if (!nearEndpoint) {
            filteredBot.push(sv);
        }
    }
}
```

**Threshold selection**: The SHADOW_DEDUP_U is currently 1e-6 (far too tight). A 0.001 guard means: if a shadow is within 0.1% of the U-range from an endpoint, drop it. At typical strip width ~0.01U, this is ~10% of the strip width — reasonable.

**Trade-offs**:
- (+) Eliminates the last source of ultra-short boundary edges
- (-) At extreme cases, may drop useful shadows near strip edges
- (-) A dropped shadow means the boundary near that endpoint has no feature alignment. But since the endpoint IS a grid vertex near the chain (due to CDF-adaptive placement), the missing shadow has minimal impact

**Assumptions** (for Verifier to attack):
1. Shadow vertices near strip endpoints are rare (CDF places grid columns near features, so endpoints are already close to feature U-positions).
2. The 0.001 threshold is conservative enough to avoid dropping useful shadows in the strip interior.
3. The dropped shadow doesn't need to be recoverable — the CDT fills the gap using interior companions.

---

### Proposal 3: Per-Row Strip Consistency (Robustness Fix)

**Idea**: Guarantee that adjacent bands use identical segStart/segEnd on their shared row, eliminating T-junctions from mismatched strip boundaries.

**The risk scenario**: Band j has `effective[j] = raw[j-1] | raw[j] | raw[j+1]`, band j+1 has `effective[j+1] = raw[j] | raw[j+1] | raw[j+2]`. If `raw[j-1]` marks column c but `raw[j+2]` doesn't, band j's strip may extend to column c while band j+1's strip doesn't. On the shared row j+1:

- Band j's CDT strip topRow boundary: `(j+1, segStart_j)` → shadows → `(j+1, segEnd_j)`. The CDT creates a boundary edge from `(j+1, segStart_j)` to the first shadow/endpoint.
- Band j+1 has a standard cell at column `segStart_j` if `segStart_j < segStart_{j+1}`. This standard cell uses grid vertex `(j+1, segStart_j)` as a corner.
- Grid vertex `(j+1, segStart_j)` is at the CDT strip's endpoint in band j — no T-junction there.

Wait — actually, if `segStart_j < segStart_{j+1}`, then grid vertex `(j+1, segStart_j)` IS band j's topLeftIdx. Both band j's CDT and band j+1's standard cell reference this vertex. ✓

The T-junction risk is with grid vertex `(j+1, c)` where `segStart_j < c < segEnd_j` AND `c < segStart_{j+1}` (so c is intermediate in band j's CDT but in a standard cell for band j+1). Under Proposal 1, this vertex is **NOT in band j's CDT** (intermediate, demoted). Band j+1's standard cell at column c uses this vertex as a corner. Since band j's CDT doesn't reference this vertex at all, and the CDT boundary edge from `(j+1, segStart_j)` spans to the next point (shadow or `(j+1, segEnd_j)`):

**Q:** Does any CDT triangle in band j have an edge along row j+1 that passes through the geometric position of `(j+1, c)`?

**A:** Yes — the CDT boundary edge is a constraint edge from `(j+1, segStart_j)` to the next boundary point (shadow or `(j+1, segEnd_j)`). This edge lies along row j+1 at T=activeTPositions[j+1]. Grid vertex `(j+1, c)` also lies on this same row at the same T-position. If `unionU[c]` is between `unionU[segStart_j]` and the next boundary point's U, then `(j+1, c)` is geometrically ON the CDT boundary edge. T-junction.

**Frequency**: This requires `raw[j-1]` to mark columns that `raw[j+2]` doesn't (or vice versa). This happens at chain endpoints — where a chain starts at band j-1 and doesn't extend to band j+2. With expansion=4, the buffer typically covers the difference. But at exact chain endpoints, 0–2 boundary columns might differ. The T-junction affects at most the first/last column of the strip, involving 1–2 vertices.

**Mechanism**: Pre-compute per-row effective strip masks, then use the union for both adjacent bands:

```
Phase 1 (existing): Compute rawColHasChain[j] for each band j.
Phase 1.5 (existing): Mark shadow columns in rawColHasChain.
Phase 2 (existing): Union adjacent bands: effective[j] = raw[j-1] | raw[j] | raw[j+1]

Phase 3 (NEW): Per-Row Union.
  For each row r (0 < r < numT - 1):
    rowEffective[r] = effective[r-1] | effective[r]
    (where effective[r-1] is band (r-1, r)'s effective array,
     and effective[r] is band (r, r+1)'s effective array)
  Then during band processing:
    - botRow uses rowEffective[j] instead of effective[j] for segStart/segEnd on row j
    - topRow uses rowEffective[j+1] instead of effective[j] for segStart/segEnd on row j+1
```

**Implementation complexity**: This requires storing all bands' effective arrays (or at least caching the previous band's array). Currently, `colHasChain` is recomputed per band and overwritten. Two approaches:

#### Approach 3A: Pre-compute all effective arrays (simple, O(numT × cellsPerRow) memory)

```typescript
// After the rawColHasChain computation (including shadow marking), BEFORE the band loop:
const effectiveColHasChain: Uint8Array[] = [];
for (let j = 0; j < numT - 1; j++) {
    const eff = new Uint8Array(cellsPerRow);
    const raw = rawColHasChain[j];
    const prev = j > 0 ? rawColHasChain[j - 1] : undefined;
    const next = j < numT - 2 ? rawColHasChain[j + 1] : undefined;
    for (let c = 0; c < cellsPerRow; c++) {
        if (raw[c] || prev?.[c] || next?.[c]) eff[c] = 1;
    }
    // Apply expansion
    if (stripExpansion > 0) {
        const pre = Uint8Array.from(eff);
        for (let c = 0; c < cellsPerRow; c++) {
            if (pre[c]) {
                for (let d = 1; d <= stripExpansion; d++) {
                    if (c - d >= 0) eff[c - d] = 1;
                    if (c + d < cellsPerRow) eff[c + d] = 1;
                }
            }
        }
    }
    effectiveColHasChain.push(eff);
}

// Per-row union: for shared row r, both bands agree on strip coverage
const rowEffective: Uint8Array[] = [];
for (let r = 0; r < numT; r++) {
    const rowEff = new Uint8Array(cellsPerRow);
    if (r > 0 && r - 1 < effectiveColHasChain.length) {
        const eff = effectiveColHasChain[r - 1];
        for (let c = 0; c < cellsPerRow; c++) if (eff[c]) rowEff[c] = 1;
    }
    if (r < effectiveColHasChain.length) {
        const eff = effectiveColHasChain[r];
        for (let c = 0; c < cellsPerRow; c++) if (eff[c]) rowEff[c] = 1;
    }
    rowEffective.push(rowEff);
}
```

Then in the band loop, instead of computing `colHasChain` per band and using it for both `segStart`/`segEnd` extraction on rows j and j+1, use `rowEffective[j]` for row j and `rowEffective[j+1]` for row j+1.

**BUT**: The current code uses a single `colHasChain` array for the entire band (both rows share the same segStart/segEnd). Splitting per-row would require changing the segment extraction logic. The contiguous scan `while (i < cellsPerRow && colHasChain[i])` would need to run on `rowEffective[j]` for the botRow and `rowEffective[j+1]` for the topRow, producing potentially different segment boundaries per row.

**This significantly complicates the strip construction.** The CDT strip currently has rectangular topology: same segStart/segEnd on both rows. With per-row segments, the strip would be trapezoidal. `ChainStripTriangulator` handles this (it uses actual bot/top endpoints for the CDT boundary polygon), but the segment iteration and `quadMap` bookkeeping would need restructuring.

#### Approach 3B: Argument that current union is sufficient (Conservative)

The existing union pass ensures `effective[j] = raw[j-1] | raw[j] | raw[j+1]`. The shared terms between adjacent bands are `raw[j]` and `raw[j+1]`. The only difference is `raw[j-1]` vs `raw[j+2]`.

Chain edges span consecutive bands, so `raw[j]` marks columns for edges from row j to j+1. If a chain edge crosses band j (rows j→j+1), then `raw[j]` marks the edge's columns. If the same chain continues to band j+1 (rows j+1→j+2), then `raw[j+1]` marks those columns. Both bands share `raw[j]` and `raw[j+1]`.

The difference (`raw[j-1]` vs `raw[j+2]`) only matters at chain endpoints:
- Chain starts at row j-1: `raw[j-1]` marks its columns, `raw[j+2]` doesn't.
- With expansion=4, the marked columns extend ±4 from the chain's footprint. If the chain is continuous through row j+1, then `raw[j]` or `raw[j+1]` already marks similar columns. Only if the chain is so narrow that its footprint at row j+2 is completely disjoint from its footprint at row j-1 would the effective arrays differ.

**For PotFoundry's feature chains**: Chains span many rows (20+ typically). The U-drift per row is small (<0.001). Adjacent bands' effective arrays differ by at most 1–2 columns at chain endpoints. With expansion=4, this difference is absorbed.

**Empirical check**: Count how many shared-row grid vertices are in one band's strip but not the other's. If this is consistently 0, Approach 3B is justified.

**Trade-offs**:
- 3A: Guaranteed correctness for all chain configurations. O(numT × cellsPerRow) extra memory (~100 KB for typical meshes). Requires restructuring the segment extraction to per-row.
- 3B: No code changes. Relies on the statistical argument that expansion=4 absorbs differences. Risk: edge cases at very short chains (4–5 rows) with significant U-drift.

**Recommended**: Implement Approach 3B (no change) for Round 22. Add a diagnostic counter that logs mismatched strip ranges on shared rows. If the counter is non-zero in practice, implement 3A in a follow-up round.

**Assumptions** (for Verifier to attack):
1. Expansion=4 is sufficient to absorb differences between `raw[j-1]` and `raw[j+2]` for all practical chain configurations.
2. Chains that are ≤4 rows long with >4 columns of U-drift are rare enough to not cause visible T-junctions.
3. The global edge-flip post-pass ([OWT lines 1541+](potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1541)) masks any remaining T-junction artifacts in 3D.

---

### Proposal 4: Shadow Vertex Cleanup (Complementary to P1)

**Idea**: With intermediate grid vertices removed from the boundary (P1), many shadow vertices that existed to bridge the gap between chain and grid positions are no longer needed. Specifically, shadows that were previously too close to grid vertices (causing the R21 sliver problem) are now irrelevant because those grid vertices aren't on the boundary.

**However**, shadows still serve a valuable role: they provide feature-aligned boundary points between the two strip endpoints. Without shadows, the CDT boundary on each row is just 2 points (endpoints), and the CDT must connect interior companions to these 2 endpoints — potentially creating fans.

**Recommendation**: Keep shadows as-is. P1 alone eliminates the shadow-grid proximity problem (since grid columns aren't on the boundary). The existing SHADOW_DEDUP_U=1e-6 dedup is sufficient for shadow-shadow proximity. P2 handles shadow-endpoint proximity as a targeted guard.

**No code change needed for P4.** This is a non-proposal, included for completeness.

---

## Recommended Approach

**Phase 1 (implement now)**: P1 (Boundary Thinning) + P2 (Shadow-Endpoint Proximity Guard)
- P1 is the structural fix. It removes the source of grid structure in CDT strips.
- P2 is the safety net. It prevents the one remaining short-edge source.
- Both modify only the strip construction loops in OWT. ~20 lines changed.

**Phase 2 (diagnostic only)**: P3 as Approach 3B (no code change, add diagnostic counter for mismatched strip ranges).

**Verification strategy**: Export at density=8, expansion=4, all styles. Compare:
- 3D max_aspect, avg_aspect, max_area_ratio → should improve by 10–100×
- Non-manifold count → should decrease or remain stable
- UV R2 violations → should decrease (fewer grid boundary vertices)
- Visual inspection: chain strips should show free-form triangulation without visible row/column alignment

---

## Open Questions

1. **Companion cloud sufficiency**: With only 2–4 boundary points per row, does the T-Ladder + shell companion cloud provide enough interior density near the boundary endpoints? Or will CDT create large triangles connecting a boundary endpoint to a far interior companion? The CDT Delaunay criterion optimizes angles, so as long as there ARE interior points near the endpoints, the triangulation should be fine. But if all companions are clustered near the chain (center of strip), the boundary regions may be under-resolved.

2. **R2 violation metric interpretation**: With P1, the only grid boundary vertices are the 4 strip endpoints (2 per row). R2 violations count triangles connecting features to grid boundary vertices. Since endpoints are at the strip edges (far from the chain), the few R2 violations should involve triangles at the strip boundary — which is expected and acceptable. Is the R2 metric still meaningful?

3. **Standard cell boundary alignment**: Standard cells adjacent to the CDT strip share exactly one edge with the strip boundary: the edge from the strip endpoint to the next standard cell corner vertex (which IS the strip endpoint). This edge is guaranteed shared. But does the CDT ever produce an edge from the strip endpoint that geometrically coincides with the standard cell's row edge but uses a different vertex? This shouldn't happen since the CDT boundary constraint forces the edge to go from the endpoint to the next boundary point (shadow or other endpoint), not along the row.

4. **Shadow vertex adoption by CDT**: Shadows are `isChain: false` and have `gridCol` from `bsearchFloor`. In `ChainStripTriangulator`, the `isBoundary` function checks `idx < gridVCount`. Shadows have `idx >= gridVCount`, so they're NOT classified as "boundary" for R2 purposes. They're also not features (not in constraint endpoints). This means triangles connecting features to shadows don't count as R2 violations — which is correct, since shadows are feature-aligned. But should the R2 metric be updated to distinguish "grid boundary" from "shadow boundary"?
