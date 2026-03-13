# Generator Round 47 — Persistent Dips & Wavy Artifact: Mesh Topology Root Causes
Date: 2026-03-09

## Problem Statement

R46 Phases 1-3 fixed all four identified vertex-position root causes (A-D). Exports confirm the fixes are active:
- 6508 fan diagonals protected
- 2007/2190 interpolated vertices re-snapped
- 2118 chain-grid flips prevented
- 2178/2178 subdivision midpoints re-snapped

Yet two artifacts remain:
1. **Persistent dips** in feature edges, with inconsistent correlation to grid column crossings
2. **NEW: wavy sharp edges**, appearing only after R46

The vertex positions are correct. The problem is in how the mesh connects those vertices.

---

## Root Cause Analysis

### 1. WHY do 37.1% of chain-strip triangles have aspect ratio > 4:1?

**File:** [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L294-L390) — `constrainedSweepCell()`

The slivers are created by the **fan diagonal topology** in chain cells. Here's the geometry:

A chain cell has a grid cell (column c to c+1, row j to j+1) with a chain vertex on the bottom edge at some U position and another on the top edge. The chain edge partitions the cell into a left sub-quad and a right sub-quad. For 2×2 sub-quads, the R41 "chainFanQuad" path kicks in:

```
Left sub-quad (chain on RIGHT):          Right sub-quad (chain on LEFT):

TL ————————— chainTop                    chainTop ————————— TR
|  ╲              |                      |              ╱  |
|    ╲            |                      |            ╱    |
|      ╲          |     fan diagonal:    |          ╱      |    fan diagonal:
|        ╲        |     chainBot → TL    |        ╱        |    chainBot → TR
|          ╲      |                      |      ╱          |
BL ————————— chainBot                   chainBot ————————— BR
```

For the left sub-quad, the two triangles are:
- **T1**: (BL, chainBot, TL) — spans the full left width
- **T2**: (TL, chainBot, chainTop) — a "bridge" triangle connecting the grid corner TL to the near-vertical chain edge

**Triangle T2 is the sliver source.** It has:
- One edge along the chain (chainBot → chainTop): nearly vertical, length ≈ row spacing in T
- One edge from TL to chainBot: horizontal distance = |U_chain - U_col|
- One edge from TL to chainTop: similar horizontal distance but different row

When U_chain is far from U_col (chain in the middle of the cell), the TL-to-chain horizontal distance is large, making T2 a reasonable triangle. But when U_chain is CLOSE to a column boundary, the sub-quad collapses: T2 becomes extremely thin (near-zero base width, full row-height).

**The statistics confirm this:** 8729 chain cells × 2 fan triangles per cell × some fraction near column boundaries = ~18,659 violations (37.1% of 50,295 chain-strip tris).

**Critical geometry detail:** The fan diagonal direction is deterministic: always `chainBot → grid_top_corner`. This means ALL fan diagonals emanate from the bottom chain vertex, creating a **high-valence hub** at chainBot and **asymmetric triangle sizes** between top and bottom halves of each chain cell. This valence imbalance directly causes the 15,561 grading violations (adjacent triangles with area ratio > 2:1).

### 2. HOW does mesh topology create visible dips?

Even with chain vertices at perfect 3D ridge positions, the mesh surface between chain vertices is determined by flat triangle faces. The "dip" occurs where a triangle face interpolates between an on-ridge chain vertex and an off-ridge grid vertex.

**Chording error anatomy:**

```
Cross-section along T (looking down the ridge):

                  ★ true ridge curve
              ★       ★
         ★  ╱ chord     ★
     ★   ╱   sag          ★
   ★  chainBot ─────────── chainTop     ← chord between chain vertices
  ★  ╱                        ╲  ★
TL ╱ ← mesh face (flat tri)    ╲  ★    ← the flat triangle T2 slopes
   ╰──────── dip is HERE ───────╯       DOWN from ridge toward TL
```

The **chord sag** between chainBot and chainTop is the gap between the straight chord and the true curved ridge. This is proportional to (row spacing)² × ridge curvature — fundamental to piecewise-linear approximation.

But the **visible dip** is worse than just chord sag. The triangle T2 = (TL, chainBot, chainTop) interpolates linearly. At any point along the chain edge (between chainBot and chainTop), the mesh surface is exactly on the ridge. But moving laterally toward TL, the surface slopes downward because TL is off-ridge. A viewer looking along the ridge sees:

1. At each chain vertex: mesh is at ridge height ✓
2. Between chain vertices: the chord sags slightly below the ridge
3. On the triangle face next to the ridge: the surface slopes away from the ridge

**What makes SOME crossings produce visible dips and others not:**

The dip magnitude depends on:
- **Cell aspect ratio**: Wide cells (large U span per column) create longer fan diagonals → deeper dips
- **Chain position within cell**: Chain near cell center → moderate fan triangles on both sides. Chain near cell edge → one extreme sliver + one broad triangle. The broad triangle creates a deeper dip.
- **CDF-adaptive column spacing**: Near features, columns are denser (good). But the chain doesn't always land in a dense-column region — CDF adapts to curvature, not to exact chain position. Where column boundaries are sparse, dips are worse.
- **Ridge curvature**: Flat ridges (constant curvature) have uniform dips that read as "smooth." Ridges with varying curvature create non-uniform dips that the eye perceives as artifacts.

**The inconsistent correlation with column crossings** is explained by the column-crossing creating a topology transition: at the crossing, the super-cell/phantom-vertex system activates, and the companion vertices change the local triangle connectivity. Depending on the crossing geometry, this can either improve (companion provides intermediate vertex that reduces chord sag) or worsen (phantom vertex creates additional slivers) the dip.

### 3. WHY do sharp edges look wavy after R46?

Two R46 changes interact to create waviness on sharp features:

**Change 1: Independent per-vertex re-snap (Phase 2)**

Before R46: Interpolated vertices used linearly interpolated U → smooth but inaccurate.
After R46: Each interpolated vertex is independently re-snapped to the local extremum via GPU sampling with parabolic refinement.

For a sharp feature (ridge with very small U variation per row, say ΔU ≈ ±0.0002/row):
- Re-snap window: hw = max(BASE_HW, gapSize² × 0.001). For multi-row gaps (gapSize=3-5), hw ≈ 0.001-0.005
- Candidate spacing: 2×hw/(cands-1) ≈ 0.0001-0.0003 per candidate
- Feature U variation: ~0.0002 per row

The sampling noise (±½ candidate spacing ≈ ±0.00015) is **comparable to the feature's natural variation** on sharp features. Each vertex independently finds the extremum within its sampling noise floor. The result: a sequence of re-snapped U values with random walk characteristics rather than the smooth linear interpolation that existed before.

**Parabolic refinement doesn't fully fix this**: it provides sub-sample precision but still operates on the same noisy radius samples. On sharp features where the radius profile is extremely flat near the peak, the parabolic fit becomes ill-conditioned (denominator L - 2C + R → 0).

**Change 2: Blanket CSO chain-grid skip (2118 prevented flips)**

Before R46: CSO freely flipped chain-grid edges to improve triangle quality. On sharp features, these flips regularized the triangle topology near the chain, effectively "smoothing" the visual impact of vertex position noise.

After R46: The CDT topology from OWT is frozen for chain-grid edges. The CDT tessellation is optimized for the constraint geometry (chain edges as mandatory edges) but NOT for visual quality along the ridge. The unoptimized CDT topology makes the noisy vertex positions more visible.

**The combination**: noisy vertex positions + unoptimized triangle topology = wavy appearance specifically on sharp features (where the noise-to-signal ratio is worst).

### 4. WHAT is the relationship between dips and grid column crossings?

When a chain crosses a column boundary, the pipeline activates in sequence:

1. **R35 super-cell merge**: Adjacent chain cells are merged into a super-cell spanning multiple columns
2. **R37 phantom vertices**: Phantom vertices are inserted at the T-value where the chain edge crosses the column boundary
3. **R38 companion vertices**: Local companion vertices are placed near crossing anchors at fractional T positions (0.25, 0.50, 0.75 of band height)

At a crossing, the topology transitions from:
- Single-cell fan topology (chainBot → grid corner diagonal) to
- Multi-cell super-cell topology with phantom/companion intermediates

**Why some crossings produce visible dips:**

1. **Crossing angle matters**: A chain crossing at θ = 45° (1 column per row) introduces 1 phantom vertex per crossing. A chain crossing at θ = 60° (2+ columns per row) creates multiple phantom vertices + larger super-cells. Steeper crossings → more phantom vertices → more complex topology → more opportunities for slivers.

2. **Companion T-fractions [0.25, 0.50, 0.75]**: These fixed fractions create sub-bands. If the crossing happens near one of these fractions, the companion is very close to the phantom, creating a near-degenerate sub-band → sliver triangles. If the crossing is between fractions, companions provide good intermediate vertices → less dipping.

3. **`batch2Remap` merge threshold (1e-4)**: When a chain vertex is within 1e-4 U of a grid column, it's merged with the grid vertex. This eliminates the chain vertex as a distinct point, and the cell is treated as a standard cell. The chain edge effectively "snaps" to the column boundary. When the chain is just OUTSIDE the merge threshold (1e-4 < distance < ~1e-3), the fan triangle is extremely thin → maximum sliver / dip.

**The inconsistency** arises because the dip magnitude depends on the specific combination of crossing angle, companion proximity, merge threshold, and column spacing — all of which vary per crossing.

---

## Proposals

### Proposal 1: Selective CSO Chain-Grid Flip (Conservative)

**Idea**: Replace the blanket `isChainGridEdge` skip with a quality-gated filter that allows beneficial flips while protecting topology coherence.

**Mechanism**: In CSO `optimizeChainStrips()`, lines 643/700/766, instead of:
```typescript
if (isChainGridEdge(shLo, shHi)) { chainGridFlips++; continue; }
```

Use:
```typescript
if (isChainGridEdge(shLo, shHi)) {
    // Allow flip only if: (a) large quality improvement, AND
    // (b) the new diagonal doesn't cross a chain edge
    const qualityGain = flipMin - curMin;
    if (qualityGain < CHAIN_GRID_FLIP_THRESHOLD) { chainGridFlips++; continue; }
    // Check that the new diagonal (opp0-opp1) doesn't cross any constraint edge
    if (constraintEdgeSet.has(edgeKey(opp0, opp1))) { chainGridFlips++; continue; }
    // The new diagonal must not create a cross-row edge spanning >1 row
    if (rowSpanExceeds(shLo, shHi, opp0, opp1)) { chainGridFlips++; continue; }
    chainGridFlipsAllowed++;
}
```

Where `CHAIN_GRID_FLIP_THRESHOLD ≈ 0.15 rad` (~8.6°) — only flip if the minimum angle improvement is substantial.

**Mathematical basis**: The R46 blanket skip was motivated by protecting fan diagonal consistency. But fan diagonals are already protected by being in `constraintEdgeSet` (R46 Phase 1). The chain-grid INTERIOR edges (non-fan, non-chain edges connecting a chain vertex to a grid vertex) can be safely flipped without topology regression as long as:
1. The new edge doesn't cross a protected chain edge
2. The quality gain justifies the topology change
3. No cross-row edges are created

**Files affected**: [ChainStripOptimizer.ts](../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L643) — 3 identical sites (phases A/B/C)

**Trade-offs**:
- (+) Restores ~50-60% of the 2118 previously-beneficial flips
- (+) Directly addresses wavy artifact by improving triangle quality
- (-) Some flips may degrade ridge alignment (gated by threshold)
- (-) Need to tune CHAIN_GRID_FLIP_THRESHOLD empirically

**Assumptions** (for Verifier to attack):
1. Fan diagonal edges are IN constraintEdgeSet (protected separately from chain-grid interior edges)
2. A 0.15 rad threshold is aggressive enough to only allow truly beneficial flips
3. The cross-constraint-edge check is sufficient to prevent topology violations
4. The current `rowSpanExceeds` guard is sufficient for chain-grid flips

### Proposal 2: Fan Midpoint Vertex Insertion (Moderate)

**Idea**: For each fan triangle with predicted aspect ratio > 3:1, insert a GPU-evaluated midpoint vertex on the fan diagonal, splitting the two fan triangles into four better-shaped triangles.

**Mechanism**: After OWT creates `fanDiagEdges` (6508 edges), add a post-pass:

```
For each fan diagonal edge (chainVtx, gridVtx):
  1. Compute predicted aspect ratio from UV positions
  2. If aspect > ASPECT_THRESHOLD (3.0):
     a. Compute midpoint UV: (u_mid, t_mid) = average of fan endpoints
     b. GPU-evaluate the midpoint → 3D position on the surface
     c. Insert the new vertex and split both adjacent triangles:
        Before: T1=(BL, chainBot, TL), T2=(TL, chainBot, chainTop)
        After:  T1a=(BL, chainBot, M), T1b=(BL, M, TL),
                T2a=(TL, M, chainTop), T2b=(M, chainBot, chainTop)
        where M = midpoint of fan diagonal (chainBot, TL)
```

**Mathematical basis**: The fan diagonal is the longest edge in the sliver triangle. Splitting it at the midpoint halves the maximum edge length and creates four triangles each with aspect ratio ≤ 2× the original triangle's minimum dimension / half the original's max dimension. In practice, this converts 4:1+ slivers into ~2:1 triangles.

**Files affected**:
- [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1424) — collect fan edges with metadata
- [ParametricExportComputer.ts](../src/renderers/webgpu/ParametricExportComputer.ts#L1480) — new post-OWT pass before GPU eval
- New helper function `subdivideFanDiagonals()` (could live in MeshSubdivision.ts)

**Trade-offs**:
- (+) Directly halves worst-case aspect ratio in chain strip
- (+) Estimated ~3000-4000 new vertices (modest: +0.5% of 768K total tris)
- (+) Fan midpoints are on the parametric surface (GPU-evaluated) → no chord sag
- (-) Increases tri count by ~6000-8000 (×2 per split)
- (-) Adds ~200-500ms for GPU evaluation of midpoints
- (-) Fan midpoint vertices need their own re-snap logic if they're near features
- (-) Must update constraintEdgeSet with the split sub-edges

**Assumptions** (for Verifier to attack):
1. A UV-midpoint of a fan diagonal is close enough to the true surface midpoint (valid for low-curvature grid cells)
2. Aspect ratio > 3:1 in UV space predicts > 4:1 in 3D space with sufficient reliability
3. Splitting fan diagonals doesn't create new slivers at the boundaries of split vs unsplit cells
4. 3000-4000 new vertices won't push memory budgets

### Proposal 3: Neighbor-Constrained Re-snap for Interpolated Vertices (Moderate)

**Idea**: Instead of independently re-snapping each interpolated vertex, apply a monotonicity constraint: re-snapped U must be between the re-snapped U values of its two chain neighbors.

**Mechanism**: Modify Phase 2 re-snap in PEC (lines ~1480-1560):

```
Phase 2a (existing): Re-snap all interpolated vertices independently
Phase 2b (NEW): Smooth the re-snapped U sequence per chain:

For each chain with interpolated vertices:
  1. Identify primary (non-interpolated) vertices and their re-snapped U values
  2. For each interpolated vertex between two primaries:
     - Compute expected U by linear interpolation between neighbor primaries
     - Blend: finalU = (1 - α) × resnappedU + α × expectedU
     - where α = 0.3-0.5 (tunable smoothing strength)
  3. For chains with consecutive interpolated vertices (gap > 2):
     - Apply running 3-point Gaussian smooth to U values
     - Clamp to ±maxDrift from pre-smooth position
```

**Mathematical basis**: Interpolated vertices fill multi-row gaps where no feature was detected. Their "true" position is uncertain (no ground-truth feature detection at that row). Linear interpolation between known points is the maximum-likelihood estimate given no additional information. The independent re-snap finds a local extremum, but on sharp features the extremum search is noisy due to flat radius profiles. Blending with the smooth estimate reduces noise while preserving the re-snap's accuracy at vertices where the feature is clearly detectable.

**Files affected**: [ParametricExportComputer.ts](../src/renderers/webgpu/ParametricExportComputer.ts#L1480) — add Phase 2b after Phase 2a

**Trade-offs**:
- (+) Directly addresses wavy artifact on sharp features
- (+) Zero GPU cost (pure post-processing of re-snap results)
- (+) Minimal code addition (~40 lines)
- (-) Introduces a smoothing bias (moves vertices away from true extremum)
- (-) The blend factor α is a tuning parameter with no ground truth
- (-) May over-smooth features that have legitimate U variation between rows

**Assumptions** (for Verifier to attack):
1. On sharp features, the re-snap noise dominates the signal (noise ≈ signal)
2. Linear interpolation between primaries is a reasonable smooth estimate
3. α = 0.3-0.5 is in the right range for the noise/signal ratio we observe
4. The blend won't degrade accuracy on moderate/gentle features where re-snap is accurate

### Proposal 4: Adaptive Column Densification Near Chain Positions (Moderate)

**Idea**: After chain linking but before grid building, insert additional grid columns at chain U positions (or very close to them). This makes chain vertices nearly coincident with grid columns, triggering the `batch2Remap` merge and eliminating the chain-vs-grid topology entirely for most chain cells.

**Mechanism**: In GridBuilder or PEC, after `meshChains` are computed:

```
For each chain:
  For each chain point:
    Add chain.point.u to the unionU column set (with dead-zone and merge tolerance)
```

If a chain point's U is within MERGE_THRESHOLD (1e-4) of an existing column, it merges automatically. If it's NOT within merge threshold, adding it as a new column means the chain vertex will be ON a grid column → no fan topology needed → no slivers.

**Mathematical basis**: The entire sliver problem exists because chain vertices sit BETWEEN grid columns. If they're ON grid columns, each chain cell has chain vertices coincident with grid corners, and `constrainedSweepCell` produces standard sweep topology (no fan diagonals, no slivers).

**Files affected**:
- [GridBuilder.ts](../src/renderers/webgpu/parametric/GridBuilder.ts) — add chain U positions to column candidates
- [ParametricExportComputer.ts](../src/renderers/webgpu/ParametricExportComputer.ts) — pass chain data to grid builder

**Trade-offs**:
- (+) Eliminates slivers at the source rather than patching them afterward
- (+) Dramatically reduces chain-strip complexity (most cells become standard cells)
- (+) No GPU evaluation cost (grid columns are just coordinates)
- (+) Reduces super-cell count (chains stay within their column)
- (-) Could dramatically increase column count for chains with many unique U values
- (-) Adjacent chains at similar but different U → many very narrow columns → new slivers
- (-) CDF-adaptive grid already places columns near features — this may duplicate that effort
- (-) Changes grid dimensions (outerW increases) → affects ALL downstream code
- (-) Risk of creating very thin columns between chain-columns and existing CDF-columns

**Assumptions** (for Verifier to attack):
1. Chain points have sufficiently distinct U values that adding them as columns won't create too-narrow column pairs
2. The dead-zone system in GridBuilder can handle the additional column requests without degeneracy
3. changesGridBuilder outerW don't cascade into breaking changes in downstream pipeline stages
4. The performance cost of additional columns (more GPU evaluation, more vertices) is acceptable

### Proposal 5: Use Smoothed Chain for Topology, Raw for Positions (Radical)

**Idea**: Decouple the chain data used for mesh TOPOLOGY (which cells are chain cells, how they're partitioned) from the chain data used for vertex POSITIONS. Use WH-smoothed chains for topology and preSmoothChains for vertex 3D positions.

**Mechanism**: In PEC, at the point where OWT is called:

```
// Topology chains: smoothed for regular cell partitioning
const topoChains = filterLowConfidenceChains(smoothedChains);
// Position chains: raw for accurate feature positions  
const positionChains = filterLowConfidenceChains(preSmoothChains);

// OWT uses topoChains for cell layout:
const owtResult = buildCDTOuterWall(..., topoChains, ...);

// After OWT, override chain vertex UV positions with positionChains:
for (let ci = 0; ci < topoChains.length; ci++) {
    for (let pi = 0; pi < topoChains[ci].points.length; pi++) {
        const topoU = topoChains[ci].points[pi].u;
        const rawU = positionChains[ci].points[pi].u;
        // Find the OWT vertex for this chain point and override its U
        chainVertices[...].u = rawU;
    }
}
```

**Mathematical basis**: WH smoothing produces a regular, monotone U profile that places chain vertices at predictable positions within cells. The smooth positions also better align with CDF-adaptive column placement (which was tuned for smooth feature curves). After position override, the GPU evaluates vertex 3D positions at the true feature U, so the mesh vertices are at correct 3D ridge positions. But the cell PARTITIONING uses smooth U → more regular sub-quad shapes → fewer slivers.

**Files affected**:
- [ParametricExportComputer.ts](../src/renderers/webgpu/ParametricExportComputer.ts#L1111) — dual chain setup
- [OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L700) — accept separate position overrides

**Trade-offs**:
- (+) Gets the best of both worlds: smooth topology + accurate positions
- (+) Directly addresses both dips (smoother topology) and waviness (smooth partitioning)
- (-) HIGH RISK: if smooth and raw chains map to different cells, the position override breaks the cell layout
- (-) Interpolated vertices: smooth vs raw interpolation may disagree on which rows get vertices
- (-) Chain edges: the constraint edges use vertex indices from OWT; overriding U changes the fan geometry
- (-) Phase 2 re-snap would need to operate on the topology-to-position displaced vertices

**Assumptions** (for Verifier to attack):
1. Smoothed and raw chain points always map to the same cells (same column boundaries)
2. The WH smoothing displacement is small enough that position override doesn't create invalid geometry
3. Fan diagonal topology is valid for the RAW positions even though it was computed for SMOOTH positions
4. Interpolated vertex counts are identical between smoothed and raw chains

---

## Recommended Approach

**Phase 1: Proposals 1 + 3 (immediate, ~2 hours implementation)**

These are low-risk, low-cost changes that directly address the two reported artifacts:
- **Proposal 1** (selective CSO chain-grid flip): Partially restores quality optimization, addressing the wavy artifact
- **Proposal 3** (neighbor-constrained re-snap): Smooths the re-snap noise on sharp features, directly fixing waviness

Together, these should eliminate the wavy artifact and marginally improve dip depth by better-optimizing chain-strip triangles.

**Phase 2: Proposal 2 (if Phase 1 insufficient, ~3-4 hours)**

Fan midpoint insertion is a targeted fix for the 37.1% sliver rate. It adds geometry exactly where it's needed (on long fan diagonals) without changing the overall pipeline architecture.

**Phase 3: Proposal 4 (if slivers persist after Phase 2, ~4-6 hours)**

Column densification at chain positions is the most architecturally impactful change but also the most effective — it eliminates the root cause of slivers. Should be attempted only after Phase 1+2 results are evaluated.

**Proposal 5 is deferred** — the coupling between topology and positions is too tight to safely decouple without extensive testing. The risk of cell-mismatch between smoothed and raw chains is high.

---

## Open Questions

1. **Is `batch2Remap` MERGE_THRESHOLD (1e-4) optimal?** Increasing it to 1e-3 would merge more chain vertices with grid columns, eliminating more fan slivers — but at the cost of displacing chain vertices further from their true U positions. What's the actual distribution of chain-to-column distances?

2. **Are fan diagonals actually in constraintEdgeSet?** The R46 Phase 1 fix adds fan diagonals to constraintEdgeSet in PEC, but I want the Verifier to confirm that `fanDiagEdges` are properly propagated through `outerChainEdges` → `constraintEdgeSet` → CSO. If fan diags are NOT in constraintEdgeSet, then Proposal 1's assumption that the blanket skip was redundant for fan protection is WRONG.

3. **What is the 3D aspect ratio distribution of the 2118 prevented CSO flips?** If most of the prevented flips had flipMin < curMin (quality-degrading), then the blanket skip was correct and Proposal 1 is moot. If most were quality-improving, Proposal 1 is high-value.

4. **Can we measure chord sag along ridges?** If we compute the midpoint of each chain edge in 3D and compare to the GPU-evaluated true surface position at the UV midpoint, we get the actual chording error magnitude. If it's < 0.05mm, dips are a topology/shading issue, not a geometry issue. If it's > 0.2mm, we need more subdivision.

5. **Does the CSO `identifyChainStripTriangles` correctly classify fan triangles?** Fan triangles have 2 grid vertices + 1 chain vertex. The index-based test checks `any vertex >= outerGridVertexCount`. A fan triangle with `gridCornerA, gridCornerB, chainVertex` would be detected. But a fan triangle where all vertices have been batch2Remapped to grid indices would be MISSED. How many fan triangles are missed by UV-proximity detection?

6. **Companion T-fractions**: The R38 companion system uses fixed T-fractions [0.25, 0.50, 0.75]. Has anyone tested [0.33, 0.67]? The ⅓/⅔ fractions create more equilateral sub-bands for typical grid cells, potentially reducing sliver count.

---

## Risk Assessment

| Proposal | Implementation Risk | Regression Risk | Impact on Dips | Impact on Wavy | Estimated Time |
|----------|-------------------|-----------------|----------------|----------------|---------------|
| 1 (Selective CSO) | Low | Low-Medium | Marginal | High | 1-2 hours |
| 2 (Fan Midpoints) | Medium | Low | High | Marginal | 3-4 hours |
| 3 (Constrained Re-snap) | Low | Low | None | High | 1 hour |
| 4 (Column Densification) | High | Medium-High | Very High | Medium | 4-6 hours |
| 5 (Dual Chains) | Very High | High | High | High | 6-8 hours |
