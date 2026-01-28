# STL Pipeline Implementation Roadmap

**Based on Verification of `STL_FIDELITY_REVIEW.md`**
**Date:** January 28, 2026

This document analyzes the "Potential Improvements" suggested in the fidelity review and proposes a prioritized technical roadmap for the `potfoundry-web` export pipeline.

## 1. High-Priority Performance Optimizations

### 1.1 GPU-Driven Indirect Dispatch
**Recommendation:** Replace specific CPU readbacks with `dispatchWorkgroupsIndirect`.
*   **Current State:** The subdivision loop reads the `triangles_next` atomic counter back to the CPU to determine the dispatch size for the next iteration. This introduces a GPU-CPU sync point (pipeline stall) for every subdivision level (typically 4-6 times per export).
*   **Proposed Implementation:** 
    *   Use a buffer with `indirect-compute` usage.
    *   In the `subdivide` shader, use `atomicStore` (or a dedicated kernel) to write the dispatch arguments (x, y, z) directly to this buffer based on the counter value.
    *   Execute `pass.dispatchWorkgroupsIndirect(buffer)`.
*   **Complexity:** Medium (requires WebGPU indirect buffer management).
*   **Benefit:** Estimated 10-20% speedup for high-subdivision exports by removing CPU round-trips.

### 1.2 Persistent Memory Pooling
**Recommendation:** Reuse GPU buffers across export requests.
*   **Current State:** `AdaptiveExportComputer.compute()` appears to allocate fresh buffers (`device.createBuffer`) for vertices, indices, and features on every call. For a 2GB export, this is a massive allocation spike that triggers garbage collection and OS memory zeroing.
*   **Proposed Implementation:**
    *   Implement a `BufferPool` class in `AdaptiveExportComputer`.
    *   Keep `vertices`, `indices`, and `ping-pong` buffers alive between calls.
    *   Only re-allocate if the requested size exceeds current capacity.
*   **Complexity:** Low.
*   **Benefit:** Significant reduction in latency (GC pauses) and smoother UI interaction during repeated "Export" clicks (e.g., tweaking settings).

## 2. Quality & Usability Enhancements

### 2.1 Mesh Quality Diagnostics
**Recommendation:** Calculate and report mesh quality metrics.
*   **Current State:** We report only triangle count and usage. We don't know if we are generating "sliver" triangles (long, thin triangles) which cause printing artifacts.
*   **Proposed Implementation:**
    *   Add a `analyze_quality` compute pass (or fuse into `emit_final`).
    *   Compute Min/Max Angles and Aspect Ratio for each triangle.
    *   Use atomic counters to bin these stats (e.g., "count < 10 degrees").
    *   Report "Mesh Health" in the UI.
*   **Complexity:** Low.
*   **Benefit:** High value for debugging algorithm correctness (`sagitta` tuning) and ensuring printability.

### 2.2 Feature Type Filtering
**Recommendation:** User controls for feature preservation.
*   **Current State:** All detected features > threshold are used.
*   **Proposed Implementation:**
    *   Add checkboxes to UI: `[x] Ridges`, `[x] Valleys`, `[ ] Creases`.
    *   Pass a `featureMask` bitfield uniform to `adaptive_mesh.wgsl`.
    *   Filter during the `snap_vertex` or `compute_importance` phase.
*   **Complexity:** Low.
*   **Benefit:** Gives artists control. Sometimes users want smooth valleys but sharp ridges.

## 3. Long-Term Architectural Improvements

### 3.1 Dynamic / Paged Buffer Management
**Recommendation:** Handle variable sized geometry without hard limits.
*   **Current State:** We hit a `STATUS_TRIANGLE_OVERFLOW` if the mesh grows too large for the pre-allocated buffer.
*   **Analysis:** True "Dynamic" buffers don't exist in WebGPU. "Paged" resources (linked lists of buffers) are complex to render or export (need scatter-gather).
*   **Verdict:** **Lower Priority.** It is better to just implement "Robust Resizing"—if an overflow is detected, catch the error on CPU, double the buffer size, and re-run. This is simpler and effective enough for export tasks.

### 3.2 Improved Seam Stitching
**Recommendation:** Better θ=0 closure.
*   **Current State:** `stitchSeam` in `ConstrainedTriangulator` does a CPU-side position match.
*   **Analysis:** Ideally, the seam would be "sealed" by the triangulation itself (topology) rather than welding vertices later. However, `cdt2d` works on a plane.
*   **Verdict:** **Keep Current Approach.** If the current welding works (which verification suggests it does), a topological rewrite is high-risk for low marginal gain.

## Prioritized Plan

1.  **Immediate Wins (Next Sprint):**
    *   [ ] Implement **Memory Pooling** (Easy, big performance/stability win).
    *   [ ] Add **Feature Type Filtering** (User facing feature).
    *   [ ] Add **Mesh Quality Metrics** (Crucial for verifying "Fidelity").

2.  **Performance Deep Dive:**
    *   [ ] Implement **Indirect Dispatch** (remove CPU stalls).
    *   [ ] Implement **Robust Buffer Resizing** (fix overflow crashes).

3.  **Future:**
    *   [ ] Progressive LOD.
