# Anisotropic Refinement — Review & Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bring the anisotropic adaptive refinement pipeline from prototype wiring to state-of-the-art production quality, so that quality profile selection (draft/standard/high/ultra) produces visibly and measurably different meshes.

**Architecture:** Three-module system — SurfaceMetric (metric tensor field), AdaptiveRefinement (error-driven splitting loop), MeshValidator (post-hoc QA). The orchestrator (`ParametricExportComputer.ts`) extracts outer-wall data, runs refinement, then stitches back.

**Tech Stack:** TypeScript CPU math, GPU evaluator callback (`EvaluateMidpointsFn`), WebGPU surface evaluation, Vitest tests.

---

## Current State — Critical Review

### What Works

1. **Basic plumbing is connected.** The orchestrator correctly extracts outer-wall-only data before calling `adaptiveRefine()`, preventing the cross-surface linkage bug. Stitching back is correct.
2. **GPU evaluator callback** is properly wired — midpoint UVs are evaluated to on-surface 3D positions via the same WebGPU pipeline used for the main mesh.
3. **Feature-edge constraint preservation** works — `isFeatureEdge()` prevents splitting chain edges.
4. **Quality profiles** drive `maxRefineIterations` (0/2/4/6) and tolerance thresholds.
5. **SurfaceMetric math is correct** — Jacobian computation, first fundamental form, eigendecomposition, metric edge length, and distortion analysis are all mathematically sound.
6. **Test coverage** is decent — 20+ test cases covering error estimation, splitting, and refinement loop control flow.

### Critical Bugs

#### Bug 1: Normal error estimation is a heuristic proxy, not true surface normal error

`estimateErrorsGPU()` (line 404) claims to estimate normal error but actually measures **inter-triangle dihedral angles** as a proxy. The GPU evaluator only returns **positions**, not normals. The dihedral angle between adjacent flat faces is loosely correlated with surface normal deviation but can be both an over- and under-estimate:

- **Under-estimate:** Two adjacent triangles can both be tilted away from the analytic surface normal by the same angle — the dihedral between them is 0° while the actual normal error is large.
- **Over-estimate:** At feature ridges (intentional sharp edges), the dihedral angle is large by design, but the mesh is faithfully representing the surface.

**Impact:** The `epsNormalDeg` tolerance is gated against a metric that doesn't measure what it claims. Refinement may over-split at ridges and under-split on smooth regions with uniform curvature.

#### Bug 2: Metric-aware scoring is additive blending, not proper prioritization

In `adaptiveRefine()` line 842-862, the metric priority is blended into the error score as:

```typescript
scoreA += prioA * 0.5;
```

This means metric priority is **50% weight** relative to the normalized error score. The problem:

- The error score `(posErr/epsPos) + (normErr/epsNorm)` is dimensionless but unbounded (can be 100+)
- The metric priority `metricEdgeLength / targetLength` is also unbounded (can be 50+)
- With a fixed 0.5 weight, the metric term is overwhelmed when error scores are large (early iterations) and dominant when error scores are small (late iterations)
- There's no normalization — the balance shifts unpredictably between iterations

#### Bug 3: `vertexMetrics` become stale after splitting

`computeVertexMetrics()` is called once before the refinement loop, but the loop splits triangles and inserts new vertices. The new midpoint vertices have **no metric tensor data** — their E, F, G values default to 0 (uninitialized `Float32Array` extension). This means:

- `anisotropicSplitPriority()` returns 0 for edges touching new vertices
- After the first iteration, metric-aware scoring becomes progressively noisier
- By iteration 3+, most candidate edges touch at least one new vertex → metric scoring is effectively disabled

#### Bug 4: `outerIdxCount` update in `adaptiveRefine` is still fragile

Line 898: `curOuterIdxCount = curOuterIdxCount + newOuterTris * 3`

While the cross-surface bug was fixed by passing outer-only data, within `adaptiveRefine` itself, `splitOverThresholdTriangles` appends new triangles at the END of the index buffer. The `curOuterIdxCount` grows to include them — this is correct for outer-only data, but if any future code passes non-outer-only data, the same cross-surface bug returns. There's no assertion guarding this invariant.

#### Bug 5: No triangle quality check during splitting

`splitOverThresholdTriangles()` applies 2-to-4 splits without checking whether the resulting triangles have acceptable shape quality (minimum angle, aspect ratio). A split can produce sliver triangles with angles < 5° if the midpoint falls near an existing vertex, or if the triangle is already elongated along the split edge.

#### Bug 6: Edge selection always picks the longest Euclidean edge

When `metricAwareRefinement` is enabled, the metric priority only affects the **sort order** of which triangles to split first. The actual edge selected for splitting within each triangle is always the **longest 3D Euclidean edge** (line 430-440 in `estimateErrorsGPU` and line 332-341 in `estimateErrorsCPU`). In anisotropic regions, the longest 3D edge is often NOT the edge with the highest metric distortion — you could have a short 3D edge that maps to a huge UV distance (highly compressed region).

### Design Gaps

#### Gap A: No analytic surface normal evaluation

The GPU evaluator (`evaluatePoints`) only returns XYZ positions. True normal error requires evaluating the analytic surface normal, which needs either:
- Finite-difference approximation (evaluate 3 nearby points, compute cross product)
- A second compute shader that outputs normals alongside positions

Without this, the `epsNormalDeg` tolerance is theater.

#### Gap B: No local mesh quality enforcement

After splitting, there's no Laplacian smoothing, edge-collapse, or edge-flip pass to improve local triangle quality. Academic adaptive refinement (e.g., CGAL, TetGen, Triangle) always includes a cleanup pass after each batch of splits.

#### Gap C: No edge-collapse / vertex-merge for over-refined regions

The refinement loop can only ADD triangles (split), never REMOVE them. If the initial mesh is over-tessellated in some regions (e.g., smooth cylinder sections), those regions can't be simplified. A complete adaptive system needs both split and collapse.

#### Gap D: Metric field is not re-computed after mesh topology changes

`buildMetricField()` and `computeVertexMetrics()` are called once. After splits change the mesh, the metric field is stale. Professional implementations re-compute the metric for the local neighborhood of each split.

#### Gap E: No convergence rate tracking

The `no_improvement` check (line 815) uses a crude 5% threshold. Professional implementations track the convergence rate (error decrease per triangle added) and stop when marginal improvement drops below a threshold.

#### Gap F: Lack of per-iteration metric recomputation for `vertexMetrics`

New midpoint vertices inserted during splitting have no metric tensor data. The VertexMetrics arrays (E, F, G) are not extended or recomputed.

---

## Implementation Plan

### Phase 1: Fix critical bugs (no new algorithms)

#### Task 1.1: Recompute vertex metrics after each split iteration

**Files:**
- Modify: `src/renderers/webgpu/parametric/AdaptiveRefinement.ts` (~line 896-901)

**What:** After `splitOverThresholdTriangles()` returns with new positions/uvs/indices, recompute `vertexMetrics` from the updated mesh if `config.vertexMetrics` was provided:

```typescript
// After split, recompute metrics for the new mesh
if (vertexMetrics) {
    const newMetrics = computeVertexMetrics(
        curPositions, curUVs, curIndices, curOuterIdxCount
    );
    // Update the reference used by sorting
    vertexMetrics = newMetrics;
}
```

Also change `vertexMetrics` from `const` destructured to `let` in the loop scope.

**Test:** Existing `adaptiveRefine` tests should still pass. Add a test with metric-aware refinement enabled on a curved mesh verifying vertex count of metrics matches after splits.

#### Task 1.2: Select split edge by metric length, not Euclidean length

**Files:**
- Modify: `src/renderers/webgpu/parametric/AdaptiveRefinement.ts` (estimateErrorsGPU + estimateErrorsCPU)

**What:** When `vertexMetrics` is available, replace Euclidean longest-edge selection with metric-length longest-edge selection. Add `vertexMetrics` as optional parameter to both functions:

```typescript
// In the edge length comparison loop:
if (vertexMetrics) {
    const mLen0 = metricEdgeLengthSq(vertexMetrics, uvs, i0, i1);
    const mLen1 = metricEdgeLengthSq(vertexMetrics, uvs, i1, i2);
    const mLen2 = metricEdgeLengthSq(vertexMetrics, uvs, i2, i0);
    // Pick longest metric edge
} else {
    // Current: pick longest Euclidean edge
}
```

Also need to add a `metricEdgeLengthSq()` helper to SurfaceMetric.ts (squared version for comparison without sqrt).

**Test:** Unit test: anisotropic mesh (stretched rectangle in UV, uniform in 3D) — the metric-length-longest edge should differ from the Euclidean-longest edge.

#### Task 1.3: Fix scoring normalization

**Files:**
- Modify: `src/renderers/webgpu/parametric/AdaptiveRefinement.ts` (~line 842-862)

**What:** Replace additive blending with multiplicative weighting:

```typescript
const sortedErrors = [...errors].sort((a, b) => {
    // Base score: combined normalized error (always present)
    let scoreA = (a.posErrorMm / tolerances.epsPosMm) + (a.normalErrorDeg / tolerances.epsNormalDeg);
    let scoreB = (b.posErrorMm / tolerances.epsPosMm) + (b.normalErrorDeg / tolerances.epsNormalDeg);

    if (vertexMetrics && metricTargetLen > 0) {
        // Metric boost: multiply error score by metric priority
        // Edges longer than target in metric space get boosted; shorter get dampened
        // Clamp to [0.5, 2.0] to prevent metric from completely overriding error signal
        const prioA = Math.max(0.5, Math.min(2.0, anisotropicSplitPriority(...)));
        const prioB = Math.max(0.5, Math.min(2.0, anisotropicSplitPriority(...)));
        scoreA *= prioA;
        scoreB *= prioB;
    }
    return scoreB - scoreA;
});
```

**Rationale:** Multiplicative means the metric modulates the error-based priority by ±2×. Error always drives the decision; metric steers within the error ranking. The [0.5, 2.0] clamp prevents metric from dominating.

**Test:** Unit test verifying that with metric enabled, a triangle with lower error but high metric distortion can outrank a triangle with higher error but low distortion.

#### Task 1.4: Add split-quality guard

**Files:**
- Modify: `src/renderers/webgpu/parametric/AdaptiveRefinement.ts` (splitOverThresholdTriangles)

**What:** After computing the 4 replacement triangles for a 2-to-4 split, check minimum angle of each. If any resulting triangle has min angle < `minTriangleAngleDeg / 2` (e.g., < 9° for standard), skip this split candidate:

```typescript
// Before applying the split:
if (!checkSplitQuality(positions, v0, v1, midIdx, opp0, opp1, minAngleThreshold)) {
    continue; // skip this candidate, try next
}
```

Add a helper `checkSplitQuality()` that computes the 4 resulting triangle min-angles.

**Test:** Construct a near-degenerate triangle where splitting would create a sliver; verify the split is rejected.

#### Task 1.5: Add outer-only invariant assertion

**Files:**
- Modify: `src/renderers/webgpu/parametric/AdaptiveRefinement.ts` (adaptiveRefine)

**What:** At the start of `adaptiveRefine`, assert that `outerIdxCount === indices.length`:

```typescript
if (outerIdxCount !== indices.length) {
    console.error('[AdaptiveRefinement] INVARIANT VIOLATION: outerIdxCount !== indices.length. ' +
        'Refinement must receive outer-wall-only data. Got outerIdxCount=' + outerIdxCount +
        ', indices.length=' + indices.length);
}
```

This catches future regressions where someone passes the combined buffer.

**Test:** Test that passing mismatched counts logs an error.

### Phase 2: True surface normal evaluation

#### Task 2.1: Add finite-difference normal estimation to GPU evaluator

**Files:**
- Modify: `src/renderers/webgpu/parametric/AdaptiveRefinement.ts` (estimateErrorsGPU)

**What:** For each triangle, instead of using the dihedral-angle heuristic for normal error, evaluate 3 points on the analytic surface near the triangle centroid and compute the cross-product normal:

```typescript
// For each triangle centroid at (u, t):
// Evaluate: P(u,t), P(u+ε,t), P(u,t+ε)  where ε = small UV step
// Analytic normal ≈ normalize((P_u+ε - P) × (P_t+ε - P))
// Then: normalError = angle(meshFaceNormal, analyticNormal)
```

This requires 3× the GPU evaluations per triangle (centroid + two finite-diff neighbors). To amortize cost, batch all 3N points in a single GPU dispatch.

**UV step size:** `ε = 1 / (2 * max(numU, numT))` — half a grid cell.

**Test:** Verify on a known surface (hemisphere) that the finite-diff normal matches the analytic normal to within 0.5°.

#### Task 2.2: Replace dihedral heuristic in error estimation

**Files:**
- Modify: `src/renderers/webgpu/parametric/AdaptiveRefinement.ts` (estimateErrorsGPU)

**What:** Use the true surface normal from Task 2.1 instead of the dihedral angle heuristic. Keep the dihedral as a fallback for `estimateErrorsCPU` (which doesn't have GPU access).

Update the `TriangleError` interface to include the actual normal deviation, not the dihedral proxy.

**Test:** Export a pot at 'standard' quality, verify `p95NormalErrorDeg` is within tolerance.

### Phase 3: Local mesh quality improvement after splitting

#### Task 3.1: Edge-flip cleanup pass after each split batch

**Files:**
- Modify: `src/renderers/webgpu/parametric/AdaptiveRefinement.ts` (splitOverThresholdTriangles, end)

**What:** After applying all splits in a batch, run a local edge-flip pass over the affected neighborhood (edges adjacent to new midpoint vertices). For each non-feature, non-boundary edge shared by two triangles, flip it if the flip improves the minimum angle of the quad:

```typescript
function localEdgeFlip(
    indices: Uint32Array,
    positions: Float32Array,
    affectedVertices: Set<number>,
    featureGraph: FeatureEdgeGraph,
    outerIdxCount: number,
): number {
    // For each edge touching an affected vertex:
    //   Compute min angle of both triangles before flip
    //   Compute min angle of both triangles after flip
    //   If after > before AND not a feature edge: apply flip
}
```

**Rationale:** This is the standard Delaunay maintenance step after point insertion. It prevents accumulation of sliver triangles across iterations.

**Test:** After splitting a mesh, verify that min-angle is higher with flip cleanup than without.

#### Task 3.2: Vertex smoothing for new midpoints

**Files:**
- Modify: `src/renderers/webgpu/parametric/AdaptiveRefinement.ts`

**What:** After splitting + flipping, apply 1-2 iterations of Laplacian smoothing to newly inserted midpoints only (not original vertices, not feature-edge vertices). The smoothed UV position is then re-evaluated on the GPU to get the true surface position.

```typescript
function smoothNewVertices(
    uvs: Float32Array,
    indices: Uint32Array,
    newVertexStart: number, // first new vertex index
    featureVertices: Set<number>,
    evaluateMidpoints: EvaluateMidpointsFn,
): Promise<Float32Array> {
    // Average UV neighbors for each new vertex
    // Re-project to surface
}
```

**Test:** Verify vertex positions change slightly after smoothing, and that feature vertices don't move.

### Phase 4: Convergence and diagnostics

#### Task 4.1: Track convergence rate and implement intelligent stopping

**Files:**
- Modify: `src/renderers/webgpu/parametric/AdaptiveRefinement.ts` (adaptiveRefine loop)

**What:** Replace the crude 5% improvement check with convergence rate tracking:

```typescript
// Track: error reduction per triangle added
const efficiency = (prevMaxPos - maxPos) / splitResult.splitCount;
// Stop if: adding N triangles reduced error by less than 1% of tolerance
const marginalThreshold = tolerances.epsPosMm * 0.01;
if (efficiency < marginalThreshold && iter > 0) {
    return buildResult(..., 'diminishing_returns');
}
```

Also add `'diminishing_returns'` to the `stopReason` union type.

**Test:** Verify that on a mesh where error converges (flat regions), refinement stops early rather than hitting max iterations.

#### Task 4.2: Add per-iteration diagnostics to RefinementResult

**Files:**
- Modify: `src/renderers/webgpu/parametric/AdaptiveRefinement.ts`
- Modify: `src/renderers/webgpu/parametric/types.ts`

**What:** Extend `RefinementIterationStats` with:

```typescript
/** Metric-aware stats (only when vertexMetrics provided). */
metricStats?: {
    meanAnisotropy: number;
    maxAnisotropy: number;
    meanMetricEdgeLen: number;
    edgeLengthCV: number; // coefficient of variation
};
```

Compute and report these after each iteration so the ExportDialog debug tab can show refinement convergence.

**Forward to UI:** Wire into `PipelineDiagnostics` and `ExportDialog` debug tab.

#### Task 4.3: Surface `refinementSummary` in debug tab

**Files:**
- Modify: `src/ui/controls/ExportDialog.tsx` (DebugTab)
- Modify: `src/ui/controls/ExportPanel.tsx`

**What:** Display the refinement summary (iterations, stop reason, max error, p95 error) in the ExportDialog debug tab alongside the existing pipeline diagnostics. Show per-iteration convergence as a mini table or sparkline.

### Phase 5: GPU compute error estimation — move the inner loop to the GPU

> **Rationale:** After Phases 1–4, the refinement loop is correct and complete, but the per-triangle error estimation is CPU-bound. Each iteration requires one GPU roundtrip per batch of midpoints (for position eval) plus CPU-side cross-products and angle computations for every triangle. At production scale (100k+ triangles, 4–6 iterations), this becomes the bottleneck. Moving error estimation to a single GPU compute dispatch per iteration eliminates thousands of individual math operations on the CPU and leverages the existing style shader functions — meaning **zero style-specific CPU code is needed**.

#### Existing GPU infrastructure to leverage

The `adaptive_mesh.wgsl` shader already has:
- `compute_approx_normal()` — finite-difference normal estimation using `compute_outer_radius()`
- `compute_importance()` — per-point error metric (sagitta + chord error + normal deviation + feature proximity)
- `compute_metric_field` entry point — outputs 3 floats/vertex (m11, m12, m22) via binding 9
- All style functions (`style_radius()`, `r_base()`, `compute_outer_radius()`) are assembled into the shader
- `AdaptiveUniforms` struct (80 bytes, 5×vec4<f32>) with grid dimensions, thresholds, surface params
- 11-binding layout with workgroup_size(64)

#### Task 5.1: Design per-triangle error estimation WGSL compute shader

**Files:**
- Create: `src/renderers/webgpu/error_estimation.wgsl`

**What:** A new compute shader entry point `estimate_triangle_errors` that, for each triangle:

1. **Read triangle vertices** from position + UV storage buffers
2. **Compute mesh face normal** via cross product of edge vectors
3. **Compute analytic surface normal** at centroid using the existing `compute_approx_normal()` finite-difference helper (already in `adaptive_mesh.wgsl` — extract to shared include or duplicate the 10-line helper)
4. **Compute normal error** as `acos(dot(meshNormal, analyticNormal))` in degrees
5. **Compute chord error** as distance from triangle centroid to the on-surface point evaluated at the centroid's UV — uses `compute_outer_radius()` which calls style functions
6. **Compute metric tensor** at triangle centroid via UV Jacobian (finite-difference of surface position w.r.t. u and t) — produces E, F, G components
7. **Compute metric edge lengths** for all 3 edges using the local metric tensor
8. **Output per-triangle struct** to a storage buffer:

```wgsl
struct TriangleErrorGPU {
    posErrorMm: f32,       // chord error at centroid
    normalErrorDeg: f32,   // angle between mesh face normal and analytic surface normal
    metricEdgeLen0: f32,   // metric length of edge v0→v1
    metricEdgeLen1: f32,   // metric length of edge v1→v2
    metricEdgeLen2: f32,   // metric length of edge v2→v0
    longestMetricEdge: u32, // 0, 1, or 2 — which edge to split
    _pad0: f32,
    _pad1: f32,            // 32 bytes total, 16-byte aligned
};
```

**Bind group layout:**

```
@group(0) @binding(0) var<storage, read> positions: array<f32>;     // [x,y,z,...] per vertex
@group(0) @binding(1) var<storage, read> uvs: array<f32>;           // [u,t,surfaceId,...] per vertex
@group(0) @binding(2) var<storage, read> indices: array<u32>;       // triangle index buffer
@group(0) @binding(3) var<uniform> params: ErrorEstimationUniforms; // tolerances, grid dims, etc.
@group(0) @binding(4) var<storage, read_write> errors: array<TriangleErrorGPU>; // output
```

**Uniforms:**

```wgsl
struct ErrorEstimationUniforms {
    numTriangles: u32,
    epsPosMm: f32,
    epsNormalDeg: f32,
    finiteDiffEpsilon: f32,    // UV step for finite-difference normals
    surfaceHeight: f32,
    surfaceRadius: f32,
    styleId: u32,
    _pad: u32,                 // 32 bytes, 16-byte aligned
};
```

**Dispatch:** `ceil(numTriangles / 64)` workgroups × 1 × 1. Each thread processes one triangle.

**Test:** Unit test with a mock shader environment validating the WGSL compiles and the struct layout matches the TypeScript readback struct.

#### Task 5.2: Create `GPUErrorEstimator` TypeScript module

**Files:**
- Create: `src/renderers/webgpu/parametric/GPUErrorEstimator.ts`

**What:** A module that manages the GPU pipeline for per-triangle error estimation:

```typescript
export interface GPUErrorEstimatorConfig {
    device: GPUDevice;
    shaderModule: GPUShaderModule;  // pre-compiled error_estimation.wgsl
    maxTriangles: number;           // upper bound for buffer sizing
}

export interface GPUTriangleError {
    posErrorMm: number;
    normalErrorDeg: number;
    metricEdgeLengths: [number, number, number];
    longestMetricEdge: 0 | 1 | 2;
}

export class GPUErrorEstimator {
    private pipeline: GPUComputePipeline;
    private bindGroupLayout: GPUBindGroupLayout;
    private errorBuffer: GPUBuffer;        // output: TriangleErrorGPU[]
    private readbackBuffer: GPUBuffer;     // MAP_READ staging buffer
    private uniformBuffer: GPUBuffer;

    constructor(config: GPUErrorEstimatorConfig);

    /**
     * Estimate errors for all triangles in a single GPU dispatch.
     *
     * @param positions - Packed vertex positions [x,y,z,...].
     * @param uvs - Packed vertex UVs [u,t,surfaceId,...].
     * @param indices - Triangle index buffer (outer wall only).
     * @param tolerances - Current quality tolerances.
     * @param surfaceParams - Height, radius, style ID for shader evaluation.
     * @returns Per-triangle error array (ordered by triangle index).
     */
    async estimateErrors(
        positions: Float32Array,
        uvs: Float32Array,
        indices: Uint32Array,
        tolerances: ExportTolerances,
        surfaceParams: { height: number; radius: number; styleId: number },
    ): Promise<GPUTriangleError[]>;

    /** Release GPU resources. */
    destroy(): void;
}
```

**Implementation details:**

1. **Buffer management:** Create position/UV/index storage buffers sized to `maxTriangles * 3` vertices. Reuse across iterations (the mesh grows but stays within budget). If the mesh exceeds buffer capacity, recreate with 2× size.
2. **Write mesh data** to GPU buffers via `device.queue.writeBuffer()`.
3. **Dispatch** the compute shader with `ceil(numTriangles / 64)` workgroups.
4. **Readback:** Copy error buffer → readback buffer, then `mapAsync(MAP_READ)` and parse the `Float32Array` back into `GPUTriangleError[]`.
5. **Error handling:** If the GPU dispatch fails (device lost, OOM), fall back to CPU error estimation with a console warning. The refinement loop must not crash.

**Buffer lifecycle:** The estimator owns its buffers and destroys them in `destroy()`. The orchestrator creates one `GPUErrorEstimator` per `compute()` call and destroys it at the end.

**Test:** Integration test that creates a GPUErrorEstimator with a mock device, verifies buffer creation, dispatch sizing, and readback parsing. (Full GPU test requires WebGPU environment — mark as `test.skip` if no adapter available.)

#### Task 5.3: Integrate shader into the existing shader assembly pipeline

**Files:**
- Modify: `src/renderers/webgpu/ShaderManager.ts`
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts`

**What:**

1. In `ShaderManager`, add a method `getErrorEstimationWGSL(styleId: number): string` that assembles the error estimation shader by combining:
   - `common.wgsl` (shared math, pot parameters)
   - Stripped style WGSL (only the active style, via `stripShaderCode()`)
   - `error_estimation.wgsl` (the new shader from Task 5.1)

   This mirrors the existing `getStyleEnvironmentWGSL()` pattern.

2. In `ParametricExportComputer`, compile the error estimation shader module once at the start of `compute()` alongside the existing shader modules. Pass it to `GPUErrorEstimator` constructor.

3. The shader assembly ensures all style functions (`style_radius()`, `r_base()`, `compute_outer_radius()`) are available inside the error estimation entry point without any style-specific CPU code.

**Test:** Verify `getErrorEstimationWGSL()` returns valid WGSL that includes both the style functions and the `estimate_triangle_errors` entry point.

#### Task 5.4: Wire `GPUErrorEstimator` into the refinement loop

**Files:**
- Modify: `src/renderers/webgpu/parametric/AdaptiveRefinement.ts`

**What:** Add an optional `gpuEstimator` parameter to `adaptiveRefine()`:

```typescript
export interface RefinementConfig {
    // ... existing fields ...
    /** GPU error estimator — if provided, replaces CPU error estimation. */
    gpuEstimator?: GPUErrorEstimator;
}
```

In the refinement loop, replace the `estimateErrorsGPU` / `estimateErrorsCPU` call with:

```typescript
let errors: TriangleError[];
if (config.gpuEstimator) {
    const gpuErrors = await config.gpuEstimator.estimateErrors(
        curPositions, curUVs, curIndices, tolerances,
        { height: ..., radius: ..., styleId: ... }
    );
    // Map GPUTriangleError[] → TriangleError[] (same shape, direct mapping)
    errors = gpuErrors.map((e, i) => ({
        triangleIdx: i,
        posErrorMm: e.posErrorMm,
        normalErrorDeg: e.normalErrorDeg,
        splitEdge: e.longestMetricEdge,  // GPU already picked the metric-longest edge
        // No need for separate metric scoring — it's baked into the edge selection
    }));
} else {
    errors = config.evaluate
        ? await estimateErrorsGPU(...)
        : estimateErrorsCPU(...);
}
```

**Key benefit:** When the GPU estimator is active:
- Normal error is **true analytic normal error**, not the dihedral heuristic (fixes Bug #1 fully)
- Edge selection uses **metric tensor computed at the surface**, not vertex-averaged metrics (fixes Bug #6 at the source)
- Metric data is always fresh (computed per-dispatch, not cached from iteration 0) — eliminates Bug #3 for the GPU path
- One GPU roundtrip per iteration instead of N evaluatePoints calls + CPU math

**Fallback:** If `gpuEstimator` is null (WebGL fallback, test environment, device lost), the existing CPU path remains unchanged. Phases 1–4 improvements apply to the CPU path.

**Test:** Integration test with a mock `GPUErrorEstimator` that returns canned error values. Verify the refinement loop uses GPU errors for sorting and edge selection when provided.

#### Task 5.5: Orchestrator wiring

**Files:**
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts` (~line 1440-1480)

**What:** In the orchestrator's refinement section:

```typescript
// Create GPU error estimator if we have a device and the flag is enabled
let gpuEstimator: GPUErrorEstimator | undefined;
if (this.device && resolvedFlags.gpuFidelityCheck) {
    const errorShader = shaderManager.getErrorEstimationWGSL(params.styleId);
    const errorModule = this.device.createShaderModule({ code: errorShader });
    gpuEstimator = new GPUErrorEstimator({
        device: this.device,
        shaderModule: errorModule,
        maxTriangles: profile.maxTriangleBudget,
    });
}

// Pass to refinement config
const refineConfig: RefinementConfig = {
    ...existingConfig,
    gpuEstimator,
};

// After refinement, clean up
gpuEstimator?.destroy();
```

**Note:** This reuses the `gpuFidelityCheck` feature flag — when enabled, it now powers both GPU validation (MeshValidator) AND GPU error estimation (GPUErrorEstimator). This is the correct semantic: "use GPU for quality analysis."

**Test:** Verify orchestrator creates/destroys the estimator correctly. Verify feature flag gating.

#### Task 5.6: Benchmark and validate GPU vs CPU error estimation

**Files:**
- Modify: `src/renderers/webgpu/parametric/AdaptiveRefinement.test.ts`

**What:** Add benchmark-style tests that run the same mesh through both CPU and GPU error estimation paths and compare:

1. **Accuracy test:** On a hemisphere mesh (known analytic normals), verify GPU normal error matches the expected value to within 0.5° of the true analytic normal.
2. **Consistency test:** On a production-scale pot mesh, verify GPU and CPU chord errors agree within 10% (they use different methods — GPU evaluates at centroid, CPU at edge midpoint — so exact agreement isn't expected).
3. **Edge selection test:** On an anisotropic mesh, verify GPU selects different split edges than Euclidean-longest in ≥30% of triangles (proving the metric tensor is working).
4. **Performance test (manual):** Log timing for GPU vs CPU path at 50k and 200k triangles. Expected: GPU should be 5–20× faster at 200k triangles due to massively parallel evaluation.

### Phase 6: Advanced — edge collapse (future)

> **Not in scope for this plan** — documented for future reference.

Edge collapse (removing vertices to simplify over-refined regions) is the inverse of splitting. A complete adaptive meshing system needs both operations. This is a significant algorithmic addition that should be a separate plan:

- Half-edge collapse with QEM (Quadric Error Metric) scoring
- Feature-edge preservation during collapse
- Budget-aware: collapse until meeting target triangle count
- Integration with the refinement loop: split under-resolved regions, collapse over-resolved

---

## File Change Summary

| File | Phase | Change |
|---|---|---|
| `AdaptiveRefinement.ts` | 1.1-1.5, 2.1-2.2, 3.1-3.2, 4.1-4.2, 5.4 | Core refinement fixes, enhancements, GPU estimator integration |
| `SurfaceMetric.ts` | 1.2 | Add `metricEdgeLengthSq()` |
| `types.ts` | 4.1 | Add `'diminishing_returns'` stop reason |
| `ParametricExportComputer.ts` | 5.5 | Create/wire/destroy GPUErrorEstimator |
| `ShaderManager.ts` | 5.3 | Add `getErrorEstimationWGSL()` assembly method |
| `error_estimation.wgsl` | 5.1 | New compute shader for per-triangle error estimation |
| `GPUErrorEstimator.ts` | 5.2 | New module: GPU pipeline management for error estimation |
| `ExportDialog.tsx` | 4.3 | Display refinement summary |
| `ExportPanel.tsx` | 4.3 | Forward refinement data |
| `AdaptiveRefinement.test.ts` | 1.1-1.5, 2.1-2.2, 3.1, 4.1, 5.6 | Tests for all phases |

## Priority Order

1. **Phase 1** (bugs): Tasks 1.3, 1.1, 1.2, 1.4, 1.5 — fix correctness
2. **Phase 2** (normals): Tasks 2.1, 2.2 — fix the biggest quality gap
3. **Phase 3** (cleanup): Tasks 3.1, 3.2 — prevent quality degradation
4. **Phase 4** (diagnostics): Tasks 4.1, 4.2, 4.3 — observability
5. **Phase 5** (GPU compute): Tasks 5.1–5.6 — move inner loop to GPU for true analytic error + performance

## Verification

1. `npm run typecheck` — clean (no new errors in modified files)
2. `npm run test` — all AdaptiveRefinement tests pass
3. **Manual:** Export same pot at draft vs standard vs high → each profile produces measurably different mesh (more triangles, lower chord error at higher profiles)
4. **Manual:** Toggle `metricAwareRefinement` on → refinement concentrates near flared walls and deep grooves, not uniformly across the surface
5. **Manual:** Debug tab shows per-iteration convergence data and stop reason
6. **Regression:** Edge-length CV (coefficient of variation) should be lower with metric-aware refinement enabled
7. **Phase 5:** Toggle `gpuFidelityCheck` on → refinement uses GPU error estimation; normal errors are true analytic values (not dihedral proxy); timing is measurably faster at 100k+ triangles
8. **Phase 5:** GPU and CPU paths produce equivalent refinement results on the same input (same triangles split, within tolerance)
