# Feature Chain Bridge Topology — Code Review

**Date:** 2026-02-27
**Scope:** How feature chains (ridges/valleys) are linked into the parametric mesh grid, and why the bridging triangles are poor quality.
**Branch:** `refactor/core-migration`

---

## Executive Summary

The parametric export pipeline detects feature edges (style ridges, peaks, valleys) as continuous polylines in UV space, then stitches them into a regular grid mesh. The stitching produces **structurally poor bridging triangles** — long, thin, and cross-row — that break the otherwise smooth geometry. This is not a tuning problem; it is an architectural limitation of the current tessellation strategy.

The root cause: chain vertices are injected as extra points into a monotone sweep triangulation that has no quality criterion. The sweep advances by U-position only, producing whatever triangle the next vertex happens to form, regardless of aspect ratio, angle, or 3D shape. Post-hoc optimization (3 phases of edge flipping + subdivision) partially compensates but cannot fix structurally bad initial connectivity.

---

## Pipeline Stage Trace

### 1. Chain Detection (GPU + CPU)

| Stage | File | What happens |
|---|---|---|
| Curvature sampling | `ParametricExportComputer.ts` (GPU) | 16 strips × 4096 samples → gradient + curvature profiles |
| Feature detection | `FeatureDetection.ts` | Gradient zero-crossings → peak/valley classification |
| Per-row probing | `ParametricExportComputer.ts` (GPU) | 8192 probes/row, 5-point stencil + GSS sub-sample |
| Chain linking | `ChainLinker.ts` | Greedy-with-momentum linker, kind-separated (peaks vs valleys) |

**Chain linking quality:** Good. Two-pass with momentum, duplicate suppression, resnap to measured peaks within `RESNAP_RADIUS = 0.005`. The chains themselves are accurate polylines.

### 2. Grid Preparation (CPU)

| Stage | File | What happens |
|---|---|---|
| Base grid | `GridBuilder.ts` | Uniform numU × numT sized to triangle budget |
| Row insertion | `ChainLinker.ts` | Extra T-rows at chain segments with steep U-shift |
| Micro-row insertion | `OuterWallTessellator.ts` | Extra rows at sawtooth crossings (> 1 column jump per row) |

**Issue:** Micro-row insertion only handles single-row bands (`|r1 - r0| !== 1`). Multi-row gaps from `insertChainGuidedRows()` are silently ignored.

### 3. Chain-Grid Tessellation (CPU) — THE CRITICAL STAGE

**File:** `OuterWallTessellator.ts` → `buildCDTOuterWall()`

#### Step 3a: Chain Vertex Allocation (lines 430–490)

Each `ChainPoint` with a valid final-row mapping gets a `ChainVertex` with index starting at `gridVertexCount`. Multi-row gaps are filled with linearly interpolated UV positions.

**Issue:** Linear UV interpolation doesn't follow the actual ridge — the peak U at an intermediate row may differ from the linear interpolant. GPU re-snap in Stage 7 corrects the 3D position but not the topological connectivity.

#### Step 3b: UV-Snapping (lines 515–527)

The nearest grid column to each chain vertex is snapped to the chain's exact U position:
```ts
vertices[(cv.rowIdx * numU + bestCol) * 3 + 0] = cv.u;
```

**Issue:** Multiple chain vertices from different chains can snap to the same grid column. Last-write-wins, no de-collision. Can produce incorrect triangle geometry.

#### Step 3c: Row Merging — `buildMergedRow()` (lines 572–604)

Bottom and top row vertices are merged into a sorted `StripVertex[]` array by U position. Chain vertices are interleaved between grid columns. Grid vertices coinciding with chain vertices (within 1e-6) are replaced.

**Issue:** Two chain vertices from different chains with similar U values both appear in the merged row, creating near-coincident vertices and near-degenerate triangles.

#### Step 3d: Strip Triangulation — `constraintAwareTriangulate()` (lines 225–323)

This is where the bridging triangles are born.

**Algorithm:** Alternating-advance monotone sweep:
1. Sort constraints (chain edges) by midU
2. Walk left-to-right, advancing whichever row pointer has the smaller next-U
3. Emit one triangle per advance step
4. At each constraint, enforce the chain edge by routing the sweep through it

**What this is NOT:**
- Not Delaunay — no circumcircle criterion
- Not quality-aware — no angle, aspect ratio, or edge-length check
- Not anisotropic — no consideration of UV→3D distortion

**What this produces:** When a chain vertex at U=0.35 is connected to grid vertices at U=0.3 and U=0.4, the sweep creates triangles that span the full T-band height for a small U-arc width. These are the long thin "blade" triangles that break smooth geometry.

### 4. Post-Tessellation Optimization (CPU)

| Pass | File | What it does | What it misses |
|---|---|---|---|
| Chain-directed flip | `MeshOptimizer.ts` | Flips grid quad diagonals to align with chain direction | Skips chain-strip cells entirely (`quadMap[idx] = -1`) |
| 3D Delaunay flip | `MeshOptimizer.ts` | Flips non-Delaunay edges in grid quads | Only operates on regular grid quads |
| Chain-strip Phase A | `ChainStripOptimizer.ts` | Flips edges to improve min angle in chain-strip tris | Misses UV-snapped tris (index-based detection only) |
| Chain-strip Phase B | `ChainStripOptimizer.ts` | Flips for valence improvement | Same detection gap |
| Chain-strip Phase C | `ChainStripOptimizer.ts` | Flips short diagonals | Same detection gap |
| Boundary diagonal | `ChainStripOptimizer.ts` | Minimizes dihedral angle at chain-boundary quads | Only works for 1-column-wide chain strips |

### 5. Subdivision + Refinement (CPU/GPU)

| Pass | File | What it does | Limitation |
|---|---|---|---|
| Long-edge split | `MeshSubdivision.ts` | Splits edges > threshold, GPU midpoints | Single-pass, ~50% candidates skipped |
| Adaptive refine | `AdaptiveRefinement.ts` | Error-driven split loop (chord + normal) | Chain edges not protected (FeatureEdgeGraph mismatch) |

---

## Bug Inventory

### BUG-1: Chain-strip detection misses UV-snapped triangles

**File:** `ChainStripOptimizer.ts:351–359`
**Severity:** High — entire optimization passes skip the worst triangles

After v20.0 UV-snapping, chain-influenced triangles can have all three vertices with grid indices (< `outerGridVertexCount`). The index-based detection `a >= outerGridVertexCount || b || c` misses them. `MeshSubdivision.ts` already has the fix: `identifyChainAdjacentVertices()` uses UV-proximity. This fix is not applied to `ChainStripOptimizer`.

### BUG-2: UV-snap collisions between different chains

**File:** `OuterWallTessellator.ts:515–527`
**Severity:** Medium — rare (requires two chains at similar U in same row), but produces incorrect geometry when it occurs.

### BUG-3: FeatureEdgeGraph doesn't cover actual chain vertex indices

**File:** `FeatureEdgeGraph.ts:167–264`
**Severity:** Medium — chain edges are unprotected from adaptive refinement splitting

`buildFeatureEdgeGraphFromGrid()` maps chain points to grid column indices. Actual chain vertices have indices >= `gridVertexCount`. The feature graph and the mesh vertex sets are disjoint for chain edges.

### BUG-4: `healSeam()` averages to off-surface midpoint

**File:** `SeamTopology.ts:700–709`
**Severity:** Low — error is proportional to the angular gap between seam pair vertices (typically < 1 grid column = small).

### BUG-5: Micro-row insertion ignores multi-row gaps

**File:** `OuterWallTessellator.ts:94–171` (guard: `Math.abs(r1 - r0) !== 1`)
**Severity:** Low — multi-row gaps are uncommon after `insertChainGuidedRows()`.

### BUG-6: Row-span guard too aggressive in ChainStripOptimizer

**File:** `ChainStripOptimizer.ts:428–438`
**Severity:** Medium — rejects beneficial flips for chain vertices in the middle of 2-row bands. Threshold `2.0×` should be `2.5×`.

---

## Structural Quality Issues

### STRUCT-1: Alternating-advance sweep has no quality criterion

The `sweepRegion()` function (lines 177–205) produces triangles based solely on U-ordering. It does not check:
- Minimum angle (should be > 20° for quality meshes)
- Aspect ratio (should be < 5:1 for printability)
- 3D shape (UV distortion makes U-ordered triangles poor in 3D)
- Edge length ratio (adjacent triangles should have similar edge lengths)

This is the **primary** cause of poor bridging triangles.

### STRUCT-2: Chain vertices have structurally low valence

Every chain vertex inserted between grid columns fans out to adjacent grid vertices, producing valence 4–5 instead of the ideal 6. CLAUDE.md acknowledges "53% of outer-wall vertices have valence < 5." This is structural — no amount of edge flipping can fix it without adding vertices.

### STRUCT-3: No local grid refinement around chain points

The grid is uniform except for chain-guided row insertion. No columns are added near chain vertices. The chain vertex sits inside a quad cell, forcing long edges to reach adjacent grid corners. Adding grid vertices at the cell's Steiner points would eliminate the fan topology.

### STRUCT-4: Three-phase optimization can't fix structurally bad connectivity

Edge flipping changes which diagonal of a quad is used but cannot add or remove vertices. When the initial triangulation produces a triangle with vertices at (chain, grid-left, grid-top) spanning 40° of arc, no flip of the surrounding quads can break that triangle into smaller pieces. Only vertex insertion can fix it.

---

## Metrics Summary

| Metric | Current State | Target |
|---|---|---|
| Min angle in chain-strip | ~5° (common) | > 20° |
| Max aspect ratio in chain-strip | > 20:1 (common) | < 5:1 |
| Valence < 5 vertices | 53% | < 15% |
| Chain edge enforcement | ~95% (missing edges logged) | 100% |
| Chain-strip detection coverage | ~70% (misses UV-snapped) | 100% |
