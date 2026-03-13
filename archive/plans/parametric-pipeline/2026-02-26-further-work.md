# Adaptive Refinement — Further Work Plan

**Date:** 2026-02-26
**Branch:** `refactor/core-migration`
**Prerequisite:** Phases 1–13 complete and reviewed

---

## Current State

The adaptive refinement pipeline now has:
- Error-driven iterative split loop with GPU evaluation
- QEM edge collapse for budget management
- Local and global edge flipping (Delaunay + ODT)
- Local and global Laplacian smoothing with quality constraints
- Seam-safe UV handling (circular mean)
- Metric-aware anisotropic split priority
- Per-edge error estimation (built but not yet wired into main loop)
- Convergence criteria including triangle quality metrics
- Buffer pooling for GPU error estimation
- Quality profiles with progressive iteration caps

**What's missing for "state of the art":**

1. The per-edge error path (`estimateEdgeErrors` + `splitEdgesOverThreshold`) is implemented but not active
2. No boundary-aware smoothing (vertices near seam are fully locked — could be partially smoothed along the seam)
3. No metric-aware collapse (EdgeCollapser uses metric length for priority but not metric-aware validity checks)
4. No mesh quality telemetry/histograms for production monitoring
5. The monolith `webgpu_core.ts` (5500+ lines) remains the #1 maintenance risk

---

## Phase 14: Wire Per-Edge Error Estimation

**Goal:** Replace the per-triangle error → longest-edge-split heuristic with direct per-edge error measurement and splitting.

**Why:** The per-triangle path estimates error at triangle centroids, then splits the longest edge — which may not be the highest-error edge. The per-edge path measures every edge's chord error directly, giving more targeted refinement.

### Task 14.1: Add `perEdgeErrorEstimation` feature flag

**File:** `contracts.ts`
- Add `perEdgeErrorEstimation?: boolean` to `PipelineFeatureFlags`
- Default: `false`

### Task 14.2: Wire per-edge path into `adaptiveRefine`

**File:** `AdaptiveRefinement.ts`

In the main loop, when `config.perEdgeErrorEstimation` is true:
1. Call `estimateEdgeErrors()` instead of per-triangle estimation
2. Call `splitEdgesOverThreshold()` instead of `splitOverThresholdTriangles()`
3. Use `predictedReduction` to filter low-value splits (MIN_REDUCTION_FRACTION already implemented)

### Task 14.3: A/B comparison test

**File:** `AdaptiveRefinement.test.ts`

Add a test that runs the same mesh through both paths and verifies:
- Per-edge path produces equal or lower max error
- Per-edge path uses equal or fewer triangles
- Both paths preserve feature edges

### Task 14.4: Wire flag through ParametricExportComputer

**File:** `ParametricExportComputer.ts`
- Pass `perEdgeErrorEstimation` flag from pipeline config to `RefinementConfig`

---

## Phase 15: Seam-Aware Smoothing

**Goal:** Allow vertices near the seam to smooth along the seam direction (1D constrained smoothing) instead of being fully locked.

**Why:** Currently, `globalSmoothing()` locks ALL vertices with `u < 0.02` or `u > 0.98`. This prevents any quality improvement at the seam. Seam vertices can safely move in the T direction as long as their U is constrained to 0 or 1.

### Task 15.1: Classify seam vertices by type

Vertices near the seam fall into three categories:
1. **Corner vertices** (u ≈ 0 AND t ≈ 0 or 1): fully locked
2. **Seam-interior vertices** (u ≈ 0 or 1, t in interior): can slide along T
3. **Near-seam vertices** (u close to seam but not on it): can smooth with circular U mean

### Task 15.2: Implement 1D seam smoothing

**File:** `AdaptiveRefinement.ts`

In `globalSmoothing()`, instead of skipping seam vertices entirely:
- For seam-interior vertices: average only the T coordinate of neighbors, keep U fixed at 0 or 1
- Reproject via GPU with the constrained UV
- Apply same quality check (reject if min angle worsens)

### Task 15.3: Test seam smoothing

- Test that corner vertices remain fixed
- Test that seam-interior vertex T changes but U remains at 0/1
- Test that smoothing does not create seam gaps

---

## Phase 16: Metric-Aware Collapse

**Goal:** Use the metric tensor in edge collapse decisions so that collapse removes edges that are shortest in metric space, not just QEM-cheapest.

**Why:** The current collapser uses metric length only for priority ranking. The validity checks (link condition, inversion, sliver) operate in 3D Euclidean space. In highly anisotropic regions, an edge that's short in 3D may be long in metric space (and important for surface fidelity).

### Task 16.1: Metric-aware inversion check

**File:** `EdgeCollapser.ts`

In `checkNoInversion()`, additionally check that the collapsed triangle's metric distortion doesn't increase beyond a threshold. A triangle that's well-shaped in 3D but has extreme metric anisotropy post-collapse should be rejected.

### Task 16.2: Metric minimum-edge-length guard

Add a guard: don't collapse an edge if its metric length exceeds `targetEdgeLength * 1.5`. This prevents collapsing edges that are already at or above the target density.

### Task 16.3: Test metric-aware collapse

- Test that edges in high-anisotropy regions are preserved
- Test that edges in isotropic smooth regions are collapsed preferentially

---

## Phase 17: Production Telemetry

**Goal:** Add structured quality telemetry so that production exports can be monitored and debugged.

### Task 17.1: Refinement summary struct

Create a `RefinementSummary` struct that aggregates:
- Per-iteration: triangle count, split count, collapse count, flip count, smooth count, max error, p95 error, min angle, max AR, time
- Overall: total time, stop reason, convergence history
- Quality histogram: binned min-angle distribution (0–10, 10–20, 20–30, ..., 50–60, 60+)

### Task 17.2: Wire telemetry into ParametricExportComputer

Log `RefinementSummary` after refinement completes. Format as structured JSON for log aggregation.

### Task 17.3: Add quality histogram to `computeMeshQuality`

Return angle histogram alongside min/max. This enables monitoring of the full angle distribution, not just the worst case.

---

## Phase 18: Housekeeping

### Task 18.1: Unify seam thresholds

Extract `SEAM_PROXIMITY_THRESHOLD = 0.02` and `SEAM_ZONE = 0.15` into shared constants in `types.ts` or a new `constants.ts`.

### Task 18.2: Remove unused `_evaluateQuadric`

Delete the underscored standalone function from `EdgeCollapser.ts`.

### Task 18.3: Consolidate `oneRing` / `oneRingSet`

Merge into a single function that accepts `Map<number, Iterable<number>>`, or remove the unused Array variant.

### Task 18.4: Fix aspect ratio definition

Replace `maxEdge / minEdge` in `computeMeshQuality` with the standard circumradius-to-inradius ratio. Update tests and tolerance thresholds accordingly.

---

## Priority Order

| Phase | Priority | Effort | Impact |
|-------|----------|--------|--------|
| 18: Housekeeping | High | Small | Reduces tech debt, unblocks linting |
| 14: Per-edge estimation | High | Medium | Direct quality improvement |
| 15: Seam smoothing | Medium | Medium | Quality at seam boundary |
| 17: Telemetry | Medium | Small | Debuggability |
| 16: Metric-aware collapse | Low | Medium | Marginal quality improvement |

Phases 14 and 18 should be done first (highest ROI). Phase 15 is valuable but less urgent since seam quality is already acceptable. Phase 16 is a refinement of a refinement — only worth pursuing if telemetry (Phase 17) shows metric-related quality issues in production.
