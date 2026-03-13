# Generator Round 21 — Feature-Shadow Boundary Enrichment

Date: 2026-03-05

## Problem Statement

Despite R19 (U-graded fan) and R20 (anisotropic guard, 7 shells, T-ring, d8/e4 fix), chain strip triangulation still shows catastrophic quality metrics:

- **45.1% of 732,120** chain strip triangles have >4:1 aspect ratio
- **max_area_ratio = 947,119:1**, grading violations (>2:1) = 447,429
- **max_aspect = 3,266,301:1** in 3D, 247,350 aspect rejects in 3D edge flip

**Root cause (confirmed)**: The CDT strip boundary is **locked to the grid**. `stripBot` and `stripTop` contain exclusively grid vertices at CDF-adaptive U-positions. Chain vertices are promoted to interior (D-Radical, at ±PROMO_EPSILON offset). CDT connects these misaligned sets:

```
stripTop:  grid@0.509 ──────────────────── grid@0.515    (boundary)
                  \         ╲          ╱        /
                   \         ╲        ╱        /
                    \      chain@0.5123       /            (interior, promoted)
                   /         ╱        ╲        \
                  /         ╱          ╲        \
stripBot:  grid@0.509 ──────────────────── grid@0.515    (boundary)
```

The chain vertex fans to the 4 corner grid vertices. The bottom fan triangle has base = 0.006U, height = PROMO_ε × tGap ≈ 0.000115. Aspect ratio ≈ **52:1**. Interior companions reduce this somewhat but cannot fix the boundary shape itself.

**The insight**: If the boundary had vertices at U=0.5123, the chain→boundary connection would be direct and well-aligned:

```
stripTop:  grid@0.509 ── SHADOW@0.5123 ── grid@0.515    (enriched boundary)
                  \         |    |         /
                   \       chain@0.5123   /               (interior, promoted)
                  /         |    |         \
stripBot:  grid@0.509 ── SHADOW@0.5123 ── grid@0.515    (enriched boundary)
```

CDT connects chain→shadow vertically (max aspect from chain→shadow ≈ 1:1), and shadow→grid horizontally (normal grid edges). No more fanning.

---

## Proposals

### Proposal 1: Chain-Shadow Boundary Vertices (RECOMMENDED — Primary Fix)

**Idea**: For each chain vertex promoted from a boundary row to interior, create a "shadow" vertex at the same U-position on both strip boundaries. Shadows are grid-type boundary vertices that align the boundary contour with the feature geometry.

**Mathematical basis**: The CDT Delaunay criterion maximizes minimum angles. With shadows at feature U-positions, the nearest boundary vertex to each promoted chain vertex is directly above/below it (distance = PROMO_ε × tGap). Without shadows, the nearest boundary vertex is at the nearest grid column (distance = Δu_grid, potentially 10-50× larger). The Delaunay criterion then creates chain→shadow connections (short, well-aligned) instead of chain→grid connections (long, fanning).

**Mechanism**:

#### Step 1: Pre-count shadow vertex budget

Before the vertex array is allocated (OWT line 859), compute an upper bound on shadow vertices:

```typescript
// After allChainVertices is finalized, before vertex array allocation:
// Each row-boundary chain vertex (cv.t === undefined) may create
// at most 2 shadow vertices per band it participates in.
// A chain vertex at row j participates in bands (j-1, j) and (j, j+1).
// In band (j, j+1) as botRow → shadow on bot + shadow on top = 2 shadows.
// In band (j-1, j) as topRow → shadow on bot + shadow on top = 2 shadows.
// But many shadows will dedup (same U on adjacent bands shares the boundary row).
// Conservative upper bound: 2 × rowBoundaryCvCount.
const maxShadowCount = 2 * rowBoundaryCvCount;
```

Enlarge the vertex array allocation:

```typescript
// OWT line 861, currently:
// const vertices = new Float32Array((totalVertexCount + rowBoundaryCvCount) * 3);
// Proposed:
const vertices = new Float32Array((totalVertexCount + rowBoundaryCvCount + maxShadowCount) * 3);
```

#### Step 2: Shadow vertex allocator

After the topDupMap construction (OWT line ~897), add a shadow vertex allocator:

```typescript
// Shadow vertex index allocation starts after topDup indices.
let nextShadowIdx = totalVertexCount + rowBoundaryCvCount; // after topDup region
const SHADOW_DEDUP_THRESHOLD = 1e-6; // U-distance below which shadows merge

function allocateShadowVertex(u: number, t: number): number {
    const idx = nextShadowIdx++;
    vertices[idx * 3 + 0] = u;
    vertices[idx * 3 + 1] = t;
    vertices[idx * 3 + 2] = surfaceId;
    return idx;
}
```

#### Step 3: Shadow insertion during strip construction

In the strip assembly loop (OWT lines 1214-1254), after building `stripBot`, `stripTop`, and `stripInteriorVerts`, insert shadow vertices:

```typescript
// ── Shadow boundary enrichment ──
// For each chain vertex promoted to interior from botRow or topRow,
// project its U-position onto BOTH strip boundaries. This creates
// grid-aligned boundary vertices that match the feature geometry,
// enabling direct chain→shadow CDT connections instead of fan-to-grid.

const shadowUs: number[] = []; // U-positions needing shadows

// Collect U-positions from all promoted chain vertices in this strip
for (const sv of stripInteriorVerts) {
    if (!sv.isChain || sv.promotedT === undefined) continue;
    // Only consider chain vertices promoted from botRow or topRow
    // (not 2D interior companions which have gridCol === -1 and no promotedT via this path)
    shadowUs.push(sv.u);
}

// Dedup shadow U-positions (multiple chain vertices at nearby U)
shadowUs.sort((a, b) => a - b);
const dedupedShadowUs: number[] = [];
for (const su of shadowUs) {
    if (dedupedShadowUs.length === 0 ||
        Math.abs(su - dedupedShadowUs[dedupedShadowUs.length - 1]) > SHADOW_DEDUP_THRESHOLD) {
        dedupedShadowUs.push(su);
    }
}

// Insert shadow vertices onto both boundaries
for (const shadowU of dedupedShadowUs) {
    // Skip if U is outside the strip range (shouldn't happen, but guard)
    if (shadowU < uStripLeft - 1e-9 || shadowU > uStripRight + 1e-9) continue;

    // Bot boundary: skip if already a vertex near this U
    const hasBotMatch = stripBot.some(sv => Math.abs(sv.u - shadowU) < SHADOW_DEDUP_THRESHOLD);
    if (!hasBotMatch) {
        const shadowIdx = allocateShadowVertex(shadowU, tBot);
        stripBot.push({ idx: shadowIdx, u: shadowU, isChain: false, gridCol: -1 });
    }

    // Top boundary: skip if already a vertex near this U
    const hasTopMatch = stripTop.some(sv => Math.abs(sv.u - shadowU) < SHADOW_DEDUP_THRESHOLD);
    if (!hasTopMatch) {
        const shadowIdx = allocateShadowVertex(shadowU, tTop);
        stripTop.push({ idx: shadowIdx, u: shadowU, isChain: false, gridCol: -1 });
    }
}

// Re-sort boundaries by U (shadows may have been inserted out of order)
if (dedupedShadowUs.length > 0) {
    stripBot.sort((a, b) => a.u - b.u);
    stripTop.sort((a, b) => a.u - b.u);
}
```

#### Step 4: Boundary polygon closure integrity

The strip boundary polygon is: bot-left → bot-right → top-right → top-left → bot-left. Adding shadow vertices to stripBot/stripTop adds intermediate boundary edges but does NOT change the polygon closure. The existing code already ensures bot-left and bot-right endpoint vertices exist (OWT lines 1230-1234). Shadow vertices are interior to the boundary arrays, between the endpoints. CDT's `addEdge` loop (ChainStripTriangulator.ts line 227) iterates consecutive pairs in bot/top, so additional vertices just create additional boundary edge segments. ✓

**Key invariant preservation**:
- `stripBot` sorted by U ✓ (re-sort after insertion)
- No duplicate indices ✓ (dedup by U-distance)
- Endpoints guaranteed ✓ (shadow U is within strip range, endpoints are handled separately)
- Boundary polygon closed ✓ (bot-left/right and top-left/right indices unchanged)

#### Vertex index space analysis

Current index layout:
```
[0 ........................ gridVertexCount)     — grid vertices
[gridVertexCount .......... totalVertexCount)    — chain + companion vertices
[totalVertexCount ......... totalVertexCount+N)  — D-Radical topDup vertices
[totalVertexCount+N ....... totalVertexCount+N+S) — NEW: shadow vertices
```

Shadow indices are above all existing ranges. No existing code path checks `vIdx >= totalVertexCount + topDupCount`, so shadows are invisible to:
- `batch2Remap` (operates on chain vertex indices only) ✓
- `topDupMap` / `topDupReverse` (operates on chain vertex indices only) ✓
- D-Radical duplicate logic (uses `cv.t === undefined` guard) ✓
- Constraint endpoint injection (lines 1328-1360) — shadows are NOT constraint endpoints ✓

The only consumers of shadow vertex indices are:
1. **CDT boundary edges** — `addEdge(bot[i], bot[i+1])` in ChainStripTriangulator. These use `globalToLocal` map, which accepts any index. ✓
2. **Final triangle output** — `localToGlobal` maps back to shadow indices, which index into the `vertices` array for STL UV→3D conversion. ✓
3. **Edge verification** (OWT line 1490+) — uses `totalVerts = totalVertexCount` cutoff to skip topDup. Shadow indices are above this range and are also skipped, which is correct (shadows are grid-type boundary vertices, not feature edges). ✓

#### Expected metric improvements

**Aspect ratio**:
- Before: chain vertex fans to nearest grid columns. Worst case: base = grid_spacing ≈ 0.003U, height = PROMO_ε × tGap ≈ 0.000115. Aspect = **26:1** minimum, up to **52:1** when chain sits between two grid columns.
- After: chain vertex connects to shadow directly above/below. The chain→shadow triangle has base = distance to next boundary vertex (either shadow from adjacent chain or grid column), height = PROMO_ε × tGap. With shadow-to-shadow spacing matching chain-to-chain spacing, max aspect ≈ **5-10:1** for the near-chain triangles.
- The **4:1 threshold violation count** should drop from 45.1% to <15%.

**Area ratio**:
- Before: smallest triangles are companion-to-companion (area ≈ 1e-8 sq UV units), largest are boundary-fill quads (area ≈ grid_spacing × tGap ≈ 6.9e-6). But extreme outlier area ratios come from unshadowed strips where one triangle spans a full grid cell width while its neighbor is a sliver. Max = 947,119:1.
- After: every boundary segment between shadows is ≤ grid_spacing/2 (shadow splits the long edge). Max boundary fill triangle area ≈ (grid_spacing/2) × tGap/2 ≈ 1.7e-6. The area ratio clamps to ≈ **200:1** worst case, **10-50:1** typical.
- Grading violations (>2:1 adjacent area ratio) should drop from 447,429 to <50,000.

**3D quality**:
- The extreme 3D aspect ratio (3,266,301:1) comes from UV slivers mapped through the parametric surface. Slivers with U-span >> T-span become stretched circumferentially. With shadows reducing U-span slivers, the 3D max should improve proportionally. Expected max_aspect_3D: **<1,000:1**.

#### Risk assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Shadow vertex array overflow | Low | Conservative bound = 2 × rowBoundaryCvCount ≈ 800. At 12 bytes each = 9.6KB. Negligible. |
| Shadow dedup misses near-coincident vertices causing CDT collapse | Low | SHADOW_DEDUP_THRESHOLD = 1e-6 matches existing companion dedup. CDT uses exact arithmetic. |
| Shadow vertices at strip boundary endpoints create duplicate boundary polygon vertices | Low | hasBotMatch/hasTopMatch check prevents duplication. Endpoint indices are handled separately. |
| Performance: O(n²) `stripBot.some()` for each shadow U | Medium | Typical strip has 5-12 boundary vertices. O(n²) is negligible. For pathological strips with 50+ vertices, can switch to binary search. |
| Shadow vertex at seam (U≈0 or U≈1) creates topology issues | Low | Shadow U comes from chain vertex U, which is already seam-guarded during chain linking. |

**Files affected**:
- `OuterWallTessellator.ts` lines 859-861 (vertex array allocation), ~897 (shadow allocator), 1214-1254 (shadow insertion in strip loop)
- No changes to `ChainStripTriangulator.ts` — shadows are standard boundary vertices

---

### Proposal 2: Boundary Subdivision (Complementary — Direction B)

**Idea**: After shadow insertion, subdivide any remaining long boundary edge in `stripBot`/`stripTop`. For each consecutive boundary pair with U-gap exceeding a threshold, insert a midpoint vertex.

**Mechanism**:

```typescript
// After shadow insertion, before CDT:
const MAX_BOUNDARY_GAP = averageChainSpacing * 2.0; // or a fixed threshold like 0.003

function subdivideBoundary(strip: StripVertex[], tVal: number): void {
    const insertions: { afterIdx: number; u: number }[] = [];
    for (let k = 0; k < strip.length - 1; k++) {
        const gap = strip[k + 1].u - strip[k].u;
        if (gap > MAX_BOUNDARY_GAP) {
            const nDiv = Math.ceil(gap / MAX_BOUNDARY_GAP);
            for (let d = 1; d < nDiv; d++) {
                const midU = strip[k].u + (gap * d) / nDiv;
                insertions.push({ afterIdx: k, u: midU });
            }
        }
    }
    // Insert in reverse order to preserve indices
    for (let m = insertions.length - 1; m >= 0; m--) {
        const { afterIdx, u } = insertions[m];
        const midIdx = allocateShadowVertex(u, tVal);
        strip.splice(afterIdx + 1, 0, { idx: midIdx, u, isChain: false, gridCol: -1 });
    }
}

subdivideBoundary(stripBot, tBot);
subdivideBoundary(stripTop, tTop);
```

**Mathematical basis**: Even with P1 shadows, sectors of the strip far from chain vertices retain grid-only spacing. A chain vertex at U=0.50 with grid columns at 0.49 and 0.51 gets shadows at 0.50 on both boundaries. But the boundary segments [0.49, 0.50] and [0.50, 0.51] are still full grid-spacing long. If a companion at (0.505, mid-T) connects to boundary vertex at 0.51 and shadow at 0.50, the triangle base is grid_spacing/2. Subdivision would split [0.50, 0.51] at 0.505, creating a direct connection.

**Trade-offs**:
- **Benefit**: Reduces maximum boundary segment length uniformly. Helps area grading in regions away from chain vertices. Reduces max area ratio by ~4× beyond P1 alone.
- **Cost**: Creates O(columns) additional vertices per strip. With expansion=4, a 9-column strip might gain 0-3 subdivision vertices. Negligible memory/compute cost.
- **Risk**: Subdivision midpoints don't correspond to any feature. CDT may create triangles connecting midpoints to interior/chain vertices at non-matching U-positions, creating mild misalignment. But this is MUCH less severe than the original grid misalignment because the subdivision threshold is larger than the shadow dedup threshold.

**Does it help beyond P1?** Yes, mildly. P1 aligns the boundary at feature U-positions. P2 subdivision fills the remaining gaps between features with uniform density. The complementary benefit is approximately **1.5-2× additional reduction** in max area ratio beyond P1 alone.

**Verdict**: Implement after P1 is validated. Low risk, modest benefit.

**Assumptions** (for Verifier to attack):
1. Subdivision midpoints as boundary vertices don't break the non-manifold edge guarantee for adjacent grid cell strips.
2. The MAX_BOUNDARY_GAP threshold doesn't need to be anisotropic (considering circumferential stretch).
3. splice() on a sorted array with in-order insertions maintains sorted order.

---

### Proposal 3: Shell Fraction Rebalancing (Deferred Until After P1)

**Idea**: With shadow vertices providing boundary alignment, the innermost shells (0.04, 0.09) become less critical for aspect-ratio reduction. Rebalance shells toward area-grading positions.

**Current shells**: `[0.04, 0.09, 0.16, 0.25, 0.45, 0.72, 1.0]`

The ultra-near shells (0.04, 0.09) were designed to fight the chain→boundary fan problem. With shadows, the chain→boundary connection is direct (via shadow). The companion role shifts from "breaking up the fan" to "filling area grading between chain and boundary."

**Proposed rebalanced shells (post-shadow)**:

```typescript
// Geometric progression r ≈ 1.7, starting from 0.10:
// 0.10, 0.17, 0.29, 0.50, 0.85, 1.0
const SHELL_FRACTIONS_V2 = [0.10, 0.17, 0.29, 0.50, 0.85, 1.0] as const;
```

**Rationale**:
- Shell 0 at 0.10 (was 0.04): No longer needs to fight the constraint guard — the shadow vertex on the boundary is at the chain's U-position. The companion at 0.10 × halfWidth fills the gap between the shadow and the next grid column.
- 6 shells instead of 7: Fewer shells means more T-levels per shell at the same budget. With MAX_FAN_PER_BAND=40 and 6 shells, each shell gets ~3 T-levels instead of ~2, improving T-density.
- Geometric progression (r ≈ 1.7): Each shell-to-shell gap grows by a constant factor, matching CDT's natural area grading behavior. Adjacent triangles between shells have area ratio ≈ r² ≈ 2.9:1, close to the 2:1 ideal.

**Trade-offs**:
- **Benefit**: Better area grading (geometric progression vs. current ad-hoc spacing). Fewer guard rejects (shell 0 at 0.10 survives even for drifting chains, per V20-C2 analysis).
- **Cost**: Loses ultra-near density that may still be valuable for very thin ridge features.
- **Risk**: The optimal shell positions depend on shadow enrichment results. Premature optimization.

**Verdict**: Do NOT implement simultaneously with P1. Run P1, measure area_ratio and grading_violations, THEN optimize shells. The current shells are functional; the shadow fix addresses the dominant defect.

**Assumptions** (for Verifier to attack):
1. With shadows, the chain→boundary fan triangle is eliminated, making sub-0.10 shells unnecessary.
2. Geometric progression produces better area grading than the current ad-hoc spacing.
3. 6 shells with more T-levels per shell is better than 7 shells with fewer T-levels.

---

### Proposal 4: Hybrid Shadow + Refined Shells (Direction D)

**Idea**: Full combination: P1 (shadow boundary enrichment) + P2 (boundary subdivision) + P3 (rebalanced shells).

**Mechanism**: Sequential application:
1. Shadow insertion aligns boundaries with features
2. Boundary subdivision fills remaining long edges
3. Rebalanced shells place companions at geometric-progression positions

**Expected combined metrics**:

| Metric | Current | After P1 | After P1+P2 | After P1+P2+P3 |
|--------|---------|----------|-------------|-----------------|
| >4:1 aspect ratio % | 45.1% | ~15% | ~12% | ~8% |
| max_area_ratio | 947,119:1 | ~200:1 | ~50:1 | ~20:1 |
| grading_violations (>2:1) | 447,429 | ~50,000 | ~30,000 | ~10,000 |
| max_aspect_3D | 3,266,301:1 | ~1,000:1 | ~500:1 | ~200:1 |

The **S-curve of diminishing returns** is steep:
- P1 alone: **95% of the improvement** (eliminates the fundamental boundary misalignment)
- P1+P2: additional 3% (fills remaining boundary gaps)
- P1+P2+P3: additional 2% (optimizes interior companion placement)

**Recommended implementation order**: P1 → measure → P2 if needed → P3 if needed.

**Assumptions** (for Verifier to attack):
1. The metric improvement estimates are order-of-magnitude correct (not verified by simulation).
2. P1 dominance holds across all styles (styles with many closely-spaced features may see different ratios).
3. The interaction between P2 subdivision and P3 shell rebalancing is additive, not conflicting.

---

## Open Questions

### Q1: Shadow vertex T-junction risk at strip/grid boundary

When a CDT strip is adjacent to a standard grid cell, the shared boundary row is `stripBot[i]` for the strip and the bottom row of the grid cell. If we add a shadow vertex to stripBot at U=0.5123, but the adjacent grid cell only has grid vertices at U=0.509 and U=0.515, there's a T-junction at the shadow vertex.

**Analysis**: This T-junction is **identical** to the existing T-junction risk from chain vertices in `buildMergedRow`. The merged row already contains chain vertices at arbitrary U-positions — these create T-junctions with ANY adjacent cell that doesn't include them. The fix (which already exists) is the `colHasChain` expansion: adjacent bands mark the same columns as chain-involved, so both sides use CDT. Since shadow vertices are added inside the CDT strip (not in the adjacent grid cell), and the colHasChain expansion already ensures the adjacent cell also uses CDT, the T-junction is covered by the existing infrastructure.

**Wait** — is this actually true? The colHasChain expansion is based on which columns contain chain edges, not on which columns contain shadow vertices. If a shadow vertex sits at a U-position that falls within an expanded column range, it's covered. If it falls outside the expansion... but expansion=4 already covers ±4 columns beyond the chain. Shadow vertices are at chain vertex U-positions, which are within the chain columns by definition. So the shadow is within the CDT strip, and the CDT strip is expanded to include the shadow. ✓

**BUT**: The shadow vertex is on the boundary row shared with the adjacent band. If the adjacent band's strip doesn't include a vertex at shadowU, there's a T-junction on the shared row. The adjacent band's `buildMergedRow` for the same row won't include the shadow (it's not a chain vertex or grid vertex). The adjacent band's CDT will have boundary edges that skip over shadowU.

**This is a real risk.** Mitigation:
1. **Accepted T-junction**: The shadow vertex creates a T-junction on the shared row. But this row is already CDT-processed on both sides (due to colHasChain expansion). The adjacent band's CDT has a boundary edge from grid@0.509 to grid@0.515 that passes through shadowU. The shadow vertex is NOT in the adjacent band's CDT, so there's a genuine T-junction: one band's boundary has 3 vertices (grid, shadow, grid), the other has 2 (grid, grid).
2. **Fix**: Add shadow vertices to the shared row in BOTH adjacent bands. This means shadow vertices should be inserted into `buildMergedRow`'s output, not just into per-strip boundaries. Alternatively, propagate shadow U-positions to the `rowChainVerts` map so `buildMergedRow` includes them.

This is the **hardest part** of the proposal. I see three sub-options:

**Q1a: Accept T-junctions.** They cause non-manifold edges at the exact shadow position. But existing chain vertices already cause T-junctions that are handled by the colHasChain expansion forcing both bands to use CDT. If BOTH bands use CDT, and both bands' boundary rows share vertex indices at the junction, there are no T-junctions. The question is whether shadow indices are shared.

**Q1b: Pre-insert shadows into buildMergedRow.** Before the band iteration loop, compute all shadow U-positions per row. Insert them into `rowChainVerts` (or a separate `rowShadowVerts` map) so `buildMergedRow` includes them. Both bands sharing a row will then have the shadow vertex in their merged row output, using the same vertex index. No T-junction.

**Q1c: Shadow vertices as per-strip boundary-only, with boundary stitching.** Keep shadows per-strip, but in the adjacent band, insert the same shadow vertex index into the boundary. This requires knowing which shadows were created in the previous band.

**Recommended**: Q1b. Pre-computed shadow positions per row, inserted into `buildMergedRow`. This is the cleanest solution and guarantees shared vertex indices across adjacent bands.

### Q2: Companion guard interaction with shadow vertices

Should the constraint guard (`isNearConstraintEdge`) be applied to shadow vertex positions? Shadows are boundary vertices, not interior Steiner points. The guard exists to prevent interior companions from being too close to constraint edges (causing thin CDT triangles). Shadow vertices ARE on the boundary — they don't create thin CDT triangles because they're part of the boundary polygon, not free Steiner points. **No guard needed.** ✓

### Q3: Shadow vertex count scaling

For a typical export:
- 200 chain vertices on row boundaries
- Each creates 2 shadows per band (bot + top) × 2 bands (above + below) = up to 4 shadows
- With dedup (shared boundary rows between adjacent bands), effective = ~2 shadows per chain vertex
- Total shadows: ~400 vertices × 12 bytes = 4.8KB

At extreme feature density (500 chain vertices, 10 per row):
- ~1000 shadows, ~12KB. Still negligible vs. the 685×432 = 295,920 grid vertex array (3.4MB).

No concerns about scaling.

---

## Detailed Implementation Plan for P1 (Q1b Strategy)

The cleanest implementation combines shadow pre-computation with `buildMergedRow` integration:

### Phase A: Pre-compute shadow U-positions per row

After companion generation (step 1.5) and before vertex array allocation (step 2):

```typescript
// ── 1.6: Pre-compute shadow U-positions for boundary enrichment ──
// For each row-boundary chain vertex, record its U-position on the row.
// Shadow vertices will be created at these U-positions to align strip
// boundaries with feature geometry.
const rowShadowUs = new Map<number, number[]>(); // row → sorted shadow U-positions

for (const cv of chainVertices) { // original chain vertices only, not companions
    if (cv.t !== undefined) continue; // skip 2D interior companions
    const row = cv.rowIdx;
    // Project shadow U onto the same row (direct), plus adjacent rows
    // (the strip spans from row j to j+1, so chain at row j needs
    // shadow at row j AND potentially row j+1, and vice versa).
    for (const targetRow of [row - 1, row, row + 1]) {
        if (targetRow < 0 || targetRow >= numT) continue;
        let list = rowShadowUs.get(targetRow);
        if (!list) { list = []; rowShadowUs.set(targetRow, list); }
        list.push(cv.u);
    }
}

// Sort and dedup per-row shadow U-positions
const SHADOW_DEDUP_U = 1e-6;
for (const [row, list] of rowShadowUs) {
    list.sort((a, b) => a - b);
    const deduped: number[] = [list[0]];
    for (let k = 1; k < list.length; k++) {
        if (list[k] - deduped[deduped.length - 1] > SHADOW_DEDUP_U) {
            deduped.push(list[k]);
        }
    }
    rowShadowUs.set(row, deduped);
}

// Remove shadows that coincide with existing grid columns
for (const [row, list] of rowShadowUs) {
    const filtered = list.filter(su => {
        // Binary search in unionU for coincidence
        const col = bsearchFloor(unionU, su);
        if (col >= 0 && col < numU && Math.abs(unionU[col] - su) < 1e-6) return false;
        if (col + 1 < numU && Math.abs(unionU[col + 1] - su) < 1e-6) return false;
        return true;
    });
    if (filtered.length > 0) {
        rowShadowUs.set(row, filtered);
    } else {
        rowShadowUs.delete(row);
    }
}

// Count total shadow vertices for buffer allocation
let totalShadowCount = 0;
for (const [, list] of rowShadowUs) totalShadowCount += list.length;
```

### Phase B: Enlarge vertex array and allocate shadow vertices

```typescript
// Modify vertex array allocation (OWT line 861):
const vertices = new Float32Array(
    (totalVertexCount + rowBoundaryCvCount + totalShadowCount) * 3
);

// After filling grid + chain + topDup vertices...
// Allocate shadow vertex indices and positions:
let nextShadowIdx = totalVertexCount + rowBoundaryCvCount; // after topDup
const shadowVertexMap = new Map<string, number>(); // "row:u" → vertex index

for (const [row, shadowList] of rowShadowUs) {
    const tVal = activeTPositions[row];
    for (const su of shadowList) {
        const key = `${row}:${su.toFixed(8)}`;
        const idx = nextShadowIdx++;
        shadowVertexMap.set(key, idx);
        vertices[idx * 3 + 0] = su;
        vertices[idx * 3 + 1] = tVal;
        vertices[idx * 3 + 2] = surfaceId;
    }
}
```

### Phase C: Integrate shadows into buildMergedRow

```typescript
// In buildMergedRow (OWT line 948), after interleaving grid + chain:
// Insert shadow vertices at their U-positions.
const buildMergedRow = (row: number): StripVertex[] => {
    const result: StripVertex[] = [];
    const chainList = rowChainVerts.get(row) || [];
    const shadowList = rowShadowUs.get(row) || []; // NEW
    let ci = 0;
    let si = 0; // shadow index                                   // NEW

    for (let i = 0; i < numU; i++) {
        // Insert chain vertices before this grid column
        while (ci < chainList.length && chainList[ci].u < unionU[i] - 1e-9) {
            // ... existing chain insertion logic ...
            ci++;
        }

        // Insert shadow vertices before this grid column           // NEW
        while (si < shadowList.length && shadowList[si] < unionU[i] - 1e-9) {
            const su = shadowList[si];
            const key = `${row}:${su.toFixed(8)}`;
            const shadowIdx = shadowVertexMap.get(key);
            if (shadowIdx !== undefined) {
                const col = i > 0 ? i - 1 : 0;
                result.push({ idx: shadowIdx, u: su, isChain: false, gridCol: col });
            }
            si++;
        }

        // Coincidence check: chain vs grid (existing batch 2 logic)
        // ... existing code ...

        // Insert chain vertices between this and next grid column
        // ... existing code ...

        // Insert shadow vertices between this and next grid column  // NEW
        const uNextShadow = (i < numU - 1) ? unionU[i + 1] : 1.0 + 1e-6;
        while (si < shadowList.length && shadowList[si] < uNextShadow - 1e-9) {
            const su = shadowList[si];
            const key = `${row}:${su.toFixed(8)}`;
            const shadowIdx = shadowVertexMap.get(key);
            if (shadowIdx !== undefined) {
                result.push({ idx: shadowIdx, u: su, isChain: false, gridCol: i });
            }
            si++;
        }
    }

    // Remaining shadows beyond last grid column                    // NEW
    while (si < shadowList.length) {
        const su = shadowList[si];
        const key = `${row}:${su.toFixed(8)}`;
        const shadowIdx = shadowVertexMap.get(key);
        if (shadowIdx !== undefined) {
            result.push({ idx: shadowIdx, u: su, isChain: false, gridCol: numU - 1 });
        }
        si++;
    }

    // Existing sort + dedup pass handles any ordering issues
    result.sort((a, b) => a.u - b.u);
    // ... existing dedup logic ...
    return result;
};
```

### Phase D: Strip construction — no changes needed

With shadows already in `buildMergedRow` output and marked `isChain: false`, they flow naturally into `stripBot`/`stripTop` during the existing strip construction loop (OWT lines 1218-1254). They are NOT promoted to interior (because `isChain: false`). They participate as standard boundary vertices. ✓

The **strip boundary polygon** automatically includes shadow vertices as intermediate boundary points. CDT creates boundary edges between consecutive stripBot/stripTop entries, including shadow vertices. The chain vertices (promoted to interior at PROMO_EPSILON offset) connect via CDT Delaunay criterion to the nearest boundary vertex — which is now the shadow directly above/below. ✓

**No changes to ChainStripTriangulator.ts.** ✓
**No changes to constraint edge handling.** ✓
**No changes to companion generation.** ✓

---

## Recommended Approach

**P1 (Chain-Shadow Boundary Vertices) via Q1b strategy is the single highest-impact change.** It addresses the root cause (boundary misalignment) without modifying any other subsystem. The implementation touches only OuterWallTessellator.ts, modifying three sites:

1. **Phase A** (new section after line ~856): Pre-compute shadow U-positions per row
2. **Phase B** (modify lines 859-861, add after ~897): Enlarge vertex array, populate shadow vertices
3. **Phase C** (modify lines 948-1034): Integrate shadow vertices into `buildMergedRow`

Total new code: ~80 lines. No deletions. No changes to CDT, companion generation, constraint handling, or edge verification.

P2 (boundary subdivision) and P3 (shell rebalancing) are deferred until P1 is measured from a full export at d8/e4.

---

## Appendix: Alternative Shadow Strategy Considered and Rejected

**Per-strip shadow creation** (Q1a/Q1c): Instead of pre-computing shadows per row and integrating into `buildMergedRow`, create shadow vertices during strip construction (after stripBot/stripTop are built). This is simpler to implement but creates T-junctions on shared boundary rows between adjacent bands. The adjacent band's CDT doesn't know about the shadow vertex, so it has a boundary edge spanning the shadow position without a vertex there. This creates non-manifold edges at the shadow position.

**Why Q1b is better**: By integrating shadows into `buildMergedRow`, both adjacent bands that share a row automatically include the shadow vertex with the same vertex index. Both bands' CDT strips have matching boundary vertices at the shadow position. No T-junction. No non-manifold edges.

---

## Summary Table

| Proposal | Priority | Impact | Risk | Complexity | Recommendation |
|----------|----------|--------|------|------------|----------------|
| P1: Chain-Shadow | CRITICAL | 95% of fix | Low | Medium (80 LOC) | **IMPLEMENT NOW** |
| P2: Boundary Subdivision | LOW | ~3% additional | Low | Low (30 LOC) | Defer until P1 measured |
| P3: Shell Rebalancing | LOW | ~2% additional | Medium | Low (1 line) | Defer until P1 measured |
| P4: Hybrid (P1+P2+P3) | — | Cumulative | — | — | Sequential evaluation |
