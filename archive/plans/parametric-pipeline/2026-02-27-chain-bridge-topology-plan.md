# Feature Chain Bridge Topology — Improvement Plan

**Date:** 2026-02-27
**Goal:** Achieve state-of-the-art mesh topology at chain-grid boundaries — "fingerprint on a knife's edge" fidelity. Perfect feature edge preservation with high-quality bridging triangles that maintain smooth geometry continuity.
**Depends on:** `2026-02-27-chain-bridge-topology-review.md`

---

## Design Principles

1. **Chain edges are first-class mesh edges** — not constraints forced into a pre-existing triangulation
2. **Quality is measured in 3D** — UV-space metrics mislead on curved surfaces
3. **Vertex insertion beats edge flipping** — you can't fix bad topology without adding geometry
4. **Anisotropic awareness** — the surface metric tensor defines "well-shaped," not Euclidean distance
5. **Budget-conscious** — every vertex added must earn its place; no unlimited refinement

---

## Phase 1: Fix Detection Gaps (Bug Fixes)

**Effort:** Small — straightforward code changes, no new algorithms.

### 1.1 Unify chain-strip detection across all modules

**File:** `ChainStripOptimizer.ts`
**Change:** Import `identifyChainAdjacentVertices()` from `MeshSubdivision.ts` and use it to augment the index-based chain-strip triangle detection.

```
Current:  if (a >= outerGridVertexCount || b >= ... || c >= ...)
Proposed: if (above || chainAdjacentVerts.has(a) || .has(b) || .has(c))
```

This ensures Phase A/B/C optimization covers UV-snapped triangles. The hybrid UV-proximity detection already exists and is battle-tested in `MeshSubdivision.ts`.

### 1.2 Fix FeatureEdgeGraph to use actual chain vertex indices

**File:** `FeatureEdgeGraph.ts`, `ParametricExportComputer.ts`
**Change:** After `buildCDTOuterWall()` returns `OuterWallResult.chainEdges`, pass these directly to `buildFeatureEdgeGraph()` instead of re-computing from grid column snapping. The chain edges array contains the actual vertex indices used in the mesh.

### 1.3 Fix UV-snap collision detection

**File:** `OuterWallTessellator.ts`
**Change:** In the UV-snap loop (lines 515–527), maintain a `Map<string, ChainVertex>` keyed by `"row:col"`. When a collision is detected (two chain vertices snapping to the same grid cell), keep the one with higher chain prominence/confidence and offset the other to the next-nearest column.

### 1.4 Relax row-span guard

**File:** `ChainStripOptimizer.ts`
**Change:** Increase `maxSingleRowTSpan * 2.0` to `* 2.5` at line 435. This unblocks legitimate cross-band flips for chain vertices in 2-row bands.

**Tests:** Run existing `ChainStripOptimizer.test.ts` + `OuterWallTessellator.test.ts`. Add test for UV-snap collision case.

---

## Phase 2: Replace Monotone Sweep with Constrained Delaunay Triangulation

**Effort:** Medium — new algorithm replacing `constraintAwareTriangulate()`, but well-defined scope.

### 2.1 Implement strip-local CDT

**File:** New function in `OuterWallTessellator.ts` replacing `constraintAwareTriangulate()`
**Algorithm:**

The chain strip is a simple polygon: bottom row vertices → right boundary → top row vertices (reversed) → left boundary. Chain edges are interior constraints.

1. **Triangulate the strip polygon** using ear-clipping or monotone decomposition (the strip is already Y-monotone since bottom/top rows are sorted by U)
2. **Insert constraint edges** using the standard CDT edge-forcing procedure: for each constraint edge (a,b), find all triangles whose edges cross (a,b), remove them, re-triangulate both sides with (a,b) as a shared edge
3. **Restore Delaunay property** using Lawson's flip algorithm: for every non-constrained edge, check the circumcircle criterion and flip if violated. Iterate until no more flips.

This guarantees:
- All chain edges are mesh edges (constraint enforcement)
- All non-chain edges maximize the minimum angle (Delaunay property)
- O(n log n) complexity for n strip vertices

**Key insight:** We don't need a general-purpose CDT library. The strip domain is always a simple horizontal band with two monotone boundaries. A purpose-built CDT for this shape is simpler and faster than a general solution.

### 2.2 Use 3D-weighted Delaunay criterion

Standard Delaunay maximizes minimum angle in 2D (UV space). On a curved surface, this is wrong — a triangle that looks equilateral in UV may be highly distorted in 3D.

**Enhancement:** Use the surface metric tensor from `SurfaceMetric.ts` to compute the circumcircle in the intrinsic geometry. `computeFirstFundamentalForm(u, t)` returns the metric coefficients (E, F, G). The Delaunay flip criterion becomes:

```
For edge (a,b) shared by triangles (a,b,c) and (a,b,d):
  Flip if d lies inside the circumcircle of (a,b,c) measured in the metric at the edge midpoint.
```

This is the **intrinsic Delaunay triangulation** (Bobenko & Springborn, 2007). It produces triangles that are well-shaped in 3D, not just in UV.

**Fallback:** If metric evaluation is too expensive per-flip, pre-compute a metric tensor at each strip vertex and use bilinear interpolation within each triangle. This is still far better than ignoring the metric entirely.

### 2.3 Quality verification

After CDT, compute and log:
- Minimum angle (target: > 20° in 3D-metric space)
- Maximum aspect ratio (target: < 5:1 in 3D)
- Chain edge enforcement rate (target: 100%)

**Tests:** New test cases for CDT on synthetic strips with known optimal triangulations. Regression tests comparing triangle count and quality metrics vs. current sweep.

---

## Phase 3: Steiner Point Insertion for Fan Topology Fix

**Effort:** Medium — requires vertex insertion with GPU re-evaluation.

### 3.1 Identify deficient fan vertices

After the CDT in Phase 2 produces the initial chain-strip triangulation, scan all chain vertices for fan topology:

```
For each chain vertex v:
  Let N = number of triangles incident on v
  Let angles[] = sorted angles of each incident triangle at v
  If min(angles) < 15° or max(angles) > 120°:
    Mark v as needing Steiner point insertion
```

### 3.2 Insert circumcentric Steiner points (Ruppert's algorithm, constrained)

For each marked fan triangle (the one with the worst angle at the chain vertex):

1. Compute the triangle's circumcenter in UV space (adjusted by the local metric tensor for 3D quality)
2. If the circumcenter falls inside the strip domain and is not too close to an existing vertex (> 0.3× local edge length):
   - Insert a new vertex at the circumcenter
   - Re-triangulate the cavity using the Bowyer-Watson insertion procedure
   - Restore constraint edges
3. If the circumcenter falls outside the strip or too close to a vertex:
   - Insert at the midpoint of the longest edge of the triangle instead (Chew's fallback)

**Budget control:** Cap total Steiner points at `0.1 × chainStripTriangleCount`. This prevents runaway refinement while fixing the worst fans.

### 3.3 GPU batch evaluation

Collect all new Steiner point UV coordinates into a single buffer and evaluate in one GPU dispatch (using the existing `evaluate_vertices` kernel). This avoids per-vertex GPU round-trips.

### 3.4 Update adjacency structures

After Steiner insertion:
- Update `chainEdges` (new edges from split triangles)
- Update `chainStripTriSet` (new triangle indices)
- Re-run Phase A/B/C of `ChainStripOptimizer` on the modified strip

**Tests:** Test that Steiner insertion reduces max aspect ratio below 5:1 on synthetic fan cases. Test that chain edges remain enforced after insertion.

---

## Phase 4: Local Grid Densification Around Chains

**Effort:** Medium — changes the grid construction, not just post-processing.

### 4.1 Add transition columns around chain vertices

**File:** `GridBuilder.ts` or new `ChainGridAdapter.ts`

Currently the grid has uniform U columns. When a chain vertex falls between columns `c` and `c+1`, it creates long edges reaching to both columns. Fix: insert additional U columns at `(chain.u + c.u) / 2` and `(chain.u + (c+1).u) / 2` — bisecting the gap on each side.

**Budget management:** Only insert transition columns for chain vertices that would otherwise create aspect ratio > 3:1 (estimated from grid spacing and row spacing). Cap at `2 × numChainVertices` extra columns, distributed proportionally across the most problematic chains.

### 4.2 Graduated density falloff

Don't just add one column on each side — add a graduated set that transitions from chain density to background grid density over 3–4 cells. This creates a smooth density gradient instead of an abrupt transition from "chain resolution" to "grid resolution."

The grading ratio should be ≤ 1.5:1 between adjacent cell widths (standard meshing quality requirement).

### 4.3 Re-run chain vertex allocation with denser grid

With the densified grid, chain vertices have shorter edges to adjacent grid columns. The CDT from Phase 2 produces better triangles with less need for Steiner points from Phase 3. The phases are complementary: Phase 4 reduces the problem, Phases 2–3 fix what remains.

**Tests:** Verify that the densified grid stays within the user's triangle budget (the extra columns should be offset by removing uniform columns elsewhere). Quality metric regression tests.

---

## Phase 5: Iterative Isotropic Remeshing of Chain Strips

**Effort:** Large — new module implementing a classic remeshing loop.

### 5.1 Implement Botsch-Kobbelt remeshing for chain strips

**File:** New `ChainStripRemesher.ts`
**Algorithm:** (Botsch & Kobbelt, "A Remeshing Approach to Multiresolution Modeling," 2004)

Iterate 3–5 times:
1. **Split** edges longer than `(4/3) × L_target` — insert midpoint vertex (GPU-evaluated)
2. **Collapse** edges shorter than `(4/5) × L_target` — merge vertices (respecting chain edge protection)
3. **Flip** non-chain edges to improve valence toward 6
4. **Smooth** vertices tangentially (project onto surface via the metric tensor; keep chain vertices locked to their chain position)

`L_target` is computed from the local metric tensor: the target edge length in UV space that produces `L_target_3D` in 3D. This ensures isotropic sizing in the intrinsic geometry.

### 5.2 Chain edge protection

During collapse and flip:
- **Never collapse** a chain edge (both endpoints are chain vertices)
- **Never flip** a chain edge
- **Allow collapse** of a non-chain edge incident on a chain vertex if the resulting vertex position is still on the chain (within snap tolerance)
- **Allow flip** of non-chain edges freely

### 5.3 Boundary stitching

The remeshed chain strip must reconnect to the surrounding regular grid at the strip boundary. Lock boundary vertices (those shared with the regular grid) during smoothing and collapse. This maintains a watertight connection.

### 5.4 Multi-pass subdivision fix

As part of this phase, fix `MeshSubdivision.ts:subdivideLongEdges()` to run 2–3 passes instead of 1. Each pass re-evaluates candidates from the previous pass's modifications. Batch GPU evaluations per pass.

**Tests:** Test that 5 iterations of remeshing on a synthetic chain strip reduce valence variance below 0.5. Test that chain edges remain intact. Test that boundary vertices don't move. Quality metric regression.

---

## Phase 6: Seam and Boundary Polish

**Effort:** Small — targeted fixes to edge cases.

### 6.1 Fix `healSeam()` to use surface evaluation

**File:** `SeamTopology.ts`
**Change:** Pass the `evaluatePoints` callback to `healSeam()`. For each seam pair, evaluate the surface at U=0 (the canonical seam position) at the vertex's T coordinate, and set both vertices to that exact 3D position. This keeps vertices on-surface instead of averaging to an off-surface midpoint.

### 6.2 Multi-row gap micro-row insertion

**File:** `OuterWallTessellator.ts`
**Change:** Remove the `Math.abs(r1 - r0) !== 1` guard in `insertMicroRowsForSteepCrossings()`. For multi-row gaps, insert micro-rows at each intermediate row boundary, not just the first.

### 6.3 Chain interpolation using GPU-probed positions

**File:** `OuterWallTessellator.ts`
**Change:** Instead of linearly interpolating chain vertex U positions for multi-row gaps (lines 452–474), use the GPU per-row probe results (`allRowTypedFeatures`) to look up the actual detected peak position at that intermediate row. If no peak was detected at that row (the chain was missed), then fall back to linear interpolation.

---

## Phase Ordering and Dependencies

```
Phase 1 (Bug Fixes)          ← No dependencies, do first
    │
Phase 2 (Strip CDT)          ← Independent of Phase 1 but benefits from fixes
    │
Phase 3 (Steiner Points)     ← Requires Phase 2 CDT for circumcenter computation
    │
Phase 4 (Grid Densification) ← Independent of Phase 2–3, can be parallel
    │
Phase 5 (Isotropic Remeshing) ← Requires Phase 2 CDT; Phase 3–4 reduce its workload
    │
Phase 6 (Seam Polish)        ← Independent, can be done anytime
```

**Recommended execution order:** 1 → 2 → 4 → 3 → 5 → 6

Phase 4 (grid densification) before Phase 3 (Steiner points) because denser grids reduce the number of Steiner points needed, making Phase 3 cheaper and more predictable.

---

## State-of-the-Art References

| Technique | Reference | Where it applies |
|---|---|---|
| Constrained Delaunay Triangulation | Shewchuk (1996), "Triangle: Engineering a 2D Quality Mesh Generator" | Phase 2 — strip CDT |
| Intrinsic Delaunay on surfaces | Bobenko & Springborn (2007), "A Discrete Laplace-Beltrami Operator for Simplicial Surfaces" | Phase 2.2 — metric-weighted flips |
| Ruppert's refinement | Ruppert (1995), "A Delaunay Refinement Algorithm for Quality 2D Mesh Generation" | Phase 3 — Steiner point insertion |
| Chew's second algorithm | Chew (1993), "Guaranteed-Quality Mesh Generation for Curved Surfaces" | Phase 3 — fallback midpoint insertion |
| Isotropic remeshing | Botsch & Kobbelt (2004), "A Remeshing Approach to Multiresolution Modeling" | Phase 5 — split/collapse/flip/smooth loop |
| Anisotropic meshing | Frey & George (2000), "Mesh Generation: Application to Finite Elements" | Phase 2.2, 5.1 — metric tensor usage |
| Graded meshing | Shewchuk (2002), "Delaunay Refinement Algorithms for Triangular Mesh Generation" | Phase 4 — graduated density falloff |

---

## Success Criteria

| Metric | Current | Phase 1–2 Target | Phase 3–5 Target | Final Target |
|---|---|---|---|---|
| Min angle in chain strip | ~5° | > 15° | > 20° | > 25° |
| Max aspect ratio | > 20:1 | < 8:1 | < 5:1 | < 3:1 |
| Valence < 5 vertices | 53% | 40% | 20% | < 10% |
| Chain edge enforcement | ~95% | 100% | 100% | 100% |
| Chain-strip detection | ~70% | 100% | 100% | 100% |
| Visual smoothness at chain | Visible crease/zigzag | Reduced | Smooth | Blade-edge continuous |

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| CDT adds compute cost to export | Strip CDT is O(n log n) for ~100 vertices per strip; negligible vs. GPU passes |
| Steiner points blow triangle budget | Hard cap at 10% of chain-strip triangle count |
| Grid densification increases total vertices | Offset by removing uniform columns elsewhere; maintain user's triangle budget |
| Remeshing loop doesn't converge | Cap at 5 iterations; convergence guaranteed by Botsch-Kobbelt theory for L_target > 0 |
| Metric tensor evaluation is expensive | Pre-compute at grid vertices, interpolate within triangles; ~1ms for 10K vertices |
| Breaking existing tests | All phases are additive (new code paths); existing tests run on the old path until switched |
