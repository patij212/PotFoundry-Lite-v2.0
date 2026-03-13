# Generator Round 6 — Chain-Strip Sliver Root Cause & Fix Proposal
Date: 2026-03-10

## Problem Statement

R54 cell fusion has plateaued. Three successive threshold tunings (broad 0.35, OR-gate 0.20, AND-gate 0.20) produced essentially identical chain-strip quality:

| Run | R54 Fusions | Violations (>4:1) | Max aspect | Avg aspect |
|-----|-------------|-------------------|-----------|-----------|
| Broad (0.35) | 5957/7477 (79.7%) | ~50.9% | 2364:1 | 10.3:1 |
| OR-gate (0.20) | 2822/8436 (33.4%) | 47.4% | 1814:1 | 10.3:1 |
| AND-gate (0.20) | 2007/8436 (23.8%) | 47.7% | 1814:1 | 10.1:1 |

Pre-R54 baseline: ~45.4%. **R54 worsened quality.** The avg aspect (10.1-10.3:1) is unchanged across all runs. R54 is treating a symptom (near-boundary chain vertex → narrow sub-quad) while the disease is elsewhere.

**Critical number**: R54 skips 4851/8436 (57.5%) chain cells that are already R35 super-cells. It only touches ~24% of chain cells. **Most bad triangles live in the 57.5% of cells that R54 never modifies.**

## Root Cause Analysis

### The Causal Chain (5 links)

**Link 1: CDF density profile clusters grid columns near chain vertices.**

`buildDensityProfile` (GridBuilder.ts L242-L265) creates a Gaussian density peak at each chain vertex U-position (`featureFloor=0.6`, `featureRadius=0.004`). `generateCDFAdaptivePositions` (GridBuilder.ts L153) inverts this density CDF to place columns. Result: grid columns **cluster near chain features** — the exact same U-regions where chain vertices live.

**Link 2: Chain vertex U-positions are NOT exact grid column positions.**

Grid columns are shared across ALL rows (1D density profile → 1D column set). But chain vertices **drift in U** across rows (~0.094 U per chain over 313 rows, distilled context §3.3). At row r, the chain vertex sits at some U ≠ any grid column. The CDF puts columns NEAR the chain's U-range but not AT the chain vertex at each specific row. Result: at any given row, grid columns and chain vertices are **close but not coincident** in U. Separations range from 0 to ~0.002, with many pairs in the 0.0001-0.0005 range.

**Link 3: R52 Precision Lock prevents merging near-coincident vertices.**

Three mechanisms previously merged near-coincident grid+chain pairs:
- `batch2Remap` (MERGE_THRESHOLD=1e-4) — **DISABLED** (OWT, R52 P1)
- `Batch 6 dedup` (1e-5 quantization) — **GUARDED** against cross-type merging (R52 P2)
- `upsertPhantomRowVertex` bestV lookup — **GUARDED** (R52 P3)

All three are disabled/guarded. Near-coincident pairs persist as **distinct vertices** in the mesh. This is correct for precision — chain vertices represent sub-sample detection accuracy (±0.00006 U). But it means the triangulation must handle near-coincidence explicitly.

**Link 4: `applyChainDeadZones` was disabled.**

The dead zone mechanism (GridBuilder.ts L280-L312) that removes CDF columns near chain vertices was implemented but **never activated** (PEC L1416-1421 comment). Reason: chain points spaced ~0.0004 apart create continuous exclusion bands that tile ~100% of the chain's U-range, killing 95.7% of CDF columns. The comment states "The CDT + vertex dedup handles near-coincident grid/chain vertices naturally" — but CDT was deleted (R34) and vertex dedup was guarded (R52). **The stated fallback mechanism no longer exists.**

**Link 5: `sweepQuad` creates needle triangles from near-coincident edge vertices.**

This is the triangle-emission mechanism. When a chain cell or super-cell builds its bot/top edge, grid and chain vertices at similar U-positions appear as consecutive entries after sorting. Example:

```
botEdge (sorted by U): [..., chainV(u=0.1234), gridV(u=0.1235), ...]
topEdge: [TL(u=0.100), TR(u=0.200)]
```

The sweep advances through the bottom edge and at some point emits:
```
triangle(chainV, gridV, TL) where:
  edge chainV→gridV:  ΔU=0.0001, ΔT=0  → 3D length ≈ 0.025mm
  edge chainV→TL:     ΔU=0.023, ΔT=tGap → 3D length ≈ 6mm
  edge gridV→TL:      ΔU=0.024, ΔT=tGap → 3D length ≈ 6mm
  aspect ratio ≈ (6mm)² / (½ × 6mm × 0.025mm) ≈ 480:1
```

This is a **PIN TRIANGLE**: two long edges meeting at a nearly-coincident pair, with one extremely short base. This is the geometric mechanism producing the extreme aspect ratios (up to 2364:1).

### Why R54 Cannot Fix This

1. **R54 skips R35 super-cells** (OWT L1007-1009): `if (r35SuperCellCols.has(key)) { r54SkippedR35Covered++; continue; }`. Super-cells contain INTERMEDIATE grid columns that create near-coincident pairs with chain vertices. R54 never looks at these.

2. **R54 skips multi-edge cells** (OWT L1013-1015): `if (info.chainEdges.length !== 1) { r54SkippedMultiChain++; continue; }`. Cells with multiple chain edges — common in feature-dense regions — are skipped.

3. **R54 fusion creates MORE vertices on edges, not fewer.** When R54 merges a cell with its neighbor, the resulting super-cell has the neighbor's intermediate grid vertices PLUS the original cell's chain vertices on its edges. This can CREATE new near-coincident pairs that weren't in the original separate cells.

4. **R54 addresses cell BOUNDARIES, not cell INTERIORS.** The near-coincident pairs occur between grid vertices and chain vertices anywhere within a cell's edge, not just at cell boundaries.

### Why Edge Flips Don't Fix This

The 3D edge flip system (`flipEdges3D`) performs 163,296 flips but violations persist because:

1. **Needle triangles can't be fixed by flipping.** A flip replaces diagonal AB of quad ABCD with diagonal CD. But if the quad has a near-coincident pair (A≈B), NEITHER diagonal produces a good triangle — both contain the degenerate edge A→B.

2. **Chain edge protection blocks beneficial flips.** The constraint edge set prevents flipping chain-connected edges. The fan diagonal edges are also protected (R46 fix). Many adjacent triangles to slivers share protected edges.

3. **Flips preserve vertex geometry.** No amount of diagonal swapping can fix a triangle whose problem is that two of its vertices are nearly coincident. The fix requires eliminating the vertex redundancy.

### Quantifying the Root Cause

On a typical pot (r≈40mm, 300 rows, 500+ columns):
- Circumference ≈ 251mm, so 1 U-unit = 251mm
- Average column spacing ≈ 0.002 U ≈ 0.5mm
- Average row band height ≈ 0.003 T ≈ 0.33mm
- A grid+chain pair at ΔU=0.0005: 3D base = 0.125mm, 3D height ≈ 0.5mm, aspect ≈ 4:1 (threshold)
- A grid+chain pair at ΔU=0.0002: 3D base = 0.050mm, 3D height ≈ 0.5mm, aspect ≈ 10:1 (typical)
- A grid+chain pair at ΔU=0.00005: 3D base = 0.013mm, 3D height ≈ 0.5mm, aspect ≈ 40:1 (severe)

The avg aspect ratio of 10.1:1 corresponds to ΔU ≈ 0.0002 — a grid column 0.05mm from a chain vertex. This is consistent with the CDF clustering behavior.

## Proposals

### Proposal 1: Edge-Local Vertex Coalescing in Super-Cells (Conservative)

**Idea**: In `emitSuperCell`, after sorting bot/top edges by U and deduplicating by index, run a SECOND dedup pass that removes grid vertices within `GRID_CHAIN_COALESCE_RADIUS` of any chain vertex on the same edge. The chain vertex stays; the redundant grid vertex is dropped from the edge array.

**Mechanism**:
```
// After: const finalBot = dedupEdge(botEdge);
// Insert: edge-local grid/chain coalescing
const coalescedBot = coalesceNearGridChain(finalBot, vertices, gridVertexCount,
                                           GRID_CHAIN_COALESCE_RADIUS);
```

The `coalesceNearGridChain` function:
1. Iterate sorted edge vertices
2. For each grid vertex (index < gridVertexCount), check if any adjacent chain vertex (index >= gridVertexCount) in the sorted array is within COALESCE_RADIUS in U
3. If yes, DROP the grid vertex from the output array
4. Chain vertices always survive

**COALESCE_RADIUS**: `0.5 × avgColumnSpacing` ≈ 0.001 U. At this threshold, any grid+chain pair within 0.25mm (3D) is coalesced by dropping the grid vertex. This eliminates triangles with aspect ratios above ~2:1 from near-coincidence.

**Mathematical basis**: The aspect ratio of a pin triangle is approximately `edgeLength² / (edgeLength × baseWidth)` = `edgeLength / baseWidth`. Given edge length ≈ 0.6mm (typical diagonal of a cell) and base = ΔU × circumference, violations (>4:1) occur when ΔU < 0.6/(4×251) ≈ 0.0006. Setting COALESCE_RADIUS = 0.001 catches all cases with 67% safety margin.

**Files affected**:
- `OuterWallTessellator.ts`: Add `coalesceNearGridChain()` helper, call it in `emitSuperCell` (6 lines at insertion point), and in `emitChainCell` for corner vertices (optional, lower priority).

**Trade-offs**:
- Pro: ~20 LOC change, surgical, no architectural disruption
- Pro: Directly eliminates the geometric root cause (near-coincident pairs)
- Con: Creates micro-T-junctions where the dropped grid vertex was on a shared row boundary
- Con: Micro-T-junctions are ≤0.001 U ≈ 0.25mm — below 3D printer resolution (0.1-0.4mm)
- Con: T-junctions already exist from chain vertices on row boundaries (PROMO_EPSILON=0, R24)

**Expected impact**: Eliminates ~80% of super-cell slivers (the 57.5% of chain cells that R54 skips). Combined with R54 handling the remaining 24% of single-edge non-super-cells, total violation rate should drop from 47.7% to ~10-15%.

**Assumptions** (for Verifier to attack):
1. Intermediate grid vertices in super-cells can be safely omitted without creating mesh validation failures beyond existing T-junction tolerance
2. The COALESCE_RADIUS of 0.001 catches the majority of sliver-causing pairs without over-coalescing
3. Adjacent standard cells sharing modified row boundaries will maintain acceptable mesh quality despite the micro-T-junctions
4. The `chainAdjacentGridVerts` set already marks grid vertices that participate in super-cells — we can use this to scope the coalescing

### Proposal 2: Row-Boundary Vertex Propagation (Moderate)

**Idea**: Extend Proposal 1 with T-junction elimination. When a grid vertex is coalesced away from a super-cell edge, propagate the chain vertex into the adjacent standard cell's shared boundary edge. The standard cell uses the chain vertex instead of (or in addition to) the grid vertex.

**Mechanism**: Like R53 BPP but for HORIZONTAL (row) boundaries instead of vertical (column) boundaries. After coalescing:
1. Record (band, gridVertexIdx, chainVertexIdx) for each coalesced pair
2. When emitting standard cells at adjacent bands, check if any corner/edge vertex was coalesced in a neighboring chain cell
3. If so, insert the chain vertex into the standard cell's edge at the corresponding position

**Files affected**:
- `OuterWallTessellator.ts`: Coalescing logic (same as P1), plus a `horizontalBPP` map tracking propagated vertices, plus modifications to `emitStandardCell` and `emitSplitCell` to query the map.

**Trade-offs**:
- Pro: Truly eliminates T-junctions (watertight mesh)
- Pro: Chain vertex precision fully preserved
- Con: ~60-80 LOC — significantly more complex than P1
- Con: Standard cells near chain regions now contain chain vertices, blurring the grid/chain boundary
- Con: Must be carefully integrated with R53 BPP to avoid double-patching

**Expected impact**: Same as P1 for sliver elimination (~10-15% violation rate). Also eliminates micro-T-junctions, improving mesh quality for stricter mesh validators.

**Assumptions**:
1. R53 BPP's phantom vertex slot system has enough headroom for additional horizontal boundary propagations
2. Standard cells can handle non-square topology (extra vertex on one horizontal edge)
3. This doesn't conflict with R37 phantom rows in adjacent bands

### Proposal 3: Density Profile Anti-Proximity Moat (Radical)

**Idea**: Instead of post-hoc coalescing, prevent near-coincidence at the SOURCE. Modify `buildDensityProfile` to create a density MOAT (low-density zone) at chain vertex U-positions, surrounded by density WALLS (high-density flanking regions). This pushes CDF columns AWAY from chain vertices while maintaining high column density just outside the chain region.

**Mechanism**:
```
// Replace Gaussian floor with moat+wall profile:
for (const cu of chainVertexUs) {
    for (int off = -spread; off <= spread; off++) {
        const du = Math.abs(off / (featureRadius * N));
        if (du < MOAT_INNER) {
            density[idx] = Math.min(density[idx], MOAT_FLOOR); // suppress
        } else if (du < MOAT_OUTER) {
            density[idx] = Math.max(density[idx], WALL_HEIGHT); // boost
        }
    }
}
```

**Mathematical basis**: The moat creates a forbidden zone. CDF inversion maps low-density regions to wide column gaps. Columns avoid chain vertex U-positions, landing at the wall boundaries instead. The flanking columns capture the feature shape without interfering with chain vertices.

**Files affected**:
- `GridBuilder.ts`: Modify `buildDensityProfile` (~15 LOC change)

**Trade-offs**:
- Pro: Fixes the root cause at the EARLIEST possible pipeline stage
- Pro: No changes to tessellation code at all
- Pro: No T-junctions, no mesh topology changes
- Con: Chain vertex U-drift (~0.094 U per chain over 313 rows) means moats span a broad U range. With 243 chain points per chain spaced ~0.0004 apart, moats tile ~50-100% of the chain's drift range. This COULD destroy grid structure in feature regions — the same problem that killed `applyChainDeadZones`
- Con: The density profile is 1D (shared across all rows). At row r, the chain vertex is at a specific U. The moat at that U is great for row r but unnecessary (and harmful) for rows where the chain is at a different U.
- Con: Requires careful moat radius tuning to avoid the dead-zone tiling problem

**RISK**: This proposal MAY suffer from the same tiling problem that killed `applyChainDeadZones`. The difference: dead zones operated on PLACED columns (post-CDF), while this operates on the density profile (pre-CDF). But the fundamental issue — chain points are densely spaced in U — remains. **I rate this 40% likely to work without the tiling pathology.**

**Assumptions**:
1. The moat radius can be tuned small enough to avoid tiling while large enough to prevent slivers
2. CDF column placement from a moated density profile produces well-distributed columns (no clustering at moat edges)
3. Non-chain rows still get adequate feature resolution from walls alone

### Proposal 4: 3D-Aware Sweep Triangulation (Moderate/Radical)

**Idea**: Replace the UV-space sweep criterion with an APPROXIMATE 3D quality criterion. Instead of `maxCosine2D` (UV angles), compute approximate 3D edge lengths using a UV→3D scaling factor and choose the triangulation that minimizes 3D aspect ratio.

**Mechanism**: At each sweep step, the code currently decides which pointer to advance based on UV position (`botNextU < topNextU`). In the quality zone (R51), it uses `maxCosine2D`. Replace this with an estimated 3D aspect comparison:

```
// Approximate 3D lengths using radius at T-position
const r_bot = estimateRadius(tBot); // from rowProbeData or uniform
const r_top = estimateRadius(tTop);
const scale_u_bot = 2 * Math.PI * r_bot; // circumferential scale
const scale_u_top = 2 * Math.PI * r_top;
const scale_t = wallHeight; // vertical scale
// Compute approximate 3D edge lengths and pick better diagonal
```

**Files affected**:
- `OuterWallTessellator.ts`: Modify `sweepQuad` and `constrainedSweepCell` (~30 LOC)
- Need to pass radius/scaling information into sweep functions

**Trade-offs**:
- Pro: Addresses UV-to-3D distortion for ALL chain-strip triangles, not just near-coincident pairs
- Pro: Improves sweep quality beyond just the sliver problem
- Con: Doesn't eliminate near-coincident vertex pairs — the sweep might still create slivers because NEITHER diagonal of a near-coincident quad is good (as analyzed in the edge flip section)
- Con: Requires access to radius/scaling data in low-level sweep functions (API change)
- Con: Approximate 3D quality is still approximate — the actual surface is only known after GPU evaluation

**Expected impact**: Modest improvement (maybe 5-10 percentage point reduction in violations) because the fundamental problem is vertex proximity, not diagonal choice. **This is complementary to Proposals 1/2, not a replacement.**

**Assumptions**:
1. UV→3D scaling is roughly isotropic enough that radius-based approximation helps
2. The performance overhead of computing approximate 3D lengths per sweep step is acceptable
3. This doesn't introduce new pathologies (wrong diagonals in non-chain regions)

## Recommended Approach

**Phase 1 (immediate, ~20 LOC): Proposal 1 — Edge-Local Vertex Coalescing**

This directly attacks the #1 geometric root cause — near-coincident grid+chain vertices on super-cell edges. It's surgical, low-risk, and applies to the 57.5% of chain cells that R54 cannot touch.

Implementation: Add `coalesceNearGridChain()` to `emitSuperCell` and `emitChainCell`. Use `GRID_CHAIN_COALESCE_RADIUS = max(0.5 * avgColumnSpacing, 0.0005)` where `avgColumnSpacing = 1.0 / numU`.

**Phase 2 (if micro-T-junctions cause mesh validation issues): Proposal 2 — Horizontal BPP**

Only needed if Phase 1's micro-T-junctions cause problems for MeshValidator or 3D printing workflow. Expected to be unnecessary — existing T-junctions from chain vertices on row boundaries (PROMO_EPSILON=0) are already tolerated.

**Phase 3 (if remaining violations > 15%): Proposal 4 — 3D-Aware Sweep**

Complementary to Phase 1. Addresses the remaining slivers caused by UV-to-3D distortion rather than vertex proximity. Should bring overall violations to ~5-8%.

**NOT recommended**: Proposal 3 (density moat) — high risk of tiling pathology; the dead zone mechanism was tried and failed for the same structural reason.

## Open Questions

1. **What is the ACTUAL distribution of sliver aspect ratios between super-cells vs non-super-cells?** The Master's data says 57.5% of chain cells are super-cells, but we don't know if super-cells contain 57.5% of the bad triangles, or more, or fewer. A diagnostic that partitions the v25 quality metric by cell type would resolve this and validate the expected impact estimate.

2. **Does the mesh validator flag micro-T-junctions?** If `MeshValidator.ts` reports non-manifold edges at chain-cell/standard-cell boundaries, Phase 2 becomes mandatory. If it doesn't (or filters them), Phase 1 alone suffices.

3. **Is there an interaction between coalescing and R37 phantom rows?** Phantom rows create sub-band boundaries within super-cells. If a phantom row vertex is near-coincident with a chain vertex, coalescing could affect phantom row integrity. This needs checking during implementation.

4. **What is `R36.1`'s exact scope for `chainAdjacentGridVerts`?** R36.1 explicitly marks intermediate column grid vertices but excludes corner vertices (OWT L1934-1937). Can we use this set to scope which vertices are safe to coalesce (intermediate = safe, corner = needs T-junction handling)?

5. **Should `GRID_CHAIN_COALESCE_RADIUS` be static or row-adaptive?** At pot regions with small radius (narrow neck), circumferential distance per U-unit is smaller. A fixed radius in U-space corresponds to a smaller 3D distance. Using a 3D-distance-based threshold (if radius information is available) would be more precise but adds complexity.
