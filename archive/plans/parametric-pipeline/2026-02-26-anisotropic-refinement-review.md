# Code Review: Anisotropic Adaptive Refinement Pipeline (Phases 1-5)

## Overall Assessment

This is a substantial and well-structured implementation that addresses the six critical bugs and four design gaps identified in the plan. The code demonstrates strong domain knowledge of computational geometry and GPU programming. The architecture is clean, with good separation between CPU and GPU paths, feature-flag gating, and a clear fallback strategy. That said, there are several issues ranging from a type mismatch between contracts to disabled functionality and a few algorithmic concerns worth addressing.

---

## What Was Done Well

1. **Phase 1 bug fixes are thorough and correctly implemented.** The metric recomputation after splits (Task 1.1, line 1340-1344 of `AdaptiveRefinement.ts`), metric edge selection (Task 1.2), multiplicative scoring with clamping (Task 1.3), split quality guard (Task 1.4), and outer-only invariant assertion (Task 1.5) all follow the plan precisely.

2. **Phase 2 finite-difference normal estimation is well-designed.** The GPU batch is cleverly packed -- edge midpoints in the first N entries, then 3N FD points -- so only a single GPU dispatch is needed per iteration. The math at lines 547-576 of `AdaptiveRefinement.ts` is correct.

3. **GPUErrorEstimator has clean resource management.** Buffers are created per-dispatch and destroyed after readback (lines 206-213 of `GPUErrorEstimator.ts`). The `init()`/`destroy()` lifecycle is explicit. The fallback path (GPU estimator optional) means the CPU path is never broken.

4. **The WGSL shader is well-structured.** The `error_estimation.wgsl` shader correctly handles degenerate triangles, uses `ee_safe_normalize` to avoid division by zero, and the struct layout is 16-byte aligned (4 floats per triangle = 16 bytes).

5. **Feature flag gating works correctly.** The `gpuFidelityCheck` flag gates both the GPU error estimator and GPU validation, as intended. The flag resolution in `contracts.ts` (`resolveFeatureFlags`) correctly merges user overrides with defaults.

6. **Test coverage is decent** with 30+ test cases covering the core functions, split quality guard, edge flipping, metric edge lengths, and the full refinement loop.

---

## Critical Issues (Must Fix)

### C1: `contracts.ts` `RefinementOutput.stopReason` is missing `'diminishing_returns'`

**File:** `src/renderers/webgpu/parametric/contracts.ts`, line 225

The `RefinementResult` type in `AdaptiveRefinement.ts` includes `'diminishing_returns'` in its `stopReason` union (line 157), but the corresponding `RefinementOutput` contract in `contracts.ts` line 225 does not:

```typescript
// contracts.ts line 225 — MISSING 'diminishing_returns'
readonly stopReason: 'tolerances_passed' | 'max_iterations' | 'budget_exhausted' | 'no_improvement' | 'zero_iterations';
```

This means any code that passes a `RefinementResult` as a `RefinementOutput` will fail typecheck if the stop reason is `'diminishing_returns'`. This is a contract violation between the two types.

**Fix:** Add `'diminishing_returns'` to the union in `contracts.ts` line 225.

### C2: `contracts.test.ts` uses `minAngleDeg` instead of `minTriangleAngleDeg`

**File:** `src/renderers/webgpu/parametric/contracts.test.ts`, lines 314, 343, 394, 404, 443, 488

The `ExportTolerances` type defines `minTriangleAngleDeg`, but the contracts test uses the wrong field name `minAngleDeg`. The TypeScript compiler confirms this with errors like:

```
error TS2353: Object literal may only specify known properties, and 'minAngleDeg' does not exist in type 'ExportTolerances'.
```

These test objects are constructing incomplete `ExportTolerances` missing the required fields (`epsFeatureMm`, `minTriangleAngleDeg`, `maxAspectRatio`). This suggests the test was written before or during the `ExportTolerances` type expansion and never updated.

**Fix:** Update all test tolerance objects in `contracts.test.ts` to use the correct field names and include all required fields.

### C3: `GPUErrorEstimator` passes `positions.buffer` to `writeBuffer` -- potential SharedArrayBuffer issue

**File:** `src/renderers/webgpu/parametric/GPUErrorEstimator.ts`, lines 116, 123, 130, 147

```typescript
this.device.queue.writeBuffer(posBuffer, 0, positions.buffer);
```

`Float32Array.buffer` returns the underlying `ArrayBuffer` but if the `Float32Array` is a view (e.g., created via `new Float32Array(existingBuffer, offset, length)`), then `.buffer` contains the **entire backing buffer**, not just the slice this view represents. This would write incorrect data.

**Fix:** Use `positions` directly instead of `positions.buffer`, or use `writeBuffer(posBuffer, 0, positions.buffer, positions.byteOffset, positions.byteLength)`. The safer pattern:

```typescript
this.device.queue.writeBuffer(posBuffer, 0, positions);
```

WebGPU's `writeBuffer` accepts `TypedArray` directly and handles the view correctly.

### C4: `GPUErrorEstimator.configBuffer` declared as `STORAGE` but shader declares `var<storage, read>`

**File:** `src/renderers/webgpu/parametric/GPUErrorEstimator.ts`, line 142-147 vs `error_estimation.wgsl` line 42

The config buffer is created with `GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST` and bound as `'read-only-storage'` (line 63 in init). However, the `ee_config` is a `Float32Array` of 4 values where `ee_config[0]` stores an integer (`outerTriCount`) as a float. In the shader:

```wgsl
let outerTriCount = u32(ee_config[0]);
```

This works but is fragile. The `outerTriCount` cast from `f32` to `u32` will lose precision for triangle counts above 2^24 (16.7M). For this pipeline, the maximum triangle budget is 8M (ultra profile), so this is safe for now, but it is worth noting as a latent issue if budgets ever grow.

---

## Important Issues (Should Fix)

### I1: Phases 3.1 and 3.2 (edge flip + vertex smoothing) are disabled

**File:** `src/renderers/webgpu/parametric/AdaptiveRefinement.ts`, lines 1346-1351

The comment states:
```
// Task 3.1 & 3.2: DISABLED -- root cause of broken geometry.
// BUG 1 (localEdgeFlip): Stale edge adjacency after flips creates
// triangles linking distant vertices.
// BUG 2 (smoothNewVertices): UV averaging near seam (u~0 and u~1)
// moves midpoints to opposite side of pot.
```

The `localEdgeFlip` and `smoothNewVertices` functions are implemented, tested, and exported, but **never called in the production path**. This is a significant plan deviation. The plan listed these as Phase 3 deliverables, and the implementations exist and have tests, but they are dead code in practice.

**Recommendation:** This is acceptable as an engineering decision (better to ship correct-but-incomplete than broken), but the plan should be updated to document this as deferred work. The comment in the code is a good start. The two bugs mentioned (stale adjacency, seam UV wrapping) are real issues that need seam-aware implementations.

### I2: `ExportDiagnostics` in ExportDialog does not include refinement summary

**File:** `src/ui/controls/ExportDialog.tsx`

The plan (Task 4.3) called for surfacing refinement summary (iterations, stop reason, max error, p95 error, per-iteration convergence) in the ExportDialog debug tab. The current `ExportDiagnostics` interface and debug tab UI show pipeline phase timings, chain counts, valence distribution, and cross-row triangles -- but **no refinement-specific data** (stop reason, iteration count, convergence graph, error metrics).

The refinement produces rich `RefinementResult` with `iterationStats` and `stopReason`, but this data is not forwarded from `ParametricExportComputer` to the UI.

**Recommendation:** Add a `refinement` field to `ExportDiagnostics`:
```typescript
refinement?: {
    iterations: number;
    stopReason: string;
    maxPosErrorMm: number;
    p95PosErrorMm: number;
    maxNormalErrorDeg: number;
    convergencePerIteration: Array<{ tris: number; maxErr: number }>;
};
```

### I3: `estimateErrorsGPU` and `estimateErrorsCPU` accept `tolerances` parameter but never use it for filtering

**File:** `src/renderers/webgpu/parametric/AdaptiveRefinement.ts`, lines 350 and 441

TypeScript reports:
```
error TS6133: 'tolerances' is declared but its value is never read.
```

Both functions accept `tolerances` as a parameter but do not use it (filtering is done in the refinement loop after error estimation returns). The parameter name should be prefixed with underscore or removed. This is a lint/CI failure.

**Fix:** Prefix with underscore (`_tolerances`) or remove the parameter if it is truly unused.

### I4: `GPUErrorEstimator` does not handle workgroup dispatch limit (>65535)

**File:** `src/renderers/webgpu/parametric/GPUErrorEstimator.ts`, line 164

```typescript
const workgroups = Math.ceil(outerTriCount / 64);
```

Per CLAUDE.md: "getDispatchSize() in ExportComputer wraps dispatches into a 2D grid when totalWorkgroups > 65535 (WebGPU per-dimension limit)." With 64 threads per workgroup and 8M triangles (ultra profile), that is 125,000 workgroups -- exceeding the 65535 limit.

**Fix:** Use a 2D dispatch grid when `workgroups > 65535`, similar to `getDispatchSize()` in `ExportComputer`. The shader's `gid.x` would need to be computed from `gid.x + gid.y * dispatchWidth`.

### I5: `localEdgeFlip` rebuilds edge adjacency from scratch but does not re-iterate

**File:** `src/renderers/webgpu/parametric/AdaptiveRefinement.ts`, lines 895-970

The `localEdgeFlip` function builds edge adjacency once, then iterates over edges and applies flips. However, after a flip, the adjacency map becomes stale (the flipped edge key changes from `eA-eB` to `opp0-opp1`). The iteration continues with the stale map, which means:
- A second flip attempt on the same edge would reference deleted triangle offsets
- Cascading flips that depend on previous flips may operate on incorrect topology

The code comment (line 1347) acknowledges this as the reason for disabling it. This is noted as an important design issue for when the feature is re-enabled.

### I6: The `metricStats` field in `RefinementIterationStats` is declared but never populated

**File:** `src/renderers/webgpu/parametric/AdaptiveRefinement.ts`, lines 119-129

The plan (Task 4.2) specified computing `metricStats` (meanAnisotropy, maxAnisotropy, meanMetricEdgeLen, edgeLengthCV) per iteration. The interface is defined but no code in `adaptiveRefine` populates it. All `iterationStats.push()` calls omit the `metricStats` field.

**Fix:** After the splitting step, when `curVertexMetrics` is available, compute and include metric stats.

---

## Suggestions (Nice to Have)

### S1: Consider buffer reuse in `GPUErrorEstimator`

The current implementation creates and destroys all GPU buffers per `estimateErrors` call (lines 111-213). For iterative refinement (4-6 iterations), this means 4-6 full buffer creation/destruction cycles. The plan (Task 5.2) recommended creating buffers sized to `maxTriangles` and reusing across iterations, recreating only if capacity is exceeded.

### S2: `checkSplitQuality` only validates the 4 replacement triangles, not neighboring quality degradation

The split quality guard checks that the 4 new triangles have acceptable minimum angles, but it does not check whether the split might worsen the quality of triangles adjacent to `opp0` or `opp1`. This is acceptable for now since the adjacency check would add significant complexity.

### S3: Consider `abs(dot)` treatment in normal error

Both the WGSL shader (line 238: `abs(cosAngle)`) and the CPU `estimateErrorsGPU` (line 574: `Math.abs(dot)`) use the absolute value of the dot product for normal error. This means antiparallel normals (opposite orientation) report 0 degrees of error. This is intentional for non-oriented meshes where the triangle winding might be inconsistent, but it means a completely flipped normal appears as "no error." For a watertight pot mesh that should have consistent outward normals, removing the `abs` would be more correct.

### S4: The WGSL shader hardcodes `r_base` and other function dependencies

The `error_estimation.wgsl` file calls `r_base(t)` and `style_radius()` which are injected by `ShaderManager.getErrorEstimationWGSL()`. This assembly pattern works but the shader has no way to verify at compile time that these functions exist. A comment listing the expected injected symbols would help future maintainers.

---

## Plan Alignment Summary

| Phase | Status | Notes |
|-------|--------|-------|
| 1.1: Metric recomputation | Implemented | Lines 1340-1344, correct |
| 1.2: Metric edge selection | Implemented | Both CPU and GPU paths updated |
| 1.3: Scoring normalization | Implemented | Multiplicative with [0.5, 2.0] clamp |
| 1.4: Split quality guard | Implemented | `checkSplitQuality` with min-angle check |
| 1.5: Outer-only invariant | Implemented | `console.error` assertion at loop start |
| 2.1: FD normal estimation | Implemented | Batched 3-point FD in GPU path |
| 2.2: Replace dihedral heuristic | Implemented | GPU path uses true normals; CPU path retains dihedral |
| 3.1: Edge-flip cleanup | Implemented but DISABLED | Known bugs with stale adjacency |
| 3.2: Vertex smoothing | Implemented but DISABLED | Known bugs with seam UV wrapping |
| 4.1: Convergence diagnostics | Implemented | `diminishing_returns` stop reason works |
| 4.2: Per-iteration metric stats | Interface only | `metricStats` field never populated |
| 4.3: UI surfacing | NOT implemented | No refinement data in `ExportDiagnostics` |
| 5.1: WGSL shader | Implemented | Clean, correct alignment |
| 5.2: GPUErrorEstimator | Implemented | Missing dispatch size guard |
| 5.3: Shader assembly | Implemented | `getErrorEstimationWGSL` correct |
| 5.4: Refinement loop wiring | Implemented | Via `gpuEstimateErrors` callback |
| 5.5: Orchestrator wiring | Implemented | Gated behind `gpuFidelityCheck` |
| 5.6: Benchmark tests | NOT implemented | No GPU vs CPU comparison tests |

---

## Recommended Next Steps (Priority Order)

1. Fix the `contracts.ts` stop reason union (C1) and the `contracts.test.ts` field names (C2) -- these are breaking typecheck.
2. Fix the `writeBuffer` `.buffer` issue in `GPUErrorEstimator` (C3) -- data corruption risk.
3. Add the 65535 workgroup dispatch guard (I4) -- will crash on ultra profile.
4. Fix the unused `tolerances` parameters (I3) -- ESLint CI failure.
5. Populate `metricStats` per iteration (I6) and surface refinement data in the UI (I2).
6. Update the plan document to note Phases 3.1/3.2 as deferred with specific re-enablement criteria (seam-aware adjacency, circular UV interpolation).
