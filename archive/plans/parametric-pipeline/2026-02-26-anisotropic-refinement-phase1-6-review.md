# Code Review: Anisotropic Adaptive Refinement Pipeline (Phases 1-6)

**Date:** 2026-02-26
**Branch:** `refactor/core-migration`
**Scope:** `AdaptiveRefinement.ts`, `EdgeCollapser.ts`, `SurfaceMetric.ts`, `GPUErrorEstimator.ts`, `QualityProfiles.ts`, `contracts.ts`, `error_estimation.wgsl`

## Overall Assessment

The pipeline has the skeleton of a good adaptive refinement system, but it is not yet delivering "refinement" in any meaningful sense. The core problem is that the system currently operates as a **greedy edge-split loop with a post-hoc collapse pass**, rather than as a proper error-driven adaptive meshing algorithm. Several critical algorithmic gaps prevent it from achieving state-of-the-art mesh quality. The cleanup passes (edge flip, vertex smoothing) were correctly re-enabled after Phase 6 bugfixes, but they operate in too narrow a scope to fix the structural quality issues.

**Verdict:** Functional but far below state-of-the-art. Needs fundamental algorithmic improvements to error estimation, split strategy, convergence control, and quality optimization.

---

## Architectural Issues (Systemic)

### A1: Error estimation drives splitting, but the error estimator is unreliable

The CPU error estimator (`estimateErrorsCPU`) uses a **dihedral-angle proxy** for both position and normal error. This is fundamentally wrong for two reasons:

1. **Position error** (chord error) requires comparing the linear edge midpoint against the true analytic surface. The CPU path estimates this as `L * theta / 8` where `theta` is the dihedral angle to neighboring triangles. This is a *local curvature proxy*, not an actual chord error measurement. For a flat mesh with no neighbors (boundary edges), dihedral = 0, so error = 0 — even if the mesh completely misses a curved surface feature.

2. **Normal error** is reported as the dihedral angle to neighbors, not the angle between the flat triangle normal and the analytic surface normal. A mesh could perfectly approximate a smooth sphere but report high "normal error" simply because adjacent triangles have different orientations (which they must, on a sphere).

The GPU path (`estimateErrorsGPU`) is correct — it measures true chord error and finite-difference surface normals — but it requires the GPU evaluator callback, which is only available in the production path, not in tests or CPU-only mode.

**Impact:** The CPU error estimator gives wrong signals to the split selector, causing splits in the wrong places and failing to split where actually needed. All tests that verify "refinement works" are testing against the wrong error metric.

### A2: Split strategy is pure greedy — no global awareness

The current split loop (`splitOverThresholdTriangles`) operates as:
1. Sort triangles by error score (descending)
2. For each, pick its longest edge
3. If the edge is shared by exactly 2 triangles and not a feature edge, split it
4. Skip if either triangle was already touched this iteration

This is a simple greedy heuristic with no awareness of:
- **Edge length relative to target**: An edge may have high error but already be shorter than the target edge length — splitting it further degrades triangle quality
- **Neighborhood quality**: Splitting one edge may create slivers in adjacent triangles (only the 4 replacement triangles are quality-checked, not their neighbors)
- **Budget efficiency**: The 10% cap per iteration is arbitrary and may be too aggressive in smooth regions or too conservative in high-error regions

### A3: No convergence guarantee — refinement can oscillate or stall

The convergence detection checks if `maxError` decreased by at least 5% from the previous iteration. But:
- The `no_improvement` check uses `maxPos >= prevMaxPos * 0.95 && maxNorm >= prevMaxNorm * 0.95` — this is an AND condition, meaning if either metric improves by 5.1%, refinement continues even if the other metric worsened
- The `diminishing_returns` check measures `improvement / prevSplitCount < tolerance * 0.01` — but this measures absolute improvement per split, not relative. On a large mesh with many small errors, each split contributes little absolute improvement but may still be worthwhile
- There is no check for **error redistribution**: splitting one triangle may increase error in neighbors (the split creates sharper angles that increase the dihedral-based error proxy)

### A4: Edge collapse and split don't share a unified budget strategy

The collapse pass (`collapseOverBudgetEdges`) only triggers when `currentTris > maxTriangles`. But the real goal is not "stay under budget" — it's "allocate triangles optimally." The system should be able to collapse in smooth regions *before* the budget is exhausted, freeing triangles for high-error regions. Currently, collapse only acts as a safety valve, not as an optimization step.

### A5: No second-order curvature information in the splitting criterion

The split decision is based on error magnitude only. State-of-the-art adaptive refinement uses **curvature-aware** splitting that considers the second fundamental form (principal curvatures κ₁, κ₂) to predict how much error a split will actually reduce. Without this, the system may split an edge where error is high but curvature is low (meaning the split won't help much), while ignoring edges where curvature is high but current error happens to be below threshold (meaning error will appear after neighboring topology changes).

---

## Critical Issues (Must Fix)

### C1: `smoothNewVertices` applies Laplacian smoothing to ALL vertices from `newVertexStart` — including those from prior iterations

**File:** `AdaptiveRefinement.ts:1445-1448`

```typescript
await smoothNewVertices(
    curPositions, curUVs, curIndices, curOuterIdxCount,
    prevVertCount, featureGraph, evaluateMidpoints, 1,
);
```

`prevVertCount` is `curPositions.length / 3 - splitResult.splitCount`, which is correct for the *current* iteration's new vertices. But `smoothNewVertices` smooths all vertices with index `>= newVertexStart`, and this correctly targets only this iteration's midpoints. However, after multiple iterations, the midpoints from iteration 0 become "old" vertices that adjacent iterations' smoothing may still want to move (since they're in the affected neighborhood). The current design doesn't re-smooth earlier midpoints, which means vertices inserted in iteration 0 remain fixed even as the topology around them changes.

**Impact:** After 3+ iterations, early midpoints may be suboptimal given the evolved topology. This is a medium-severity quality issue.

### C2: Edge collapse `checkNoInversion` uses the *original* positions for the `vKeep` vertex

**File:** `EdgeCollapser.ts:270-301`

The inversion check computes the normal of triangles after collapse, but the `vKeep` vertex position hasn't changed — only `vRemove`'s references are remapped. However, the function checks triangles incident on `vRemove` only. It does NOT check triangles incident on `vKeep` that reference `vRemove` via a different path. If a triangle `(vKeep, X, vRemove)` becomes degenerate `(vKeep, X, vKeep)`, it's correctly filtered as degenerate. But if there are indirect effects through shared neighbors, those aren't checked.

More critically: after multiple collapses, `vtMap` becomes stale because it's built once and only partially updated (line 546-557). The `keepTris.includes(t)` check (line 555) is O(n) per triangle — this is O(n²) in the worst case for a vertex with high valence.

### C3: Double heap construction in `collapseOverBudgetEdges`

**File:** `EdgeCollapser.ts:424-497`

The function builds the heap twice: first to collect all costs (lines 424-452), compute the median, then rebuilds the heap with proper priorities (lines 467-497). This doubles the O(E log E) work. Instead, all costs should be collected in a single pass, median computed, then a single heap built from the scored array.

### C4: Edge collapse generation counter logic is broken

**File:** `EdgeCollapser.ts:514-523`

```typescript
if (generation[v0] > 0 || generation[v1] > 0) {
    if (generation[vKeep] > 3 || generation[vRemove] > 3) continue;
    // re-score and re-push
}
```

The generation counter increments for `vKeep` (line 574), but the re-scoring uses `vKeep` and `vRemove` from the *stale* candidate. After a collapse, `vRemove` is in `removedVertices`, so the `removedVertices` check on line 512 should catch it — but the generation check on line 514 fires *before* the removal check would catch cases where `vKeep` was modified but `vRemove` is still valid. This means valid candidates may be re-scored unnecessarily. The `> 3` cutoff is arbitrary and can cause the collapse to stop prematurely.

### C5: `localEdgeFlip` only checks edges touching affected vertices

**File:** `AdaptiveRefinement.ts:983`

```typescript
if (!affectedVertices.has(eA) && !affectedVertices.has(eB)) continue;
```

This limits the flip scope to the 1-ring of new midpoints. But splits can create poor angles in the 2-ring, and edge collapses can create poor angles anywhere in the collapse neighborhood. The affected set should include the 2-ring of all modified vertices.

### C6: No triangle quality metric in the refinement loop

The refinement loop tracks `maxPosErrorMm` and `maxNormalErrorDeg` but never computes or reports triangle quality metrics (minimum angle, aspect ratio, edge length CV). These are defined in `ExportTolerances` (`minTriangleAngleDeg`, `maxAspectRatio`) but never checked as stop conditions. A mesh could pass position and normal tolerances while having terrible triangle quality.

---

## Important Issues (Should Fix)

### I1: `estimateErrorsGPU` UV midpoint doesn't handle seam wrapping

**File:** `AdaptiveRefinement.ts:573`

```typescript
uvBatch[i * 3] = (uvs[edge.v0 * 3] + uvs[edge.v1 * 3]) * 0.5;
```

For edges crossing the u=0/1 seam, this arithmetic mean produces a midpoint at u≈0.5 instead of u≈0.0 or u≈1.0. The GPU will evaluate the wrong surface point, producing garbage chord error measurements for seam-crossing edges.

**Fix:** Use circular mean (same approach as `smoothNewVertices`) for the U component.

### I2: `splitOverThresholdTriangles` doesn't handle seam-crossing edge UV midpoint

Same issue as I1 but in the split path — the new midpoint UV will be wrong for seam edges, placing the vertex on the opposite side of the pot.

### I3: QEM quadrics are not area-weighted

**File:** `EdgeCollapser.ts:107-144`

Each triangle contributes its plane quadric equally to its three vertices, regardless of triangle area. A tiny sliver triangle and a large triangle contribute equally. This biases the QEM toward many-small-triangle regions (which are usually the feature-rich areas that should NOT be collapsed).

**Fix:** Weight each quadric contribution by triangle area:
```typescript
const area = len * 0.5; // half the cross-product magnitude
for (const vi of [i0, i1, i2]) {
    const off = vi * 10;
    for (let j = 0; j < 10; j++) quadrics[off + j] += q[j] * area;
}
```

### I4: `collapseOverBudgetEdges` doesn't properly re-score edges after collapse

**File:** `EdgeCollapser.ts:578`

```typescript
// Re-score edges incident on vKeep would happen via the lazy deletion check
```

The comment admits this isn't properly implemented. After a collapse, edges incident on `vKeep` should be re-scored with the updated combined quadric and re-inserted into the heap. The current implementation relies on the generation counter to trigger re-scoring when stale candidates are popped, but this only works if those candidates are still in the heap — boundary edges that were never scored won't be re-scored.

### I5: `MinHeap` stores `CollapseCandidate` objects — high GC pressure

For a 200k triangle mesh with ~300k edges, the heap stores 300k objects with 6 fields each. This creates significant GC pressure. A more efficient approach would use parallel typed arrays (Float64Array for priorities, Uint32Array for vertex indices).

### I6: `computeMetricStats` allocates an `edgeLengths: number[]` array

**File:** `AdaptiveRefinement.ts:75-83`

For a 200k triangle mesh, this creates a 300k-element array every iteration. Since this is diagnostic-only, it should be opt-in or computed more efficiently (running statistics without full array).

### I7: `edgeCollapseEnabled` check uses wrong threshold

**File:** `AdaptiveRefinement.ts:1452`

```typescript
if (config.edgeCollapseEnabled && curIndices.length / 3 > maxTriangles) {
```

This only triggers collapse when *over* budget. The plan specified `> maxTriangles * 0.9` to proactively collapse in smooth regions before hitting the hard cap. The current implementation waits until the budget is fully exhausted, making collapse a reactive safety net instead of a proactive optimization.

### I8: No degenerate triangle check after edge flip

`localEdgeFlip` applies the flip by directly mutating `indices` but doesn't verify the resulting triangles are non-degenerate. If `opp0 === eA` or `opp1 === eB` (shouldn't happen normally but can with stale adjacency), the flip creates a degenerate triangle.

---

## Test Coverage Gaps

### T1: No tests with actual curved surface evaluation

All `adaptiveRefine` tests use either `linearEvaluator` (flat surface, zero error) or `curvedEvaluator` (sin surface). Neither tests the refinement loop with a realistic pot profile where features (ridges, valleys) exist. The curved evaluator doesn't produce surface normals, only positions, so normal error estimation is untested in the GPU path mock.

### T2: No tests for seam-edge behavior

No test creates a mesh spanning the u=0/1 seam boundary and verifies that:
- Error estimation handles wrapping correctly
- Edge splitting produces correct UV midpoints at the seam
- Edge flipping doesn't create cross-seam triangles
- Edge collapse respects seam vertex constraints

### T3: No multi-iteration refinement convergence test

No test runs refinement for 3+ iterations and verifies that error monotonically decreases. The existing tests either pass on first evaluation or stop after 1 iteration. Convergence behavior under repeated split/collapse/flip/smooth cycles is untested.

### T4: EdgeCollapser tests don't verify mesh quality after collapse

The `collapseOverBudgetEdges` test checks for degenerate triangles but doesn't verify:
- Minimum angle is above threshold
- Aspect ratio is within bounds
- Triangle count is close to target
- Feature vertices are truly preserved (positions unchanged, not just "not removed")

### T5: No stress test for collapse + split interaction

No test runs a split pass followed by a collapse pass and verifies the mesh remains manifold with no T-junctions, no inverted normals, and monotonically improving quality metrics.

### T6: `localEdgeFlip` multi-pass convergence untested

The multi-pass fix rebuilds adjacency each pass, but no test verifies that:
- Multiple passes actually converge (flip count reaches 0)
- The mesh quality improves monotonically across passes
- No degenerate triangles are created during multi-pass flipping

---

## Quality Profile Issues

### Q1: Tolerance values are not grounded in real-world metrics

The tolerance values (e.g., ultra: `epsPosMm = 0.03`, `epsNormalDeg = 3.0`) are reasonable for 3D printing but not validated against actual FDM/SLA layer heights. For FDM at 0.2mm layer height, position accuracy of 0.03mm is meaningless — the printer can't resolve it. The profiles should be documented with their target printer technology and resolution.

### Q2: `maxRefineIterations` caps are low for tight tolerances

Ultra profile allows 6 iterations with `epsPosMm = 0.03`. On a complex pot (ID 19 with deep ridges), achieving 0.03mm chord error may require 10+ iterations of progressive subdivision. The cap of 6 is likely too low, causing refinement to stop at `max_iterations` rather than `tolerances_passed`.

### Q3: Draft profile has `maxRefineIterations = 0`

Draft export skips refinement entirely. This means draft exports use only the initial grid tessellation with no error-driven adaptation. For styles with thin features, draft exports may completely miss ridges/valleys. Even 1 iteration of refinement would catch the worst violations.

---

## Performance Concerns

### P1: `estimateErrorsGPU` creates a new Float32Array for FD normal points every call

**File:** `AdaptiveRefinement.ts:563`

```typescript
const uvBatch = new Float32Array(edgeBatchSize + normalBatchSize);
```

For a 200k triangle mesh, this is `200k * 3 + 200k * 3 * 3 = 2.4M floats = ~9.6MB` allocated and GC'd every iteration. For 6 iterations, that's ~57MB of throwaway allocations.

### P2: `GPUErrorEstimator` creates and destroys all buffers per call

The plan (S1 in the previous review) noted this and it remains unfixed. For 6 iterations, this creates and destroys 6 × 6 = 36 GPU buffers. Buffer creation involves CPU↔GPU synchronization overhead.

### P3: Sorting all errors every iteration is O(n log n)

`sortedErrors = [...errors].sort(...)` copies and sorts the entire error array. For 200k triangles over 6 iterations, that's 1.2M sort operations. Since only the top 10% are used, a partial sort (quickselect) would be O(n).

---

## What Was Done Well

1. **Prereq A fix (localEdgeFlip multi-pass)** is correctly implemented — rebuilding adjacency each pass eliminates the stale-reference bug
2. **Prereq B fix (circular mean for U)** in `smoothNewVertices` is mathematically correct and handles the seam wrapping properly
3. **EdgeCollapser QEM math** is correct — the quadric initialization, cost evaluation, and half-edge collapse decision are textbook implementations
4. **Feature edge/vertex protection** in collapse is comprehensive — both the edge itself and vertices on feature edges are locked
5. **Link condition check** is correct and handles both interior (2 shared) and boundary (1 shared) edges
6. **Inversion prevention** check is correct in principle, though it has the stale vtMap issue noted in C2
7. **Mesh compaction** is clean — proper old→new mapping, degenerate filtering, and contiguous array output
8. **SurfaceMetric module** is mathematically rigorous — Jacobian computation, first fundamental form, eigendecomposition, and metric-aware edge lengths are all correct

---

## Summary of Issue Severity

| Category | Count | Most Critical |
|----------|-------|--------------|
| Architectural | 5 | A1 (unreliable error estimator), A2 (greedy-only strategy) |
| Critical | 6 | C1 (re-smoothing gap), C2 (stale vtMap), C6 (no quality check) |
| Important | 8 | I1/I2 (seam UV), I3 (QEM not area-weighted), I7 (wrong collapse threshold) |
| Test gaps | 6 | T1 (no curved surface test), T2 (no seam test), T3 (no convergence test) |
| Quality profiles | 3 | Q2 (iteration cap too low), Q3 (draft skips refinement) |
| Performance | 3 | P1/P2 (buffer churn), P3 (full sort) |

**Total: 31 issues across 6 categories.**
