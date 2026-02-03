# PotFoundry Performance Optimization Guide

**Version:** 3.1.0 (WebGPU Era)
**Last Updated:** February 2026

This guide explains the performance characteristics and optimizations of the PotFoundry Web Application.

---

## 1. WebGPU Performance Targets

| Scenario | Resolution | Target Frame Time | Status |
|---|---|---|---|
| **Preview** | High (252x126) | < 16ms (60fps) | ✅ Passing |
| **Interaction** | Camera Rotate | < 8ms (120fps) | ✅ Passing |
| **Export** | Ultra (8k x 4k) | < 2000ms | ⚠️ Optimization Needed |

---

## 2. Core Optimization Techniques

### 2.1 The Compute Pipeline
We move heavy vertex calculations to the GPU via Compute Shaders (`evaluate_vertices` in WGSL).
*   **Parallelism**: Instead of looping 50,000 times in JS, we dispatch 50,000 threads.
*   **Result**: Instant parameter updates.

### 2.2 Buffer Management
*   **Mapped Buffers**: We minimize CPU-GPU bandwidth usage. Buffers are usually `STORAGE` or `UNIFORM`.
*   **Zero-Copy**: Where possible, we update data in place.

---

### 2.3 Export Optimization (CPU/WASM)
Since Export happens on the CPU (for now) to ensure watertightness:
1.  **TypedArrays**: All mesh data is `Float32Array`.
2.  **Pre-allocation**: Arrays are allocated once at max size, not pushed to.
3.  **Binary STL**: We write directly to a binary buffer, 10x faster than ASCII.

---

## 3. Profiling Methods

### 3.1 Chrome Performance Tab
*   Look for "Animation Frame Fired".
*   If `scripting` > 10ms, React is too slow.
*   If `rendering` > 10ms, WebGL/WebGPU dispatch is too heavy.

### 3.2 GPU Timing
WebGPU offers Timestamp Queries (ext: `timestamp-query`) to measure exact GPU duration.
*   *Note*: Enabled only in dev builds due to browser privacy restrictions.

---

## 4. Known Bottlenecks

### 4.1 "The Seam"
Calculating the seam (0° vs 360°) requires special logic in the shader to avoid Z-fighting or gaps. This adds a branching `if/else` which diverts threads.
*   *Optimization*: Use branchless math where possible (`step()`, `mix()`).

### 4.2 Large Exports
Exporting >2M triangles creates massive JS arrays (hundreds of MBs).
*   *Fix*: Future plan to use Streaming WASM or Compute Shader readback.

---

**Last Updated:** Feb 2026
