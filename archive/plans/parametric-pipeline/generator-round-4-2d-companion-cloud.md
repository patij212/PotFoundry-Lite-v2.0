# Generator Round 4 — 2D Companion Cloud Design

Date: 2026-03-04

## Context

The user rejects all density reduction approaches. The goal is **maximum definition around feature edges**. The Verifier confirmed that the GPU `evaluatePoints` infrastructure already supports arbitrary (U, T) evaluation, making 2D companion clouds feasible with existing pipeline.

The current companion system places vertices on a 1D line (varying U, constant T per row). This creates slivers regardless of density setting because the T-gap to adjacent rows is 5-40× larger than the U-spacing between companions. The fix is 2D placement: companions at fractional T-positions between rows, creating an isotropic vertex cloud around each chain vertex.

---

## Design Overview

### The Geometry Problem

A chain vertex at position `(U_cv, T_row)` sits inside a grid cell bounded by:
- **U**: `[U_left, U_right]` — two adjacent grid columns
- **T**: `[T_row, T_row+1]` — two adjacent grid rows (or `[T_row-1, T_row]` for the band below)

Current companions spread across U within the same T_row:
```
T_row+1  ─────────────────────────  (distant — no companions here)
                                    
                                    
T_row    ─ c ─ c ─ c ─ CV ─ c ─ c ─  (all companions on this line)
                                    
                                    
T_row-1  ─────────────────────────  (distant — no companions here)
```

This gives CDT a 1D point set plus distant boundary rows. Result: extreme slivers.

### The 2D Cloud

Place companions in a **diamond/disc** pattern centered on the chain vertex, extending into the T-gap between rows:

```
T_row+1  ────────────────────────  (grid row — strip boundary)
                  · · ·           
              ·    ·    ·         
          ·    ·   ·   ·    ·     
T_row    ─ ·  ·  · CV ·  ·  · ─  (chain vertex + U-companions)
          ·    ·   ·   ·    ·     
              ·    ·    ·         
                  · · ·           
T_row-1  ────────────────────────  (grid row — strip boundary)
```

Each `·` is a companion vertex at a specific `(u, t)` position. GPU `evaluatePoints` computes the 3D position for each.

---

## Proposal P1: Concentric Ring Distribution

### Geometry

For each chain vertex at `(U_cv, T_row)`, place companions in concentric rings around it:

**Ring 0** (core): The chain vertex itself — already exists.

**Ring 1** (inner): 4-6 companions at radius `r₁` from the chain vertex. Provides immediate local density for CDT.

**Ring 2** (outer): 6-8 companions at radius `r₂ > r₁`. Provides transition density toward the grid.

**Optional Ring 3** (at high density settings): 8-10 companions at radius `r₃`. Extra definition.

### Radius Calculation

The cloud must fit within the local cell without overlapping the grid boundary or adjacent chain vertex clouds. The governing dimensions are:

- `halfGapU = min(U_cv - U_left, U_right - U_cv)` — half the U-space available
- `halfGapT_above = (T_row+1 - T_row) / 2` — half the T-space to next row above
- `halfGapT_below = (T_row - T_row-1) / 2` — half the T-space to next row below
- `halfGapT = min(halfGapT_above, halfGapT_below)` — usable T-radius

The cloud radius in U and T should be isotropic in the CDT's normalized coordinate system. But U and T have different physical scales. The CDT normalizer uses `scale = max(uRange, tRange)` to map both to [0, 1]. Within a single cell:

- `cellU = U_right - U_left ≈ 0.00173`
- `cellT = T_row+1 - T_row ≈ 0.0032`

Aspect ratio of the cell: `cellT / cellU ≈ 1.85`. So the cloud should be slightly elongated in U to appear isotropic after CDT normalization.

**Ring radii** (in parameter space):

```
r₁ = min(halfGapU * 0.35, halfGapT * 0.35)   // inner ring — 35% of available space
r₂ = min(halfGapU * 0.70, halfGapT * 0.70)   // outer ring — 70% of available space
r₃ = min(halfGapU * 0.90, halfGapT * 0.90)   // optional — 90%
```

The `min(...)` ensures the cloud stays within both U and T bounds.

### Point Placement Per Ring

For ring `k` at radius `rₖ`, place `N_k` points at equally-spaced angles:

```
for i in 0..N_k:
    angle = 2π × i / N_k + offset_k    // offset rotates each ring to avoid alignment
    du = rₖ × cos(angle) × (cellU / cellT)  // scale U to match T aspect
    dt = rₖ × sin(angle)
    companion_u = U_cv + du
    companion_t = T_row_value + dt
```

Wait — this needs refinement. The `du` scaling by `cellU / cellT` is wrong because we want isotropy in **CDT space**, not in parameter space. CDT normalizes by `scale = max(uRange, tRange)` within each strip. For a single chain cell, the strip uRange ≈ cellU and tRange ≈ cellT, so:

```
normalized_du = du / max(cellU, cellT)
normalized_dt = dt / max(cellU, cellT)
```

For isotropy in CDT space, we want `|normalized_du| ≈ |normalized_dt|`, which means raw `du ≈ dt` since both are divided by the same scale. So no aspect correction needed in the placement — the CDT's uniform scaling handles it.

Corrected placement:

```
for i in 0..N_k:
    angle = 2π × i / N_k + offset_k
    du = rₖ × cos(angle)
    dt = rₖ × sin(angle)
    companion_u = U_cv + du
    companion_t = T_row_value + dt
```

But we must clamp: `companion_u ∈ [U_left + ε, U_right - ε]` and `companion_t ∈ [T_row-1 + ε, T_row+1 - ε]`. Any companion outside the cell is dropped.

### Ring Configuration by Density

| Density Setting | Ring 1 (inner) | Ring 2 (outer) | Ring 3 (extra) | Total per CV |
|----------------|----------------|----------------|----------------|--------------|
| 1 | 4 points | — | — | 4 |
| 2 | 4 points | 6 points | — | 10 |
| 3 | 6 points | 8 points | — | 14 |
| 4 (default) | 6 points | 8 points | — | 14 |
| 6 | 6 points | 8 points | 10 points | 24 |
| 8 | 6 points | 10 points | 12 points | 28 |
| 12 | 8 points | 12 points | 16 points | 36 |

At density=4 (default), that's 14 companions per chain vertex × 6,606 chain vertices = ~92K companions. Less than the current 130K at density=12, and with dramatically better aspect ratios because they're 2D placed.

### Density Gradient

Ring 1 (innermost) provides the highest density near the chain edge — this is where the mesh needs maximum definition to track the feature. Ring 2 provides transition density toward the grid. The gradient emerges naturally from the concentric ring structure: more points per unit area near the center (because ring 1 has a smaller circumference than ring 2 but similar point count).

Quantified gradient:
- Ring 1 area: `π × r₁² ≈ π × (0.35 × halfGap)²`
- Ring 2 area: `π × (r₂² - r₁²) ≈ π × ((0.70)² - (0.35)²) × halfGap²`
- Ring 2 annular area = 3 × Ring 1 area
- With 6 points in R1 and 8 in R2: density(R1) / density(R2) ≈ (6/1) / (8/3) = 2.25×

So the inner ring is 2.25× denser than the outer ring. This is the gradient the user wants.

---

## Proposal P2: Hexagonal Packing (Alternative)

### Geometry

Instead of concentric rings, use a regular hexagonal grid centered on the chain vertex:

```
    ·   ·   ·
  ·   ·   ·   ·
·   ·  CV  ·   ·
  ·   ·   ·   ·
    ·   ·   ·
```

Hex packing gives the optimal 2D point distribution for CDT — it produces equilateral triangles, the best possible triangle quality.

### Spacing

Given target aspect ratio `A` (e.g., 4:1), the minimum spacing between hex points should be:

```
s = min(halfGapU, halfGapT) / layers
```

Where `layers` is the number of hex rings (1-3 based on density setting).

### Point Generation

```
for dx in range(-layers, layers+1):
    for dy in range(-layers, layers+1):
        u_offset = dx * s + (dy % 2) * s/2       // hex stagger
        t_offset = dy * s * sqrt(3)/2
        if sqrt(u_offset² + t_offset²) > maxRadius: skip
        companion_u = U_cv + u_offset
        companion_t = T_row_value + t_offset
```

### Trade-offs vs P1

| Aspect | P1 (Concentric Rings) | P2 (Hex Packing) |
|--------|----------------------|-------------------|
| CDT triangle quality | Very good | Optimal (equilateral) |
| Density gradient | Natural (inner ring denser) | Uniform (no gradient) |
| Implementation | Simple (angle-based) | Simple (grid-based) |
| Adaptability | Easy to scale per ring | Fixed hex geometry |
| Point count control | Precise (N per ring) | Approximate (grid clipping) |

**Verdict**: P1 (concentric rings) is preferred because it naturally provides the density gradient the user wants. P2 gives better theoretical triangle quality but uniform density — the mesh is equally dense at the edge of the cloud as at the center, which wastes the triangle budget.

---

## Integration Architecture

### Change 1: Companion Vertex T-Position (OWT L511)

Currently:
```typescript
vertices[vIdx++] = activeTPositions[cv.rowIdx];
```

For 2D companions, each companion has its own T-position stored in a new field:

```typescript
interface ChainVertex {
    u: number;
    rowIdx: number;
    t?: number;        // NEW: explicit T-position (for 2D companions at non-grid rows)
    vertexIdx: number;
    chainId: number;
    pointIdx: number;
}
```

Vertex generation becomes:
```typescript
vertices[vIdx++] = cv.t ?? activeTPositions[cv.rowIdx];
```

If `t` is undefined (grid-row companions, feature vertices), use the grid row T. If `t` is set (2D cloud companions), use the stored value directly.

### Change 2: Companion Generation Loop (OWT L418-480)

Replace the current 1D U-only companion loop with a 2D ring-based generator. For each chain vertex:

```typescript
for (const cv of chainVertices) {
    const col = bsearchFloor(unionU, cv.u);
    const colLeft = col < 0 ? 0 : (col >= numU - 1 ? numU - 2 : col);
    const uLeft = unionU[colLeft];
    const uRight = unionU[colLeft + 1];
    const cellWidth = uRight - uLeft;
    if (cellWidth <= 0 || cellWidth > SEAM_GUARD) continue;

    const halfGapU = Math.min(cv.u - uLeft, uRight - cv.u);
    const tThis = activeTPositions[cv.rowIdx];
    const tAbove = cv.rowIdx < numT - 1 ? activeTPositions[cv.rowIdx + 1] : tThis;
    const tBelow = cv.rowIdx > 0 ? activeTPositions[cv.rowIdx - 1] : tThis;
    const halfGapT = Math.min(
        (tAbove - tThis) / 2,
        (tThis - tBelow) / 2
    );

    if (halfGapT <= 0) continue;

    const maxR = Math.min(halfGapU, halfGapT);
    
    // Ring definitions based on density
    const rings = buildRings(density, maxR);  // returns [{radius, count, offset}]
    
    for (const ring of rings) {
        for (let i = 0; i < ring.count; i++) {
            const angle = (2 * Math.PI * i) / ring.count + ring.offset;
            const du = ring.radius * Math.cos(angle);
            const dt = ring.radius * Math.sin(angle);
            const cu = cv.u + du;
            const ct = tThis + dt;
            
            // Bounds check
            if (cu < uLeft + 1e-6 || cu > uRight - 1e-6) continue;
            if (ct < tBelow + 1e-6 || ct > tAbove - 1e-6) continue;
            if (cu < SEAM_EDGE_COMPANION_GUARD || cu > 1 - SEAM_EDGE_COMPANION_GUARD) continue;
            
            // Dedup check (against existing chain vertices and companions)
            // ... existing dedup logic ...
            
            companionVertices.push({
                u: cu,
                t: ct,               // NEW: explicit T-position
                rowIdx: cv.rowIdx,    // still associated with this row for lookup purposes
                vertexIdx: nextVertexIdx++,
                chainId: cv.chainId,
                pointIdx: -1,
            });
            companionCount++;
        }
    }
}
```

### Change 3: Strip Building — Interior Vertices (OWT L810-895)

Currently, `triangulateChainStrip` receives `stripBot` and `stripTop` — the merged rows. Interior companions (at fractional T-positions) don't appear in either row. They need to be passed as additional free points.

**Option A**: Add an `interiorVerts` parameter to `triangulateChainStrip`:

```typescript
export function triangulateChainStrip(
    buf: number[],
    bot: StripVertex[],
    top: StripVertex[],
    constraints: Array<[number, number]>,
    interiorVerts: StripVertex[],    // NEW: 2D cloud vertices
    chainVerts: ChainVertex[],
    gridVCount: number,
    tBot: number,
    tTop: number,
    config: ChainStripConfig,
    stats: ChainStripStats,
): void { ... }
```

In `cdtTriangulateStrip`, after adding bot and top vertices:
```typescript
for (const sv of bot) addVertex(sv.idx, sv.u, tBot);
for (const sv of top) addVertex(sv.idx, sv.u, tTop);
for (const sv of interiorVerts) {
    // Use the companion's stored T-position
    const cv = chainVerts[sv.idx - gridVCount];
    const t = cv?.t ?? (tBot + tTop) / 2;
    addVertex(sv.idx, sv.u, t);
}
```

Interior vertices participate in CDT as free points (no constraint edges). CDT naturally incorporates them into the Delaunay triangulation, creating well-shaped triangles around the chain vertex.

**Option B**: Inject interior companions into `buildMergedRow` at the correct U-position but with a flag indicating they're interior. Simpler but semantically wrong — they're not "row" vertices.

**Recommendation**: Option A. Clean separation. Interior vertices are clearly identified as such.

### Change 4: Strip Vertex Collection (OWT L810-895)

When building a strip for row band `[j, j+1]`, collect interior companions associated with row `j` that have T-positions between `activeTPositions[j]` and `activeTPositions[j+1]`:

```typescript
const interiorVerts: StripVertex[] = [];
for (const cv of allChainVertices) {
    if (cv.t === undefined) continue;  // not a 2D companion
    if (cv.rowIdx !== j) continue;     // not in this row band
    if (cv.t <= activeTPositions[j] || cv.t >= activeTPositions[j + 1]) continue;  // not between rows
    // Check U-range of this strip segment
    if (cv.u < uStripLeft - 1e-9 || cv.u > uStripRight + 1e-9) continue;
    interiorVerts.push({ idx: cv.vertexIdx, u: cv.u, isChain: false, gridCol: -1 });
}
```

**Performance note**: This linear scan over `allChainVertices` per strip is O(C × S) where C = chain vertices and S = strips. For C ≈ 7K and S ≈ 5K, this is ~35M iterations. To avoid this, pre-build a `rowBandInterior` map (like `rowBandEdges`) during companion generation:

```typescript
const rowBandInterior = new Map<number, ChainVertex[]>();
for (const cv of companionVertices) {
    if (cv.t === undefined) continue;
    let list = rowBandInterior.get(cv.rowIdx);
    if (!list) { list = []; rowBandInterior.set(cv.rowIdx, list); }
    list.push(cv);
}
```

Then per-strip: filter by U-range only.

### Change 5: Vertex Buffer T-coordinate (OWT L508-513)

The vertex buffer currently uses `activeTPositions[cv.rowIdx]` for all chain/companion vertices. With 2D clouds:

```typescript
for (const cv of allChainVertices) {
    vertices[vIdx++] = cv.u;
    vertices[vIdx++] = cv.t ?? activeTPositions[cv.rowIdx];  // use explicit T if available
    vertices[vIdx++] = surfaceId;
}
```

This is a 1-line change. GPU `evaluatePoints` will compute the correct 3D position for any (U, T, surfaceId) triple.

---

## Build Rings Function

```typescript
const RING_OFFSET_RAD = Math.PI / 6;  // 30° rotation between rings

function buildRings(
    density: number,
    maxRadius: number,
): Array<{ radius: number; count: number; offset: number }> {
    const rings: Array<{ radius: number; count: number; offset: number }> = [];

    if (density >= 1) {
        rings.push({
            radius: maxRadius * 0.35,
            count: density <= 2 ? 4 : 6,
            offset: 0,
        });
    }
    if (density >= 2) {
        rings.push({
            radius: maxRadius * 0.70,
            count: density <= 3 ? 6 : 8,
            offset: RING_OFFSET_RAD,
        });
    }
    if (density >= 6) {
        rings.push({
            radius: maxRadius * 0.90,
            count: density <= 8 ? 10 : Math.min(16, density + 4),
            offset: RING_OFFSET_RAD * 2,
        });
    }

    return rings;
}
```

### Concrete Point Counts at Default Density=4

- Ring 1: radius = 0.35 × maxR, 6 points, offset = 0°
- Ring 2: radius = 0.70 × maxR, 8 points, offset = 30°
- Total: 14 companions per chain vertex

At current grid resolution:
- `halfGapU ≈ 0.000865` (half of 0.00173 cell width)
- `halfGapT ≈ 0.0016` (half of 0.0032 row spacing)
- `maxR = min(0.000865, 0.0016) = 0.000865`
- Ring 1 radius = 0.000303
- Ring 2 radius = 0.000606

Ring 1 inter-point spacing (6 points on circle of r=0.000303): `2π × 0.000303 / 6 = 0.000317`
Ring 2 inter-point spacing (8 points on circle of r=0.000606): `2π × 0.000606 / 8 = 0.000476`

Row spacing = 0.0032. Worst aspect ratio in the cloud:
- Ring 1 to row boundary: distance = halfGapT - ring1.radius = 0.0016 - 0.000303 = 0.00130
- Ring 1 inter-point: 0.000317
- Local aspect: 0.00130 / 0.000317 ≈ **4.1:1**

Compare to current 1D placement: **18:1** at density=4. The 2D cloud reduces aspect ratios by **4.4×** while maintaining the same density level.

---

## CDT Boundary Interaction

### How Interior Points Interact With CDT Strip Boundaries

The CDT strip has four boundary edges: left, right, bot, top. Interior companions sit between bot and top. `cdt2d` with `exterior: true` produces ALL Delaunay triangles, then we filter by centroid bounds (CST L248-261).

Interior points will create new triangles connecting:
1. Interior companion → bot row vertices → other interior companions
2. Interior companion → top row vertices → other interior companions
3. Interior companions → chain vertex → bot/top grid vertices

These triangles have dramatically better aspect ratios than the current 1D slivers because the companions are distributed in 2D space.

### Potential Issue: Centroid Filtering

The centroid filter (CST L248-261) checks if triangle centroids fall within the strip bounds:
```typescript
const tBoundsMin = -0.01;
const tBoundsMax = 1.01;
```

Interior companions at fractional T-positions produce triangles whose centroids are within the strip's T-range by construction (companions are placed between tBot and tTop). The centroid filter won't reject them. No change needed.

### Potential Issue: Constraint Edge Crossing

Interior companions are free points — they have no constraint edges. They can't cause constraint crossings. CDT will incorporate them in the Delaunay-optimal way. No risk.

---

## Dead Zone Widening (Phase 1, unchanged)

The Verifier's recommendation stands: increase `deadZoneRadius` from 0.0005 to approximately `gridCellWidth × 0.5`. This pushes grid columns away from chain vertices, giving the companion cloud clear space to work.

At current grid resolution:
- `gridCellWidth ≈ 0.00173`
- New dead zone: `0.00173 × 0.5 = 0.000865`
- This removes grid columns within 0.000865 of any chain vertex (vs current 0.0005)

Impact: ~10-15% more grid columns removed near chains. These are replaced by companion cloud vertices, which provide higher local density anyway.

---

## Phase 1 Gradient U-Fracs (Immediate, before 2D cloud)

As a quick win while the 2D cloud is implemented, the current 1D companion placement can be improved with non-uniform fracs biased toward the chain vertex:

Current (uniform): `density=4 → [0.2, 0.4, 0.6, 0.8]`

Proposed (gradient): `density=4 → [0.15, 0.35, 0.65, 0.85]`

This clusters more companions near the chain vertex (at 0.15 and 0.35 of the gap) and fewer near the grid column (0.65, 0.85). With the widened dead zone pushing grid columns further away, this creates a smooth transition.

General formula:
```typescript
const GRADIENT_FRACS = [];
for (let k = 1; k <= density; k++) {
    // Bias toward center using sqrt spacing
    const raw = k / (density + 1);
    const biased = raw < 0.5
        ? 0.5 * Math.sqrt(2 * raw)          // compress inner fracs toward center
        : 1 - 0.5 * Math.sqrt(2 * (1 - raw)); // compress outer fracs toward center
    GRADIENT_FRACS.push(biased);
}
```

This is a ~5-line change to the existing code, shippable immediately.

---

## Implementation Phases (Revised)

### Phase 1: Foundation (ship immediately)
1. **P2: Remove `pointIdx < 0` filter** — unchanged from convergence
2. **Widen dead zone**: `deadZoneRadius = gridCellWidth × 0.5`
3. **Gradient U-fracs**: Non-uniform COMPANION_FRACS (sqrt bias)

### Phase 2: 2D Companion Cloud
4. **Add `t` field to ChainVertex**: Optional explicit T-position
5. **Replace 1D companion loop with 2D ring generator**: Concentric rings, density-scaled
6. **Update vertex buffer**: Use `cv.t ?? activeTPositions[cv.rowIdx]`
7. **Add `interiorVerts` parameter to `triangulateChainStrip`**: CDT incorporates interior points
8. **Pre-build `rowBandInterior` map**: Performance optimization for interior vertex lookup
9. **Collect interior vertices per strip**: Filter by U-range and T-range

### Phase 3: Anisotropic Strips (future)
10. Chain-aligned strip definition (not designed here — future work)

---

## Assumptions (for Verifier to attack)

1. **`cdt2d` handles interior free points correctly.** CDT is defined for constrained Delaunay triangulation of arbitrary point sets. Interior points without constraints should be incorporated in the Delaunay-optimal way. But: does `cdt2d` specifically handle Steiner points in the interior of a constrained triangulation? The `cdt2d` docs say it accepts any points array — constraints are optional edges to enforce, not mandatory.

2. **Interior companions at fractional T-positions get correct 3D positions from GPU.** The `evaluatePoints` function evaluates any `(u, t, surfaceId)` triple. The subdivision pass already evaluates non-grid positions. But: are there numerical precision issues at fractional T-positions between rows?

3. **The ring placement doesn't create overlapping clouds.** Two chain vertices on adjacent rows could both produce companions that overlap at the midpoint T-position. Dedup prevents exact duplicates, but near-duplicates within `COMPANION_DEDUP_THRESHOLD` would survive. Need to check: do overlapping clouds cause CDT problems? No — duplicate-free point sets are fine for CDT.

4. **The `rowIdx` association for 2D companions is correct for strip collection.** A companion at `(U_cv + du, T_row + dt)` with `dt > 0` is above its associated row. It should appear in the strip for band `[row, row+1]`, not `[row-1, row]`. The `rowIdx` field must mean "this companion belongs to the band starting at this row" for positive dt, or "the band ending at this row" for negative dt. Simpler: always associate with the row band the companion falls within based on its T-position.

5. **Companion count at density=4 (~14 per CV, ~92K total) is within performance budget.** The current density=12 produces 130K companions and takes ~9s for grid generation. 92K at density=4 should be faster. The CDT call per strip processes ~65 base vertices + ~14 interior companions ≈ ~79 points — well within `cdt2d` performance bounds.

---

*Generator out. 2D concentric ring placement, density gradient via ring structure, interior vertices passed to CDT as free points, no constraint edges for companions. Executioner implements Phase 1 immediately, Phase 2 after Verifier review. The 18:1 aspect ratio at density=4 drops to ~4:1 — and we keep all the density the user wants.*
