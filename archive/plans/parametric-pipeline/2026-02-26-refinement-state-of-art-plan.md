# Plan: State-of-the-Art Adaptive Refinement Pipeline

**Date:** 2026-02-26
**Addresses:** All 31 issues from the Phase 1-6 review
**Goal:** Transform the refinement pipeline from a greedy split/collapse loop into a proper error-driven adaptive meshing system with convergence guarantees

## Design Principles

1. **Error-driven, not heuristic-driven**: Every split/collapse/flip decision must be justified by measured error against the analytic surface
2. **Curvature-aware**: Use second fundamental form to predict error reduction before committing to topology changes
3. **Budget-optimal**: Coarsen smooth regions and refine high-curvature regions simultaneously, not sequentially
4. **Quality-constrained**: Triangle quality (min angle, aspect ratio) is a first-class constraint, not an afterthought
5. **Seam-safe**: All operations handle the u=0/1 wrapping boundary correctly

---

## Phase 7: Foundation Fixes (Prerequisites)

These fix the critical and important issues that undermine the existing system.

### Task 7.1: Seam-safe UV midpoints in error estimation and splitting

**Files:** `AdaptiveRefinement.ts`
**Issues:** I1, I2

Extract a `seamSafeMidpointU(u0, u1)` helper:

```typescript
function seamSafeMidpointU(u0: number, u1: number): number {
    // If the shorter arc crosses the seam, wrap
    const direct = (u0 + u1) * 0.5;
    const wrapped = ((u0 + 1) + u1) * 0.5;  // assume u0 < u1
    if (Math.abs(u1 - u0) > 0.5) {
        // Seam crossing: use wrapped midpoint
        let mid = u0 < u1 ? wrapped : ((u1 + 1) + u0) * 0.5;
        if (mid >= 1) mid -= 1;
        return mid;
    }
    return direct;
}
```

Apply in:
- `estimateErrorsGPU` line 573 (UV batch for edge midpoints)
- `splitOverThresholdTriangles` line 844 (UV batch for split midpoints)
- `estimateErrorsGPU` line 578 (UV batch for centroid computation)

**Tests:**
- Edge at u=0.98, u=0.02 → midpoint at u≈0.0 (not 0.5)
- Edge at u=0.1, u=0.3 → midpoint at u=0.2 (no wrapping needed)
- Split a seam-crossing edge → new vertex position is correct

### Task 7.2: Area-weighted QEM quadrics

**File:** `EdgeCollapser.ts`
**Issue:** I3

Multiply each quadric contribution by triangle area:

```typescript
const area = len * 0.5; // len is the cross-product magnitude, already computed
for (const vi of [i0, i1, i2]) {
    const off = vi * 10;
    for (let j = 0; j < 10; j++) quadrics[off + j] += q[j] * area;
}
```

**Tests:**
- One large and one tiny triangle sharing an edge → collapse cost dominated by large triangle's plane

### Task 7.3: Fix edge collapse — single heap build, proper re-scoring, correct threshold

**File:** `EdgeCollapser.ts`
**Issues:** C3, C4, I4, I7

Rewrite `collapseOverBudgetEdges`:
1. Single pass: collect all edges with costs into a flat array
2. Compute median from the flat array (no heap yet)
3. Compute priorities, build heap once
4. After each collapse: re-score all edges incident on `vKeep` by iterating its 1-ring, push new candidates to heap
5. Change threshold to `currentTris > targetTriangles * 0.9` (proactive collapse)
6. Remove the broken generation counter logic — use `removedVertices` set as the only staleness check

### Task 7.4: Fix stale vtMap in EdgeCollapser

**File:** `EdgeCollapser.ts`
**Issue:** C2

After each collapse, update `vtMap` properly:
- Remove `vRemove` from `vtMap` (already done)
- For each triangle that contained `vRemove`, update the entry for `vKeep` to include that triangle
- Remove degenerate triangles from all vtMap entries they appear in

Replace `keepTris.includes(t)` with a Set-based check to avoid O(n²).

### Task 7.5: Expand affected vertex set for edge flip

**File:** `AdaptiveRefinement.ts`
**Issue:** C5

After building the initial affected set (1-ring of new midpoints), expand it to the 2-ring:

```typescript
const expanded = new Set(affectedVertices);
for (let t = 0; t < curOuterIdxCount; t += 3) {
    const v0 = curIndices[t], v1 = curIndices[t + 1], v2 = curIndices[t + 2];
    if (affectedVertices.has(v0) || affectedVertices.has(v1) || affectedVertices.has(v2)) {
        expanded.add(v0); expanded.add(v1); expanded.add(v2);
    }
}
// Second ring
const ring2 = new Set(expanded);
for (let t = 0; t < curOuterIdxCount; t += 3) {
    const v0 = curIndices[t], v1 = curIndices[t + 1], v2 = curIndices[t + 2];
    if (expanded.has(v0) || expanded.has(v1) || expanded.has(v2)) {
        ring2.add(v0); ring2.add(v1); ring2.add(v2);
    }
}
```

---

## Phase 8: Proper Error Estimation

Replace the unreliable CPU heuristic with correct error measurement.

### Task 8.1: Analytic error estimation via surface evaluation

**File:** New function in `AdaptiveRefinement.ts`
**Issue:** A1

Create `estimateErrorsAnalytic()` that:
1. For each triangle, compute 3 edge midpoints in UV space (with seam-safe wrapping)
2. Evaluate all midpoints via the GPU evaluator in a single batch
3. Compute chord error as distance from linear 3D midpoint to evaluated surface point
4. Compute normal error as angle between flat normal and FD-estimated surface normal
5. For boundary edges (1 adjacent triangle), still compute chord error but skip dihedral-based normal estimate — use the FD normal instead

This replaces `estimateErrorsCPU` as the primary error path when a GPU evaluator is available. The CPU heuristic path becomes the fallback only when no evaluator exists (testing only).

### Task 8.2: Per-edge error (not per-triangle)

**Issue:** A2 (partial)

Currently, each triangle reports its single longest edge as the split candidate. But error should be measured per-edge, with each edge potentially being the split candidate from either adjacent triangle. Refactor error storage:

```typescript
interface EdgeError {
    v0: number;
    v1: number;
    chordErrorMm: number;
    maxAdjacentNormalErrorDeg: number;
    metricLength: number;
    edgeKey: string;
}
```

Build a per-edge error map, then select split candidates from edges (not triangles). This eliminates the "longest edge" heuristic — every edge is evaluated on its own merit.

### Task 8.3: Curvature-predicted error for split candidates

**Issue:** A5

Before executing a split, estimate how much it will reduce error:

```typescript
function predictSplitReduction(
    chordError: number,
    edgeLengthMm: number,
    principalCurvature: number,
): number {
    // For a circular arc of curvature κ and chord length L:
    // Sagitta = (1 - cos(κL/2)) / κ ≈ κL²/8 for small κL
    // After split, two chords of length L/2:
    // New sagitta ≈ κ(L/2)²/8 = κL²/32
    // Error reduction ≈ 3/4 of original sagitta
    const halfLenError = principalCurvature * (edgeLengthMm / 2) ** 2 / 8;
    return chordError - halfLenError;
}
```

Only split edges where the predicted reduction exceeds a minimum threshold (e.g., 25% of current error). This prevents wasted splits on edges where curvature is low and splitting won't help.

---

## Phase 9: Unified Split-Collapse Optimization

Replace the sequential split-then-collapse strategy with a unified optimization loop.

### Task 9.1: Unified edge priority queue

**Issue:** A4

Create a single priority queue that contains both split candidates (positive priority) and collapse candidates (negative priority):

```typescript
interface EdgeAction {
    v0: number;
    v1: number;
    action: 'split' | 'collapse';
    priority: number;      // > 0 for splits, < 0 for collapses
    predictedReduction: number;
}
```

Priority formula:
- **Split**: `metricLength * (errorRatio - 1) * predictedReductionFraction`
  where `errorRatio = max(chordError/tolerance, normalError/normalTolerance)`
- **Collapse**: `-metricLength * (1 - errorRatio) * qemCost`
  where short metric edges with low error and low QEM cost collapse first

### Task 9.2: Interleaved split/collapse within each iteration

Instead of "split all, then collapse all," process the unified queue:

```
while queue is not empty:
    action = queue.pop()
    if action.type == 'split' AND currentTris < budget:
        execute split
        re-score affected edges (both split and collapse candidates)
    elif action.type == 'collapse' AND edge is over-sampled:
        execute collapse
        re-score affected edges
```

This naturally balances triangle allocation: in smooth regions, collapse candidates dominate the queue; in high-curvature regions, split candidates dominate.

### Task 9.3: Convergence with quality constraints

**Issue:** A3, C6

Replace the simple 5% improvement check with a proper convergence criterion:

```typescript
interface ConvergenceState {
    maxPosError: number;
    p95PosError: number;
    maxNormalError: number;
    p95NormalError: number;
    minAngleDeg: number;
    maxAspectRatio: number;
    triangleCount: number;
}

function isConverged(
    current: ConvergenceState,
    previous: ConvergenceState,
    tolerances: ExportTolerances,
): { converged: boolean; reason: string } {
    // All tolerances must pass
    if (current.maxPosError > tolerances.epsPosMm) return { converged: false, reason: 'pos_error' };
    if (current.maxNormalError > tolerances.epsNormalDeg) return { converged: false, reason: 'normal_error' };
    if (current.minAngleDeg < tolerances.minTriangleAngleDeg) return { converged: false, reason: 'min_angle' };
    if (current.maxAspectRatio > tolerances.maxAspectRatio) return { converged: false, reason: 'aspect_ratio' };
    return { converged: true, reason: 'tolerances_passed' };
}
```

Triangle quality metrics (`minAngleDeg`, `maxAspectRatio`) become first-class convergence criteria, not just diagnostic values.

---

## Phase 10: Quality Optimization Passes

After topology is converged, optimize triangle quality without changing topology.

### Task 10.1: Global Laplacian smoothing with quality constraints

Replace the current `smoothNewVertices` (which only smooths newly inserted vertices) with a global smoothing pass that:
1. Operates on ALL non-feature, non-seam vertices
2. Uses the circular mean for U (already implemented)
3. Rejects any move that worsens the minimum angle of incident triangles
4. Uses weighted Laplacian (area-weighted neighbor contributions)
5. Re-evaluates surface positions via GPU after moving UVs

```typescript
async function globalSmoothing(
    positions: Float32Array,
    uvs: Float32Array,
    indices: Uint32Array,
    outerIdxCount: number,
    featureGraph: FeatureEdgeGraph,
    evaluateMidpoints: EvaluateMidpointsFn,
    iterations: number = 3,
    qualityThreshold: number = 15, // min angle floor
): Promise<void>
```

### Task 10.2: Optimal Delaunay triangulation via global edge flipping

Replace `localEdgeFlip` (which only operates on 2-ring of affected vertices) with a global ODT pass:
1. Build full edge adjacency
2. For each non-feature, non-boundary edge, check if flip improves the Delaunay criterion (empty circumcircle) OR improves minimum angle
3. Multi-pass until no more flips improve quality
4. Quality floor: never flip if it creates a triangle below `minTriangleAngleDeg / 2`

### Task 10.3: Valence optimization

For vertices with valence far from 6 (the ideal for interior triangulation), perform targeted edge flips to regularize:
- Valence 3-4: try to merge with a neighbor via collapse
- Valence 8+: try to reduce via edge flips toward the vertex

This addresses the journal's "53% of vertices have valence < 5" issue.

---

## Phase 11: Performance Optimization

### Task 11.1: Buffer pooling for GPU error estimator

**File:** `GPUErrorEstimator.ts`
**Issue:** P2

Create buffers at `maxTriangles` capacity on `init()`. Reuse across iterations, recreating only if mesh grows beyond capacity:

```typescript
class GPUErrorEstimator {
    private posBuffer: GPUBuffer | null = null;
    private uvBuffer: GPUBuffer | null = null;
    // ... etc
    private currentCapacity = 0;

    private ensureCapacity(triCount: number): void {
        if (triCount <= this.currentCapacity) return;
        // Destroy old buffers, create new ones
        this.currentCapacity = Math.ceil(triCount * 1.5); // 50% headroom
    }
}
```

### Task 11.2: Partial sort for split candidate selection

**Issue:** P3

Replace `errors.sort()` with quickselect to find the top-k candidates:

```typescript
function topK<T>(arr: T[], k: number, compareFn: (a: T, b: T) => number): T[] {
    if (k >= arr.length) return arr.sort(compareFn);
    // Quickselect partition around k-th element
    // Then sort only the top-k
}
```

### Task 11.3: Streaming metric stats (no array allocation)

**Issue:** I6, P1

Replace `edgeLengths: number[]` accumulation with online statistics:

```typescript
class RunningStats {
    n = 0; mean = 0; m2 = 0; min = Infinity; max = -Infinity;
    push(x: number): void {
        this.n++;
        const delta = x - this.mean;
        this.mean += delta / this.n;
        this.m2 += delta * (x - this.mean);
        if (x < this.min) this.min = x;
        if (x > this.max) this.max = x;
    }
    get variance(): number { return this.n > 1 ? this.m2 / (this.n - 1) : 0; }
    get stddev(): number { return Math.sqrt(this.variance); }
}
```

### Task 11.4: Reuse UV batch allocation across iterations

**Issue:** P1

Pre-allocate a single `uvBatch` Float32Array at the start of refinement, sized for `maxTriangles * 12` (4 UV points per triangle × 3 floats). Reuse across iterations instead of allocating new arrays each time.

---

## Phase 12: Test Coverage

### Task 12.1: Curved surface convergence test

Create a test with a hemisphere surface where:
- Initial mesh is a coarse 6×6 grid
- Target tolerance is 0.05mm
- Verify: error monotonically decreases over 4+ iterations
- Verify: final mesh passes all tolerance checks
- Verify: triangle quality (min angle > 15°) maintained throughout

### Task 12.2: Seam boundary test

Create a test with a mesh spanning u=[0.9, 0.1] (wrapping):
- Verify: error estimation produces correct chord error
- Verify: split creates correct UV midpoint (near u=0.0)
- Verify: smoothing doesn't push vertices to u=0.5
- Verify: edge collapse respects seam constraints

### Task 12.3: Split + collapse round-trip test

1. Start with a 10×10 grid (200 triangles)
2. Run split pass → ~300 triangles
3. Run collapse pass targeting 250 triangles
4. Verify: manifold mesh, no degenerates, min angle > 10°
5. Verify: feature edges preserved
6. Verify: error did not increase relative to pre-split baseline

### Task 12.4: Multi-iteration convergence regression test

Run refinement on 3 different pot styles (cylinder, flared, deep ridges):
- 6 iterations each at "high" profile
- Record: error curve, triangle count curve, quality metrics per iteration
- Assert: error non-increasing after iteration 1
- Assert: final quality meets profile tolerances OR stops at `max_iterations` with documented best-effort

### Task 12.5: Edge collapse quality verification

Create a 9×9 grid (162 triangles), collapse to ~100:
- Assert: min angle ≥ 10°
- Assert: no inverted normals
- Assert: aspect ratio ≤ 12
- Assert: feature edges 100% preserved
- Assert: second collapse is a no-op (idempotence)

---

## Phase 13: Quality Profile Refinement

### Task 13.1: Increase iteration caps

| Profile | Current | Proposed | Rationale |
|---------|---------|----------|-----------|
| draft | 0 | 1 | Catch worst single-triangle violations |
| standard | 2 | 4 | Enough for FDM at 0.2mm |
| high | 4 | 8 | Covers most SLA profiles |
| ultra | 6 | 12 | Full convergence for resin at 0.025mm |

### Task 13.2: Add quality tolerance enforcement

Add a `qualityIterations` parameter to profiles — additional iterations after error convergence that only perform edge flips and vertex smoothing (no topology changes) to optimize triangle quality.

---

## File Change Summary

| File | Action | Key Changes |
|---|---|---|
| `AdaptiveRefinement.ts` | **Major rewrite** | Seam-safe UV, per-edge error, unified queue, convergence criteria, global smoothing |
| `EdgeCollapser.ts` | **Rewrite** | Area-weighted QEM, single heap, proper re-scoring, vtMap fix |
| `GPUErrorEstimator.ts` | **Modify** | Buffer pooling |
| `SurfaceMetric.ts` | **Extend** | Curvature prediction, running stats |
| `QualityProfiles.ts` | **Modify** | Iteration caps, quality iterations |
| `AdaptiveRefinement.test.ts` | **Major extend** | Convergence, seam, round-trip, regression tests |
| `EdgeCollapser.test.ts` | **Extend** | Quality verification, area-weighted QEM, re-scoring tests |
| `contracts.ts` | **Modify** | Quality metrics in convergence state |

## Implementation Order

```
Phase 7 (Foundation Fixes)     → 7.1, 7.2, 7.3, 7.4, 7.5 (can parallelize)
Phase 8 (Error Estimation)     → 8.1, 8.2, 8.3 (sequential)
Phase 9 (Unified Optimization) → 9.1, 9.2, 9.3 (sequential)
Phase 10 (Quality Passes)      → 10.1, 10.2, 10.3 (sequential after Phase 9)
Phase 11 (Performance)         → 11.1, 11.2, 11.3, 11.4 (can parallelize)
Phase 12 (Tests)               → Throughout, but 12.1-12.3 after Phase 8
Phase 13 (Profiles)            → After Phase 10
```

**Estimated total:** ~25 tasks, ~2500-3500 lines of new/modified code.

## Verification Criteria

1. `npm run typecheck` — clean
2. `npm run test` — all tests pass including new convergence tests
3. `npm run lint` — 0 warnings
4. **Regression:** hemisphere surface convergence in ≤4 iterations at 0.05mm tolerance
5. **Quality gate:** all post-refinement meshes have min angle ≥ profile threshold
6. **Budget efficiency:** triangle count within 10% of target after split+collapse
7. **Feature preservation:** 100% of feature edges survive refinement
8. **Seam integrity:** no gap increase at u=0/1 seam after any operation
