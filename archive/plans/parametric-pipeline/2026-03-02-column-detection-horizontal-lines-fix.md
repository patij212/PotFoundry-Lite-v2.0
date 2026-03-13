# Feature Edge Detection: Comprehensive Review & Redesign Plan

**Date:** 2026-03-02
**Branch:** `refactor/core-migration`
**Status:** Deep investigation — 3+ fix attempts have failed

---

## Executive Summary

After three rounds of fixes (v16.1 snap-to-row, v16.6 localOnly disable, v17.1 taper-subtraction + consensus filter), horizontal feature line artifacts persist. The taper-subtraction pipeline is correctly wired and the code has no obvious bugs. The problem is **architectural**: the entire column detection approach is solving the wrong problem, and the `localOnly=true` default path has its own set of issues unrelated to column detection.

This document presents:
1. A verified wiring audit confirming the v17.1 code IS correctly connected
2. Five root causes identified across the pipeline
3. A critique of core architectural decisions
4. A proposed redesign

---

## Part 1: Wiring Audit — Is the v17.1 Code Actually Connected?

**Answer: YES, the v17.1 pipeline is fully wired.**

| Step | Function | Called at | Wired? |
|------|----------|----------|--------|
| Taper computation | `computeTaperProfile()` | PEC line 824-826 | YES |
| Taper-relative detection | `detectTDirectionFeatures(colData, N, taperProfile)` | PEC line 835 | YES — taperProfile passed as 3rd arg |
| Signal subtraction | `signal[i] = radii[i] - taperProfile[i]` | FD line 1048-1055 | YES — actually subtracts |
| Consensus filter | `filterByColumnConsensus()` | PEC line 842-844 | YES |
| Cross-validation | `crossValidateAndMergeColumnFeatures()` | PEC line 849-854 | YES — feeds into allRowFeatures |
| Kind matching | `result.kind !== feat.kind → reject` | FD line 1538 | YES |
| Prominence gate | `result.prominence < MIN_ROW_PROMINENCE → reject` | FD line 1542 | YES |
| Chain linking | `linkFeatureChainsByKind(allRowFeatures, ...)` | PEC line 897 | YES — receives merged arrays |

**But none of this matters** because `localOnlyMode: true` is the UI default (ExportDialog.tsx line 142). The entire column probing path (lines 801-860) is gated behind `!cfgLocalOnly`. In normal usage, **zero column detection runs**.

---

## Part 2: The Five Root Causes

### Root Cause 1: `localOnlyMode=true` Disables Everything, But Problems Still Exist

When `cfgLocalOnly = true`:
- Column probing: **DISABLED** (PEC line 801)
- T-feature merging into grid: **DISABLED** (PEC line 695-697: `tMerged = { positions: cdfT, injected: 0 }`)
- Union feature grid: **DISABLED** (PEC line 1186: `unionU = outerBaseU` — bare uniform grid)
- Chain-guided row insertion: **maxRowInsertions = 0** (PEC line 1057: `cfgLocalOnly ? 0 : ...`)
- Feature budget columns: **DISABLED**

**What STILL runs in localOnly mode:**
1. Phase 1 curvature sampling (16 strips × 4096 samples) — GPU ✓
2. Phase 2 `detectFeatureEdges` on both T and U — CPU ✓ (but results DISCARDED)
3. Phase 2.5 per-row U-direction probing (8192 samples/row) — GPU ✓
4. `detectAllRowFeatures` — CPU ✓
5. `linkFeatureChainsByKind` — CPU ✓
6. GPU resnap — GPU ✓
7. `buildCDTOuterWall` with chains — CPU ✓

**So in localOnly mode, chains ARE built from row-detected features and passed to the tessellator.** The question is: what goes wrong between detection and tessellation?

### Root Cause 2: UV-Snapping Creates a Grid-Aligned Discretization That Loses Feature Precision

In `localOnly` mode, `unionU = outerBaseU` (the bare uniform grid with no feature columns). When `buildCDTOuterWall` processes chains:

1. **UV-snapping** (OuterWallTessellator Step 2): Each chain point's U is snapped to the nearest grid column. The grid vertex at `(row, nearestCol)` has its U overwritten to match the chain's U.

2. **Problem**: With a uniform grid of ~735 columns, grid spacing is `1/735 ≈ 0.00136`. If two chain points on adjacent rows snap to different columns (because one is at U=0.2343 and the next at U=0.2357, straddling a grid boundary), the chain edge in the mesh takes a **staircase path** through the grid — it alternates columns instead of following the smooth feature curve.

3. **Worse**: If a chain point's U is equidistant from two grid columns, which column it snaps to depends on floating-point rounding. This creates **random staircase jitter** in the chain edges.

4. **The "horizontal lines" symptom**: When chain edges staircase across multiple grid columns, each step creates a chain segment that runs along a row (horizontal in UV space). Many chains experiencing this simultaneously at similar T positions produce visible horizontal line patterns in the mesh.

### Root Cause 3: The Chain-Grid Connection Topology Is Fundamentally Broken in localOnly Mode

The v20.0 comment at PEC line 1182-1185 describes the history:
> - v17.0 corridor columns doubled grid size (735→1395, +660 cols)
> - v18.0 tried GPU-surface subdivision but dihedral stayed at 0.04
> - **v19.0: chain vertices removed → features imprecise (±0.5 grid cell)**
> - v20.0: per-row UV snapping — nearest grid vertex snapped to chain U

The current approach (v20.0 UV-snapping) has a critical architectural limitation: **there are no dedicated chain vertices in the mesh**. Chain "vertices" are just regular grid vertices that have been moved. This means:

1. **No extra density around features**: The grid has the same vertex density everywhere. A feature edge shares the same triangle size as smooth areas.
2. **Chain-strip detection relies on UV-proximity heuristics** (hybrid index-based + UV-proximity in ChainStripOptimizer) rather than explicit chain vertex indices. This detection can fail.
3. **Transition vertices only work when `cfgLocalOnly = false`**: The `insertGradedTransitionVertices` function in OuterWallTessellator is called during `buildCDTOuterWall`, but its effectiveness depends on there being actual chain vertices (`vertexIdx >= gridVertexCount`). In localOnly mode with UV-snapping, chain "vertices" ARE grid vertices (index < gridVertexCount), so the R2 violation check (which looks for `idx < gridVertexCount` boundary vertices adjacent to feature vertices) doesn't trigger.

### Root Cause 4: Chain Gaps from the Linking Algorithm

The chain linker has generous but not perfect parameters:
- `CHAIN_LINK_RADIUS = 0.04` (maximum U-distance to link across rows)
- `maxMissCount = 6` (bridges up to 6 consecutive missing rows)
- Secondary pass with tighter radius (0.028) recovers broken segments

**But**: For styles with many closely-spaced features (like fine fluting with 20+ ridges), chain linking can:
1. **Cross-assign**: Feature A in row j links to Feature B in row j+1 (wrong feature) because they're within the 0.04 radius
2. **Fork-abandon**: When features split/merge in the m-transition zone, the momentum prediction (`predictedU`) may overshoot, causing the chain to miss a shifted feature and start a new chain instead
3. **Starvation**: With kind-separated linking, valleys (often fewer/weaker than peaks) form shorter, gappier chains

### Root Cause 5: The `detectRowFeaturesV16` Minimum Prominence Threshold Is Style-Agnostic

`detectRowFeaturesV16` uses `minProminence = 0.005 mm` (absolute, hardcoded). This works for styles with strong ridges (prominence >> 0.005mm) but fails for:
- **Gentle textures**: Subtle surface undulations with prominence 0.002-0.005mm are rejected, creating rows with no features → chain gaps
- **Deep carved styles**: The prominence in mm varies with the base radius R(t). At the narrow top (Rt=20mm) vs wide base (Rb=60mm), the same style modulation `amp * sin(...)` produces 3× different absolute prominence. Features near the narrow end may be below 0.005mm while the same feature at the wide end is well above.

A **relative** prominence (fraction of local mean radius) would be more robust than an absolute mm threshold.

---

## Part 3: Critique of Core Architectural Decisions

### What's Strong

1. **Row detection is solid**: `detectRowFeaturesV16` is well-designed. Dual-strategy (gradient + curvature), full verification pipeline, kind classification, confidence scoring. It correctly detects U-direction features because at fixed T, the cylindrical radius IS the right signal.

2. **Chain linking algorithm is well-engineered**: Global optimal matching, momentum prediction, two-pass with residual recovery, kind separation. This is production-quality code.

3. **GPU resnap is valuable**: Parabolic refinement to sub-sample precision at 20× the row probe resolution. This gives genuine improvement in chain point accuracy.

4. **Feature edge protection through the pipeline**: The `FeatureEdgeGraph` → `isFeatureEdge` check is consistently used by MeshOptimizer, MeshSubdivision, and AdaptiveRefinement. No downstream module destroys chain edges.

### What's Weak

1. **The localOnly/non-localOnly split creates two incompatible architectures**:
   - `localOnly=true`: UV-snapping, no feature columns, no transition vertices, no row insertion, no column detection. Simple but lossy.
   - `localOnly=false`: Full feature columns, CDT chain strips, transition vertices, column detection. Complex but untested in practice (disabled by default).

   Neither path is complete. The "good parts" of each path need to be combined.

2. **UV-snapping is a lossy approximation**: Moving a grid vertex from its uniform position to a chain's U position distorts the triangles sharing that vertex. It's essentially warping the grid. For small movements (< half grid spacing), this is acceptable. For larger movements or when two chains are close together, it creates visibly distorted triangles.

3. **No dedicated chain vertices in localOnly mode**: The v19.0→v20.0 transition removed chain vertices (because bridge triangles were "topologically broken"). But the fix (UV-snapping) traded one problem (bad bridge triangles) for another (no transition density). The correct solution is to fix the bridge triangles, not remove chain vertices.

4. **Column detection is trying to solve a non-problem**: On a surface of revolution, style features are primarily **circumferential** (ridges run vertically in UV space). T-direction features (horizontal ridges) are rare in pottery styles. The elaborate column detection infrastructure (GPU probing, taper subtraction, consensus filtering, cross-validation) adds complexity for a use case that barely exists. The taper subtraction works correctly but there may be nothing meaningful to detect after subtracting it.

5. **Chain strip triangulation density is disconnected from the grid**: Even when `densityMultiplier = 4` (default), the transition vertices are only inserted inside `buildCDTOuterWall`. In localOnly mode with no actual chain vertices (all UV-snapped), the "chain strip" detection heuristic (UV-proximity based) may not reliably identify which triangles need optimization.

6. **No feedback loop**: The pipeline runs detection → linking → tessellation as a single forward pass. There's no validation step that checks "did the mesh actually capture the detected features?" and no retry mechanism.

---

## Part 4: What the User Is Actually Seeing

Given `localOnlyMode=true` (the default), the symptoms described by the user map to:

| Symptom | Likely Cause |
|---------|-------------|
| "Horizontal bands in feature detection" | UV-snapping staircase: chain points snapping to alternating grid columns creates horizontal chain segments |
| "Feature chains have gaps" | `minProminence = 0.005mm` absolute threshold rejects features in low-radius regions; or `CHAIN_LINK_RADIUS = 0.04` is too tight for features that shift significantly between rows |
| "Chain strip area is not denser than the grid" | In localOnly mode, no dedicated chain vertices exist — UV-snapping just moves grid vertices. No transition vertices are added because chain "vertices" have grid indices |
| "Base mesh connected to feature chains with single stretched triangle edges" | UV-snapping moves grid vertices to chain U positions, creating triangles with one vertex displaced from the uniform grid. No transition vertices smooth this displacement |

---

## Part 5: Proposed Redesign

### Philosophy Change: Feature Vertices, Not Feature Columns

The current architecture tries to make features work through the grid (either by adding feature columns to the grid or by snapping grid vertices to features). Both approaches are fundamentally constrained by the grid topology.

**The correct approach**: Insert actual chain vertices into the mesh as first-class vertices with dedicated indices, then ensure proper triangulation around them with transition density. This was the v17.0 approach that was abandoned because of "bridge triangle" topology issues. Those issues should be fixed directly, not worked around by removing chain vertices.

### Phase 1: Re-introduce Chain Vertices (Fix the v19.0 Regression)

**Goal**: Chain points become dedicated vertices in the mesh, not UV-snapped grid vertices.

In `buildCDTOuterWall`:
1. Keep the grid vertices as-is (no UV-snapping)
2. Add chain vertices with indices >= gridVertexCount (the pre-v19.0 approach)
3. **Fix the bridge triangle problem**: The "topologically broken bridge triangles" (v18.0 comment) were caused by chain vertices connecting directly to distant grid vertices with no intermediate vertices. The solution is Phase 2.

### Phase 2: Mandatory Transition Vertices Around Chain Edges

**Goal**: Every chain edge has at least 2 rings of transition vertices radiating outward, ensuring no triangle directly connects a chain vertex to a distant grid vertex.

This is already implemented as `insertGradedTransitionVertices` in OuterWallTessellator. The problem is it doesn't work in localOnly mode because UV-snapped "chain vertices" have grid indices. With actual chain vertices (Phase 1), this function will work correctly.

**Verification**: The R2 check (`scanR2Violations`) will correctly identify any triangle connecting a feature vertex (idx >= gridVertexCount) to a grid boundary vertex (idx < gridVertexCount) without intermediate transition vertices.

### Phase 3: Adaptive Prominence Threshold

**Goal**: Replace the absolute `minProminence = 0.005mm` with a radius-relative threshold.

```
minProminence(row) = max(0.001, 0.0003 * meanRadius(row))
```

Where `meanRadius(row)` is the mean cylindrical radius across the row. This makes the threshold proportional to the local surface scale, catching features consistently regardless of whether they're at a narrow top or wide base.

This requires:
- Computing `meanRadius` per row during `detectAllRowFeatures`
- Passing the per-row prominence threshold to `detectRowFeaturesV16`

### Phase 4: Deprecate Column Detection Entirely

**Goal**: Remove all T-direction feature detection code.

**Rationale**:
- On a surface of revolution, style features are circumferential (U-direction). T-direction features are the taper itself, which is not a "feature" — it's the fundamental shape.
- Three rounds of fixes (v16.1, v16.6, v17.1) have failed to make column detection reliable.
- The 80/20 rule: row detection captures >95% of style features. Column detection adds massive complexity for marginal gain.
- If T-direction features are ever needed (e.g., horizontal bands in a future style), they should be specified declaratively in the style definition, not auto-detected from the geometry.

**What to remove**:
- `detectColumnFeaturesV16`, `detectColumnFeatures`, `detectAndMergeColumnFeatures` (legacy)
- `detectTDirectionFeatures`, `computeTaperProfile`, `filterByColumnConsensus`, `crossValidateAndMergeColumnFeatures` (v17.1)
- `TDirectionFeature` type
- Column probing GPU dispatch in PEC (lines 801-860)
- `localOnlyMode` flag and all its conditional branches — the pipeline should have ONE path, not two

### Phase 5: Remove the localOnly/non-localOnly Split

**Goal**: One pipeline path that always works.

The `localOnlyMode` flag was added as a workaround when column detection broke things. With column detection removed (Phase 4) and chain vertices fixed (Phase 1), the flag's purpose disappears.

Unify the pipeline:
- Always insert chain vertices (Phase 1)
- Always add transition vertices (Phase 2)
- Always build union feature grid from row features (`buildUnionFeatureGrid`)
- Always allow chain-guided row insertion (with a sensible budget cap)
- Remove all `cfgLocalOnly` conditional branches

### Phase 6: Chain Linking Improvements

**Goal**: Reduce chain gaps without increasing false connections.

1. **Adaptive link radius**: Instead of fixed `CHAIN_LINK_RADIUS = 0.04`, compute per-row:
   ```
   linkRadius(row) = min(0.04, 2 * avgFeatureSpacing(row))
   ```
   Where `avgFeatureSpacing` is the mean U-distance between adjacent features in that row. For dense fluting (many features), use a tighter radius. For sparse ridges, use a wider one.

2. **Bidirectional linking**: Currently links row-by-row from bottom to top. Add a second pass from top to bottom to catch features that are easier to track in reverse.

3. **Chain quality scoring**: After linking, score each chain by (a) continuity (fraction of rows with points), (b) smoothness (low second-derivative of U path), (c) prominence consistency. Reject low-scoring chains (likely false connections) before passing to tessellation.

---

## Part 6: Implementation Priority

| Priority | Phase | Impact | Effort |
|----------|-------|--------|--------|
| **P0** | Phase 1: Re-introduce chain vertices | Fixes "no density near chains" and "stretched triangles" | Medium — revert v19.0 UV-snap approach |
| **P0** | Phase 2: Mandatory transition vertices | Fixes "bridge triangle" topology that caused v19.0 | Low — already implemented, just needs Phase 1 |
| **P1** | Phase 5: Remove localOnly split | Eliminates the two-path confusion | Medium — merge code paths |
| **P1** | Phase 3: Adaptive prominence | Fixes chain gaps from absolute threshold | Low — one function change |
| **P2** | Phase 4: Deprecate column detection | Removes dead complexity | Medium — lots of code to remove |
| **P3** | Phase 6: Chain linking improvements | Reduces remaining chain gaps | Medium |

---

## Part 7: Risks and Constraints

1. **Reverting to chain vertices (Phase 1) MUST include Phase 2** (transition vertices). The v18.0 failure happened because chain vertices were added WITHOUT transition density. These are inseparable.

2. **Do NOT re-add CDF-adaptive spacing** (removed v16.10 — caused density bands).

3. **Do NOT re-add cdt2d to the hot path** (removed v11.1 — O(n²), 12+ minutes at scale). CDT is fine for chain strips (small local regions) but not for the full grid.

4. **Do NOT revert `CHAIN_LOCK_BAND_HALF_WIDTH` to 0** (causes diagonal crease bug).

5. **Triangle budget**: Chain vertices + transition vertices increase vertex count. The budget cap in `buildCDTOuterWall` / `insertGradedTransitionVertices` (maxVertices: 50,000) should handle this, but monitor the outer wall triangle count vs budget.

6. **Performance**: Removing column detection (Phase 4) saves ~5-10ms per export. Adding chain vertices + transition vertices (Phases 1-2) adds ~2-5ms. Net neutral or faster.

---

## Part 8: Files Affected

| File | Phase | Change |
|------|-------|--------|
| `parametric/OuterWallTessellator.ts` | 1, 2 | Revert UV-snap to chain-vertex insertion; ensure transition vertices work |
| `parametric/FeatureDetection.ts` | 3, 4 | Adaptive prominence; remove column detection functions |
| `parametric/types.ts` | 4 | Remove `TDirectionFeature`, `COL_PROBE_*` constants |
| `ParametricExportComputer.ts` | 1, 4, 5 | Remove column probe dispatch, remove localOnly branches, add chain vertices to vertex buffer |
| `parametric/ChainLinker.ts` | 6 | Adaptive link radius, bidirectional pass |
| `parametric/GridBuilder.ts` | 5 | Always build union grid (remove localOnly gate) |
| `parametric/ChainStripOptimizer.ts` | 1 | Chain-strip detection uses vertex index (idx >= gridVertexCount) directly |
| `parametric/MeshSubdivision.ts` | 1 | Same: use vertex index for chain-strip detection |
| `ui/controls/ExportDialog.tsx` | 5 | Remove localOnlyMode toggle |
| `parametric/FeatureDetection.test.ts` | 3, 4 | Update tests for adaptive prominence, remove column detection tests |

---

## Appendix A: Glossary

- **PEC**: `ParametricExportComputer.ts` — the 1875-line orchestrator
- **FD**: `FeatureDetection.ts` — detection functions
- **OWT**: `OuterWallTessellator.ts` — grid + chain → triangulated mesh
- **CST**: `ChainStripTriangulator.ts` — CDT/sweep triangulation of chain-occupied row bands
- **CSO**: `ChainStripOptimizer.ts` — 3D edge flip optimization for chain strips
- **UV-snapping**: v20.0 approach where grid vertices are moved to match chain U positions
- **Chain vertex**: Dedicated mesh vertex at a feature chain point (index >= gridVertexCount)
- **Transition vertex**: Extra vertex inserted between chain edges and grid boundary (concentric rings)
- **Bridge triangle**: Triangle connecting a chain vertex directly to a distant grid vertex (the topology bug that caused v19.0 to remove chain vertices)
- **R2 guarantee**: Every triangle between a feature vertex and the grid boundary has at least 2 intermediate ring layers

## Appendix B: Version History of the Feature Detection System

| Version | Change | Outcome |
|---------|--------|---------|
| v7.0 | Feature edge detection via curvature peaks | Worked for U-direction |
| v10.x | Chain linking with momentum, kind separation | Major improvement |
| v11.1 | Removed cdt2d from hot path | Fixed 12-minute exports |
| v16.0 | Verified per-row detection (detectRowFeaturesV16) | Reliable U-features |
| v16.1 | Column detection snap-to-row fix | Reduced but didn't eliminate horizontal lines |
| v16.6 | `LOCAL_ONLY_OUTER_ADAPTATION = true` | Disabled column detection entirely |
| v16.10 | CDF-adaptive spacing removed | Fixed density band artifacts |
| v17.0 | Corridor columns (features in grid) | Doubled grid size, removed in v20.0 |
| v17.1 | Taper subtraction + consensus filter + kind-aware cross-validation | Correctly wired but column detection still noisy |
| v18.0 | GPU-surface subdivision | Failed: dihedral stayed at 0.04 |
| v19.0 | Chain vertices removed | Features imprecise (±0.5 grid cell) |
| v20.0 | UV-snapping (grid vertices moved to chain U) | Current approach: simple but no transition density |
