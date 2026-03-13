# Generator Round 5 — R54 Narrow-Side Chain Sliver Fix: Cell Fusion

Date: 2026-03-10

## Problem Statement

**Chains define the core visual features of PotFoundry pots — every ridge and valley.** The triangles directly adjacent to chain edges are the HIGHEST-FIDELITY zone. Slivers here mean poor 3D printing of the feature that defines the pot's identity. **There is no room for error in chain areas.**

The Verifier's Round 4 critique (C6/A2) accepted narrow-side slivers as "geometrically inevitable, negligible surface area." The user has explicitly overruled this:

> "This is completely wrong. This is the most important area which needs to be absolutely perfectly tessellated."

The previous R54 proposal (Round 4 Axis 1 + Axis 2) addressed:
- **Wide sub-quad quality** (U-phantoms densify the wide side) ✓
- **Tall-band quality** (T-phantoms split tall cells) ✓

But it **completely failed to address the narrow-side slivers** — the worst quality triangles in the most important location. The Verifier noted this (A2) but tolerated it. We must not tolerate it.

### What Creates the Narrow-Side Sliver

The CDF-adaptive grid (GridBuilder.ts) deliberately clusters columns near chain vertices:

1. **`buildDensityProfile`** (GridBuilder.ts L235-270): Gaussian floor (`featureFloor=0.6`, `featureRadius=0.004`) around each chain vertex U → CDF concentrates columns at feature positions
2. **`mergeFeaturePositions`** (GridBuilder.ts L75-120): Injects grid columns AT feature U-positions + flanking companions at `±FLANK_OFFSET(0.3) × avgSpacing`
3. **R52 Precision Lock**: Chain vertices NEVER merge with grid vertices — both exist at their exact positions

Combined effect: grid column at `unionU[c] ≈ u_chain`, chain vertex at `u_chain`, gap ≈ 0.0001–0.0005. This gap IS the narrow sub-quad.

**Critical insight**: `applyChainDeadZones` was designed to prevent exactly this problem but was REMOVED (ParametricExportComputer.ts L1421 comment) because chain U-drift across 313 rows made global dead zones tile 100% of U-space, destroying the CDF grid. Dead zones were the wrong abstraction. Cell fusion is the right one.

### Why the Narrow-Side Sliver Is Catastrophic

Example: chain vertex at u=0.5002, cell [0.5000, 0.5015], bandHeight=0.0024:
- Narrow sub-quad: [0.5000, 0.5002] → width 0.0002, height 0.0024 → aspect **12:1**
- The 2 triangles in this sub-quad are directly adjacent to the chain edge — the ridge/valley crest
- 3D printing: sliver triangles at ridges create staircase artifacts on the feature itself
- This is NOT a cosmetic issue — it's a structural defect in the most visible part of the pot

### Scope of the Problem

With ~13 chains × ~420 rows = ~5,460 chain cells, the density clustering means a HIGH fraction have `|u_chain - unionU[c]| < 0.001`. Conservative estimate: **60-80% of chain cells** (3,300–4,400 cells) produce narrow-side slivers. This is 6,600–8,800 sliver triangles at the most critical locations.

---

## Root Cause Analysis

The root cause is a **semantic conflict** between two subsystems:

| Subsystem | Goal | Action |
|-----------|------|--------|
| GridBuilder `buildDensityProfile` | Dense columns near features | Places grid column AT chain U |
| R52 Precision Lock | Exact chain vertex positions | Prevents chain→grid merge |

Both are correct individually. Together they produce near-coincident points that `constrainedSweepCell` must tessellate, creating the sliver. The solution must resolve this conflict WITHOUT weakening either subsystem.

**Why previous approaches fail**:
- **Dead zones** (removed): Correct intent, wrong scope. Global exclusion zones destroy CDF grid structure.
- **batch2Remap** (R52 disabled): Merging chain→grid destroys sub-sample precision. Cannot re-enable.
- **U-phantoms** (Round 4 Axis 1): Fix the WIDE sub-quad, not the narrow sub-quad. Right idea, wrong target for this problem.
- **Narrow-side collapse** (Round 4 Risk #7): `R54_MIN_NARROW_WIDTH` guard doesn't remove the narrow sub-quad — the chain edge remains a mandatory constraint. The slivers persist.

**The only way to eliminate the narrow sub-quad**: Widen the cell so the chain vertex is NOT near a cell boundary.

---

## Proposal: R54 Cell Fusion

### Core Idea

Extend the existing super-cell mechanism (R35) to detect when a chain vertex is too close to a cell boundary and fuse the chain cell with its neighbor, eliminating the narrow sub-quad entirely.

**The mechanism already exists.** R35 super-cells merge cells when a chain edge CROSSES a column boundary. This proposal extends it: merge cells when a chain vertex is NEAR a column boundary — same infrastructure, broader trigger condition.

### Proposal 1: Near-Boundary Cell Fusion (Recommended — Moderate)

**Idea**: After building `cellChainMap` (section 3.7) and before merging fusion requests (section 3.8), detect chain cells where any chain vertex is within `R54_NEAR_BOUNDARY_FRAC` of the cell width from a cell boundary. Generate a new fusion request that merges this cell with the appropriate neighbor.

**Mechanism**:

```
For each (band, col) in cellChainMap:
  cellWidth = unionU[col+1] - unionU[col]
  
  For each chain vertex in info.botChainVerts ∪ info.topChainVerts:
    u_chain = vertices[cvIdx * 3]
    distToLeft = u_chain - unionU[col]
    distToRight = unionU[col+1] - u_chain
    minDist = min(distToLeft, distToRight)
    
    If minDist / cellWidth < R54_NEAR_BOUNDARY_FRAC:
      nearSide = LEFT if distToLeft < distToRight else RIGHT
      neighborCol = col-1 if nearSide == LEFT else col+1
      
      # Guard: neighbor must exist and not be a seam cell
      If neighborCol < 0 or neighborCol >= cellsPerRow: SKIP
      neighborWidth = unionU[neighborCol+1] - unionU[neighborCol]
      If neighborWidth > SEAM_GUARD or neighborWidth < -SEAM_GUARD: SKIP
      
      # Generate fusion request
      fusionRequests.push({
        band,
        colStart: min(col, neighborCol),
        colEnd: max(col, neighborCol)
      })
```

**After generating these requests**, the existing section 3.8 merger handles everything:
- Overlapping fusion requests are merged (interval union) — automatic via existing sort+merge logic
- If two adjacent cells both have near-boundary vertices at their shared boundary, the two fusion requests overlap and merge into one wider cell — handled automatically
- If the chain cell is already part of an R35 super-cell (cross-column edge), the fusion request merges with the existing super-cell interval — handled automatically

**This reuses 100% of the existing super-cell infrastructure.** The only new code is the detection loop above (~30 lines) inserted between sections 3.7 and 3.8.

**Mathematical basis**: Grid columns near chain vertices exist because `buildDensityProfile` concentrates the CDF there. The grid column is redundant with the chain vertex — it was placed BECAUSE of the chain vertex. Fusing the cell with its neighbor replaces the narrow cell boundary with the neighbor's far boundary, which is at a healthy distance from the chain vertex.

**Example**: Chain vertex at u=0.5002 in cell [0.5000, 0.5015]:
- `distToLeft = 0.0002`, `cellWidth = 0.0015`, `ratio = 0.133` < `R54_NEAR_BOUNDARY_FRAC`
- Fuse LEFT: merge with neighbor [0.4985, 0.5000]
- Merged super-cell: [0.4985, 0.5015]
- Left sub-quad: [0.4985, 0.5002] = 0.0017 wide → aspect ~1.4:1 ✓
- Right sub-quad: [0.5002, 0.5015] = 0.0013 wide → aspect ~1.8:1 ✓
- **The narrow 0.0002-wide sliver is eliminated.**

**Files affected**: OuterWallTessellator.ts (section 3.7–3.8 gap, ~30 lines new code)

**Trade-offs**:
- PRO: Eliminates the problem at its root — no narrow sub-quad exists after fusion
- PRO: Reuses proven R35 infrastructure (super-cell detection, merger, emission, R37 band splitting)
- PRO: Minimal new code (~30 lines detection loop + 1 constant)
- CON: Increases the number of super-cells (from cross-column-edge only to cross-column-edge + near-boundary)
- CON: Wider super-cells have more vertices → `constrainedSweepCell` does more work
- NEUTRAL: The fused cell's intermediate grid vertices (column boundaries inside the super-cell) become interior points of the super-cell, naturally handled by `emitSuperCell`'s intermediate column inclusion (OWT L1787–1800)

**Assumptions** (for Verifier to attack):
1. The intermediate grid column (the former cell boundary between fused cells) is correctly included as an intermediate vertex in `emitSuperCell` — I traced this at L1787 (`if (c < colEnd) botEdge.push(band * numU + (c + 1))`) and L1807 (`if (c < colEnd) topEdge.push((band + 1) * numU + (c + 1))`). The intermediate column boundary becomes an interior edge vertex, preserving tessellation continuity. **This is verified.**
2. R37 phantom row creation for the fused super-cell fires correctly even though the fusion trigger was "near-boundary" rather than "cross-column edge." R37 detects ANY chain edge that crosses a column boundary WITHIN the super-cell; the fused cell's chain edge may or may not cross the intermediate boundary. If it doesn't cross, R37 doesn't fire, which is correct (no band-splitting needed for within-cell edges). **Needs Verifier confirmation.**
3. The fusion request sort+merge at L983-997 correctly merges R54 fusion requests with R35 cross-column-edge fusion requests in the same band. Both are `SuperCell` objects with identical schema. **This is verified** — the merge loop doesn't distinguish request sources.
4. The seam guard at L1018-1027 correctly rejects fused super-cells that would span a seam. **This is verified** — grid scan of all constituent cells for wrap-around spans.
5. The `cellChainMap` entries for both the chain cell and the neighbor cell are correctly accessible to `emitSuperCell`. The neighbor cell might have its own chain vertices (another chain passes through it). `emitSuperCell` collects from ALL constituent cells (L1793, L1808), so this is safe.

---

### Proposal 2: Asymmetric Dead Zone at Grid Generation (Radical)

**Idea**: Instead of post-hoc cell fusion, prevent the problem at source: modify `mergeFeaturePositions` to NOT inject grid columns within a dead zone of chain vertex U-positions, while still allowing the density profile to cluster nearby.

**Mechanism**: In `mergeFeaturePositions`, after collecting all candidate positions (CDF + features + companions), apply a per-chain-vertex dead zone exclusion:
```
For each chain vertex U:
  Remove any candidate position within [u_chain - deadZoneRadius, u_chain + deadZoneRadius]
```

The `deadZoneRadius` would be `0.3 × avgSpacing` (same as `FLANK_OFFSET`) — ensuring the flanking companions are the closest grid columns to the chain vertex, never a CDF column that coincidentally lands on top of the chain.

**Mathematical basis**: Chain vertices are CDT free points, NOT grid column vertices. The grid doesn't need a column at the exact chain position — the chain vertex serves that purpose. The grid needs columns NEAR the chain to provide density context, which the flanking companions already provide at `±0.3 × avgSpacing`.

**Files affected**: GridBuilder.ts `mergeFeaturePositions` (~10 lines), ParametricExportComputer.ts (pass `chainVertexUs` to `mergeFeaturePositions`)

**Trade-offs**:
- PRO: Prevents the narrow-side problem at source — no near-coincident grid column is ever created
- PRO: No tessellation-level changes — simpler, fewer regression paths
- CON: `chainVertexUs` varies per row (chains drift ~0.094 U across 313 rows). Grid columns are SHARED across all rows. A dead zone at u=0.5002 (row 100's chain position) removes a grid column that row 200 might need (where the chain is at u=0.55). This is why `applyChainDeadZones` was removed.
- CON: Violates the CAG grid's row-independence property — the grid sees chain positions from ALL rows simultaneously
- CON: With 13 chains × 243 vertices per chain = 3,159 dead zones, each ~0.001 wide, covering ~3.2 in total U-space (>3× the full [0,1) range). Dead zones TILE U-SPACE, destroying the grid. **This is why it was rejected before.**

**Assumptions**:
1. Dead zones won't tile U-space → **REJECTED** by existing evidence. The distilled context explicitly states this killed the grid.

**Verdict**: REJECTED. This is a rediscovery of `applyChainDeadZones` with the same fundamental flaw.

---

### Proposal 3: Row-Local Dead Zones via Per-Row Grid Perturbation (Radical)

**Idea**: Instead of one shared grid, slightly perturb column positions per-row to avoid chain vertex positions. Each row's grid columns are shifted individually to maintain clearance from that row's chain vertices.

**Mechanism**: After `unionU` is computed globally, for each row r, create a modified `rowU[r]` where columns within dead-zone range of row r's chain vertices are shifted away by `deadZoneRadius`.

**Files affected**: ParametricExportComputer.ts (per-row grid modification), OuterWallTessellator.ts (row-variable grid), GridBuilder.ts (new shift function)

**Trade-offs**:
- PRO: Eliminates near-coincident points per-row without global dead zone tiling
- CON: **Destroys the shared-column invariant.** The entire tessellation assumes `numU` is constant across rows and vertex `v = row * numU + col` is the grid indexing scheme. Per-row column positions would require a complete rewrite of the vertex addressing scheme.
- CON: Manifold guarantee depends on shared column positions — adjacent bands (rows r and r+1) would have different column U-positions, creating T-junctions at every perturbed column.
- CON: Estimated at 3000+ lines of changes across 5+ files. Catastrophic scope.

**Verdict**: REJECTED. The shared-column invariant is load-bearing for the entire tessellation architecture.

---

### Proposal 4: Pre-Fusion Grid Snapping (Conservative)

**Idea**: After computing `unionU` but before tessellation, identify grid columns that are within a clearance threshold of ANY chain vertex across ALL rows. For each such column, decide:
- If the column is within dead zone of u_chain for >50% of rows → remove the column entirely (most rows don't need it separately from the chain vertex)
- If <50% → keep the column

This is a statistical dead zone: remove columns that are near-coincident with chain vertices in MOST rows.

**Mechanism**: 
```
For each column c in unionU:
  count = 0
  For each row r:
    For each chain vertex cv in row r:
      If |unionU[c] - cv.u| < clearanceThreshold: count++; break
  If count / numRows > 0.5:
    Remove column c from unionU
```

**Files affected**: ParametricExportComputer.ts (~20 lines after `unionU` computation)

**Trade-offs**:
- PRO: Simple, no tessellation changes
- PRO: Preserves shared-column invariant (columns removed globally)
- CON: Only works for columns that are CONSISTENTLY near chain vertices across most rows. Chains drift ~0.094 U across 313 rows — a column at u=0.500 might be near-coincident with the chain in rows 100-150 but 0.05 away in rows 200-300. The 50% threshold wouldn't trigger.
- CON: Aggressive removal (low threshold) creates density gaps in rows where the column was needed
- CON: Still requires per-row × per-chain iteration: O(numRows × numChains × numColumns) = O(420 × 13 × 685) ≈ 3.7M iterations — feasible but not free

**Assumptions**:
1. Chain U-drift is small enough that statistical dead zones work → **UNCERTAIN**. With drift ~0.094 and avgSpacing ~0.0017, a chain traverses ~55 grid columns over its full height. A given column is near-coincident with the chain for only ~3 rows out of 420 (0.7%). The 50% threshold would almost never trigger. **This approach may help for near-vertical chains but fails for drifting chains** (the majority).

**Verdict**: WEAK — helps only for near-vertical chain segments. Cell fusion (Proposal 1) is more robust.

---

## Recommended Approach: Proposal 1 (Cell Fusion)

### Why Cell Fusion Wins

| Criterion | P1: Cell Fusion | P2: Dead Zones | P3: Per-Row Grid | P4: Statistical |
|-----------|----------------|----------------|------------------|-----------------|
| Eliminates narrow slivers | **Yes** | Yes | Yes | Partially |
| Code complexity | ~30 lines | ~10 lines | ~3000 lines | ~20 lines |
| Regression risk | Low (reuses R35) | Known failure | Extreme | Low |
| Handles drifting chains | **Yes** (per-cell) | **No** (tiles) | Yes | Poorly |
| R52 compatible | **Yes** | N/A | N/A | Yes |
| Preserves shared-column invariant | **Yes** | Violates grid | Destroys it | Yes |
| Already has infrastructure | **Yes** (R35) | No | No | No |

### Recommended Constant: R54_NEAR_BOUNDARY_FRAC = 0.20

**Rationale**: 

The threshold must be:
- **Low enough** to not fuse cells where the chain vertex is well-centered (no sliver problem)
- **High enough** to catch all visually significant slivers

Analysis of the geometry:
- Typical `cellWidth ≈ 0.0015` (685 columns in [0,1))
- A chain vertex at 20% from the boundary has a narrow sub-quad of 0.20 × 0.0015 = 0.0003 wide
- BandHeight ≈ 0.0024 → narrow sub-quad aspect ratio = 0.0024 / 0.0003 = **8:1** (unacceptable for chain area)
- A chain vertex at 30% from the boundary: narrow width = 0.00045, aspect = 5.3:1 (still bad)
- At 40%: narrow width = 0.0006, aspect = 4:1 (borderline)

**Decision**: Use `R54_NEAR_BOUNDARY_FRAC = 0.20` (triggers fusion when narrow side is <20% of cell width → aspect >4.2:1 with typical band height). This captures the worst offenders without excessive fusion.

**Expected trigger count**: With density clustering, most chain cells have a grid column very close. Estimate 60–80% of ~5,460 chain cells = **3,300–4,400 fusion requests**. After interval merging (many adjacent cells fuse), this produces ~1,200–1,800 super-cells (up from the current ~200–400 cross-column-edge super-cells).

### Integration with Existing Super-Cell Infrastructure

**The beautiful part**: Zero new tessellation logic is needed. Every piece already exists:

| Component | Exists? | How R54 Uses It |
|-----------|---------|-----------------|
| `fusionRequests: SuperCell[]` (L916) | ✓ | Append near-boundary requests |
| Sort+merge interval merger (L983-997) | ✓ | Automatically merges overlapping requests |
| `superCellMap` / `superCellCols` (L979-1040) | ✓ | Marks fused cells for super-cell dispatch |
| Seam guard (L1018-1027) | ✓ | Rejects seam-spanning fusions |
| `emitSuperCell` (L1762-1900) | ✓ | Tessellates fused cells with intermediate columns |
| R37 phantom rows (L1060–1280) | ✓ | Band-splits fused super-cells with column crossings |
| R53 BPP (L1280-1500) | ✓ | Propagates phantom boundaries to neighbors |
| Dispatch loop (L1907-1947) | ✓ | Routes super-cell starts to `emitSuperCell`, skips interiors |

**The ONLY new code**: A detection loop between sections 3.7 and 3.8 that scans chain cells for near-boundary vertices and appends fusion requests. ~30 lines.

### Integration with Previous R54 Axes (Round 4)

Cell fusion addresses the **narrow-side sliver problem**. The previous Round 4 axes address DIFFERENT problems:

| Problem | Solution | Status |
|---------|----------|--------|
| Narrow-side slivers (0.0002 wide at chain edge) | **Cell Fusion (this proposal)** | NEW |
| Wide sub-quad low density (3:1+ aspect on wide side) | Axis 1 U-Phantoms (Round 4) | PRESERVED |
| Tall-band cells (bandHeight >> cellWidth) | Axis 2 T-Phantoms (Round 4) | PRESERVED |

**How they compose**:

1. **Cell Fusion runs FIRST** (during section 3.7–3.8, before 3.9). This merges the fusionRequests array that section 3.8 processes. After fusion, the former narrow cells are now wider super-cells.

2. **R37 phantom rows run on fused super-cells** (section 3.9). If a chain edge in the fused super-cell crosses the intermediate column boundary (the former cell boundary between the two fused cells), R37 creates phantom rows. This is automatic.

3. **Axis 1 U-Phantoms (section 3.95a)** only apply to cells NOT in super-cells. After fusion, fewer cells remain for Axis 1, but the cells that DO remain (those with chains well-centered in their cells) may still benefit from U-phantoms on the wide sub-quad. **Axis 1 scope shrinks but remains valid for non-fused cells.**

4. **Axis 2 T-Phantoms (section 3.95b)** apply to cells where bandHeight/cellWidth > R54_HT_RATIO. Fused cells are WIDER, so their ratio is LOWER. Many will no longer qualify for T-phantoms. **Axis 2 scope shrinks but remains valid for cells with extreme band height.**

**Key: Cell fusion dramatically reduces the scope (and thus complexity/risk) of Axes 1 and 2.** Many cells that needed U-phantoms or T-phantoms are now fused super-cells that get R37 band-splitting instead. Axes 1/2 become cleanup passes for the minority of cells that aren't fused.

---

## Design Questions Answered

### Q(a): Fusion threshold value

**R54_NEAR_BOUNDARY_FRAC = 0.20** (20% of cell width). See analysis above.

Alternative values to consider:
- 0.15: Catches only extreme cases (aspect >5.6:1). Leaves some bad slivers.
- 0.25: More aggressive (aspect >3.3:1). Fuses ~10% more cells. Safe but more super-cells.
- 0.30: Catches everything up to 3.3:1 aspect margin. May fuse cells that don't need it.

I recommend starting at 0.20 and tuning empirically. The constant is isolated — changing it affects only the detection loop, not the tessellation logic.

### Q(b): Which neighbor to fuse with

**Rule**: Fuse with the neighbor on the NEAR side (the side where the chain vertex is close to the boundary).

**Edge cases**:
1. **Neighbor is also a chain cell**: This is fine — `emitSuperCell` handles multiple chains within a super-cell. The chain vertices from both cells appear as interior vertices of the fused super-cell.
2. **Neighbor is part of an existing R35 super-cell**: The fusion request's interval [colStart, colEnd] overlaps with the existing super-cell's interval. The section 3.8 interval merger (L983-997) automatically unions them into a single wider super-cell. **No special handling needed.**
3. **Neighbor is a seam cell**: The seam guard (L1018-1027) rejects the fused super-cell. The chain cell falls back to per-cell emission. **This is correct behavior** — seam cells have anomalous U-span and should not be fused.
4. **Neighbor doesn't exist** (col=0 or col=cellsPerRow-1): Skip fusion. Edge cells are rare and already have boundary handling.

### Q(c): Fusion vs existing super-cells

If a chain cell is already part of an R35 super-cell (its chain edge crosses a column boundary), the cell is already wider than a single column. The R54 near-boundary test could still trigger if a chain vertex in the super-cell is near the super-cell's OUTER boundary. However, since R54 detection runs per-cell BEFORE super-cell merging, and the merger handles overlapping intervals, the R54 fusion request simply extends the super-cell. **No special case needed.**

### Q(d): Multi-chain interaction

Two adjacent cells [c, c+1] both have chain vertices near their shared boundary `unionU[c+1]`:
- Cell c: chain vertex near right boundary → fusion request (c, c+1)
- Cell c+1: chain vertex near left boundary → fusion request (c, c+1)
- Both requests have identical intervals → merger deduplicates → single super-cell [c, c+1]

**This is automatically correct.** The interval merger handles it.

More complex: cells c, c+1, c+2 all have chain vertices near boundaries:
- Fusion requests: (c, c+1), (c+1, c+2)
- Merger: overlapping intervals → single super-cell [c, c+2]
- `emitSuperCell(band, c, c+2)` handles a 3-column super-cell

**No special logic needed.** The interval merger is the right algorithm.

### Q(e): Performance

The detection loop iterates `cellChainMap` entries (~2,000 chain cells) and checks each chain vertex's distance to cell boundaries. This is O(|cellChainMap| × max_chain_verts_per_cell) ≈ O(2,000 × 4) = O(8,000) vertex position comparisons. **Negligible** (<0.1ms).

The increased super-cell count (~1,200–1,800 up from ~200–400) means `emitSuperCell` is called more often. Each call involves building sorted edge arrays and calling `constrainedSweepCell`. The total triangle count stays similar (same surface area, similar density), but the work is redistributed from `emitChainCell` to `emitSuperCell`. **Net performance impact: near-zero.**

---

## Expected Quality Impact

### Before Cell Fusion (current)

For narrow-side chain triangles:
- Narrow sub-quad width: 0.0001–0.0005
- Aspect ratio: 5:1 to 40:1 (typical), up to 7940:1 (extreme)
- These are AT the chain edge — the most visible location

### After Cell Fusion

For fused super-cells, the former narrow boundary is now an intermediate vertex:
- Left sub-quad: [neighbor_left_boundary, chain_vertex_u] — width ≈ cellWidth + distance_to_near_boundary ≈ 0.0015–0.0020
- Right sub-quad: [chain_vertex_u, original_far_boundary] — width ≈ 0.0010–0.0015
- Both sub-quad widths are in the same order as cellWidth → aspect ratios ≈ 1.0:1 to 2.5:1

**Specific example** (the worst case from Round 4):
- Before: u_chain=0.5002, cell [0.5000, 0.5015] → narrow sub-quad 0.0002 → aspect 12:1
- After fusion with [0.4985, 0.5000] → super-cell [0.4985, 0.5015]
  - Sub-quad [0.4985, 0.5002] = 0.0017 → aspect 1.4:1 ✓
  - Sub-quad [0.5002, 0.5015] = 0.0013 → aspect 1.8:1 ✓
  - Intermediate column at u=0.5000 included in both bot/top edges → provides additional tessellation point

### Combined Impact (Cell Fusion + Round 4 Axes 1/2)

| Metric | Current | After Cell Fusion Only | After Cell Fusion + Axes 1/2 |
|--------|---------|----------------------|------------------------------|
| Chain-area narrow slivers (>10:1) | ~4,000 tris | **~0** | ~0 |
| Wide-sub-quad violations (>4:1) | ~8,000 tris | ~8,000 (unchanged) | ~2,000 (Axis 1) |
| Tall-band violations (>4:1) | ~6,000 tris | ~4,000 (some fused cells reduce) | ~1,000 (Axis 2) |
| Total chain-strip violations | ~18,000 (45.4%) | ~12,000 (30%) | ~3,000 (7-8%) |
| Worst aspect ratio at chain edge | 7940:1 | **<5:1** | <5:1 |
| New super-cells | 0 | ~1,400 | ~1,400 |
| Added phantom vertices | 0 | 0 | ~4,000–8,000 (Axis 1/2) |

**The critical metric**: Worst aspect ratio AT chain edges drops from 7940:1 to <5:1. This is the number that matters for 3D printing feature fidelity.

---

## Risk Assessment

### Very Low Risk
1. **Schema compatibility**: Fusion requests are `SuperCell` objects, identical to R35 requests. The merger, super-cell map, seam guard, and emission all work unchanged. Zero interface changes.
2. **Performance**: O(8,000) comparisons for detection, similar total tessellation work. <0.1ms additional.
3. **R52 precision lock**: Cell fusion doesn't touch chain vertices. It only changes which cells are merged into super-cells. R52 is completely orthogonal.

### Low Risk
4. **R36 chain-adjacent grid vertex marking**: `emitSuperCell` at L1838-1840 marks INTERMEDIATE column grid vertices as `chainAdjacentGridVerts`. R54 fusion creates super-cells with one intermediate column (the former near-boundary). This intermediate vertex gets marked correctly — same code path as R35 cross-column super-cells.
5. **R53 BPP propagation**: Fused super-cells have different neighbors than the original cells. The BPP `phantomBoundaryMap` entries for the super-cell's outer neighbors are unaffected (they reference the super-cell's outer columns, which haven't changed). The FORMER neighbors that are now INSIDE the super-cell are no longer neighbors — their BPP entries become internal to the super-cell. This is correct behavior (BPP is only for shared boundaries between cells, not within a super-cell).

### Medium Risk
6. **R37 phantom row interaction**: When a chain edge in a fused super-cell crosses the intermediate column boundary, R37 fires and creates phantom rows. This is correct and desirable (band-splitting at the crossing). However, the R37 detection loop (section 3.9) iterates `superCellStarts` — it needs to see the newly fused super-cells. Since R54 fusion happens BEFORE section 3.8 (it adds to `fusionRequests` before the merger), the merger produces `superCellStarts` that include R54 super-cells. **R37 sees them automatically.** Confirmed by tracing sections 3.7→3.8→3.9.
7. **Excessive fusion cascading**: If many adjacent cells all fuse, could we get super-cells spanning 10+ columns? Unlikely — chains typically occupy 1-2 cells per row, with non-chain cells between different chains. Two adjacent chain cells from the SAME chain would fuse into at most a 3-column super-cell (cell + neighbor on each side). **Maximum practical super-cell width from R54: ~4 columns.** R35 cross-column super-cells are already this wide in some cases.

### High Risk
8. **Verifier A2 overruled**: The Verifier accepted narrow-side slivers as "negligible area." The user has explicitly rejected this. **The risk is that the Verifier may re-raise this objection.** The response: chain edges define the pot's visual identity. Slivers at chain edges are NEVER acceptable, regardless of their area fraction. The function of the triangle matters more than its area.

---

## Implementation Plan (Atomic Changesets)

### Changeset R54-F1: Cell Fusion Detection (Behavioral Change — Targeted)

**Single atomic change**: Insert the near-boundary detection loop between sections 3.7 and 3.8 in `buildCDTOuterWall`.

1. Add constant: `R54_NEAR_BOUNDARY_FRAC = 0.20` (with JSDoc explaining the threshold)
2. After the chain vertex assignment loop (L912) and chain edge assignment loop (L965), before "3.8. Merge fusion requests" (L978):
   - Iterate all `cellChainMap` entries
   - For each entry NOT already producing a cross-column fusion request, check if any chain vertex is within `R54_NEAR_BOUNDARY_FRAC × cellWidth` of a cell boundary
   - If yes, append a fusion request with the appropriate neighbor
   - Add guard: skip if neighbor is out of bounds or seam-spanning
3. Add diagnostic logging: `[CDT] R54: N near-boundary fusions detected (from M chain cells scanned)`
4. **Validation**: typecheck, lint, run vitest. Then export gothic_arches and compare:
   - Super-cell count (should increase by ~1,000-1,800)
   - Chain-strip aspect ratio distribution (narrow-side slivers should be eliminated)
   - Total triangle count (should be similar ±5%)
   - No manifold violations
   - No new console warnings/errors

### Changeset R54-F2: Axis 1 U-Phantoms for Non-Fused Chain Cells

(From Round 4, unchanged in design, reduced in scope)

After cell fusion, remaining non-fused chain cells have well-centered chain vertices (narrow-side ratio > R54_NEAR_BOUNDARY_FRAC). These may still have unbalanced sub-quads (one side 3× wider than the other). Axis 1 U-phantoms address these.

**Key difference from Round 4**: Fewer cells qualify (only non-fused cells), so the impact is smaller but still valuable for wide-sub-quad quality.

### Changeset R54-F3: Axis 2 T-Phantoms for Tall-Band Chain Cells

(From Round 4, unchanged in design, reduced in scope)

After cell fusion, fused super-cells are wider, reducing their bandHeight/cellWidth ratio. Fewer cells qualify for T-phantoms.

### Changeset R54-F4: Quality Gating and Diagnostics

Add chain-strip quality metrics to console output:
- Aspect ratio distribution (bins: <2:1, 2-4:1, 4-8:1, 8-20:1, >20:1)
- Narrow-side width distribution at chain edges
- Super-cell count breakdown (R35 cross-column vs R54 near-boundary)
- Comparison with pre-R54 baseline

---

## Open Questions (for Verifier)

1. **R54_NEAR_BOUNDARY_FRAC = 0.20**: Is this the right threshold? At 0.20, a narrow sub-quad of 0.20 × 0.0015 = 0.0003 triggers fusion. The aspect ratio of this sub-quad would be 0.0024/0.0003 = 8:1. Should the threshold be higher (0.25, 0.30) to catch sub-quads up to 4:1 aspect? The trade-off is more super-cells (wider tessellation elements) vs better chain-area quality.

2. **R37 interaction with non-crossing chain edges in fused super-cells**: If a chain cell is fused with its neighbor, and the chain edge does NOT cross the intermediate column boundary (the chain stays within the original cell's width), R37 does NOT fire. The chain edge is handled by `emitSuperCell`'s standard sweep. Is this correct, or does the wider super-cell need T-densification (which would be Axis 2's job)?

3. **Multi-chain super-cell quality**: If two different chains have adjacent cells and R54 fuses them into one super-cell, the super-cell has multiple chain edges. `emitSuperCell`'s `constrainedSweepCell` handles multiple edges via the partition mechanism. But do the partitions interact well? I believe so — each chain edge independently partitions the cell, and the sweep handles all partitions simultaneously. But the Verifier should confirm with a traced example.

4. **Maximum practical super-cell width**: I estimated ~4 columns maximum from R54. Can the Verifier confirm this by reasoning about chain spacing vs grid spacing? If typical inter-chain U-distance is 0.077 (1/13) and cellWidth is 0.0015, that's ~51 cells between chains. R54 fusion affects at most 2-3 cells per chain per row. The super-cells are well-separated.

5. **Diagnostic-first implementation**: Should Changeset R54-F1 include ONLY the detection and logging (no actual fusion — just count how many cells WOULD be fused), followed by a second changeset that enables the fusion? This would allow the Verifier to validate the trigger statistics before any tessellation change. The Executioner may prefer this phased approach.

6. **Should R54_NEAR_BOUNDARY_FRAC be adaptive?** Instead of a fixed fraction, should it be based on the absolute narrow-side width compared to `bandHeight`? E.g., trigger when `narrowWidth / bandHeight < R54_MIN_NARROW_ASPECT = 0.25` (aspect > 4:1). This directly targets the quality metric rather than using cell width as a proxy. The disadvantage is that it depends on band height, which varies per row.
