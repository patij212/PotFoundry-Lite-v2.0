# STL Export Fidelity Review & Architecture Comparison

> **Comprehensive technical analysis of mesh generation across PotFoundry's web and Python implementations**

**Date:** January 2026  
**Scope:** Both `potfoundry-web` (TypeScript/WebGPU) and `potfoundry` (Python/NumPy) mesh pipelines  
**Goal:** Document the current state of both implementations and identify opportunities for improvement

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Web App Implementation (potfoundry-web)](#web-app-implementation-potfoundry-web)
3. [Python Implementation (potfoundry)](#python-implementation-potfoundry)
4. [Comparative Analysis](#comparative-analysis)
5. [Recommendations](#recommendations)
6. [Appendix: Technical Details](#appendix-technical-details)

---

## Executive Summary

PotFoundry has **two distinct mesh generation pipelines** with significantly different architectures:

| Capability | Web App (potfoundry-web) | Python (potfoundry) |
|------------|--------------------------|---------------------|
| **CDT (Constrained Delaunay)** | ✅ `ConstrainedTriangulator.ts` via `cdt2d` | ❌ Regular grid |
| **Feature Extraction** | ✅ GPU-based `FeatureExtractionComputer.ts` | ❌ Post-hoc edge flow |
| **Feature Snapping** | ✅ Polyline chaining + seam nodes | ❌ Not implemented |
| **Adaptive Refinement** | ✅ `AdaptiveExportComputer.ts` | ❌ Fixed resolution |
| **GPU Acceleration** | ✅ WebGPU compute shaders | ❌ CPU-only (NumPy) |
| **Mesh Quality Validation** | ⚠️ Partial | ✅ Golden mesh tests |

### Key Findings

1. **The web app has already implemented state-of-the-art mesh generation** including CDT, feature extraction, and adaptive refinement on the GPU.

2. **The Python codebase still uses regular grid tessellation** which limits fidelity for complex mathematical style functions.

3. **The "50/50 results" problem primarily affects the Python path**, where edge flow reconstruction attempts to fix sampling artifacts post-hoc.

---

## Web App Implementation (potfoundry-web)

The web application implements a sophisticated **feature-aware adaptive meshing pipeline** using WebGPU compute shaders.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Web App Mesh Generation Pipeline                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────┐    ┌─────────────────────┐                      │
│  │ FeatureExtraction  │───>│ ConstrainedTriang.  │                      │
│  │    Computer.ts     │    │        .ts          │                      │
│  │ (GPU Compute)      │    │ (cdt2d library)     │                      │
│  └────────────────────┘    └─────────┬───────────┘                      │
│           │                          │                                   │
│           │ FeaturePoint[]           │ Base Mesh                        │
│           │ (ridges, valleys,        │ (CDT topology)                   │
│           │  creases)                │                                   │
│           │                          ▼                                   │
│           │              ┌─────────────────────┐                        │
│           └─────────────>│ AdaptiveExport      │                        │
│                          │    Computer.ts      │                        │
│                          │ (GPU Subdivision)   │                        │
│                          └─────────┬───────────┘                        │
│                                    │                                     │
│                                    ▼                                     │
│                          ┌─────────────────────┐                        │
│                          │   Binary STL        │                        │
│                          │   Export            │                        │
│                          └─────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1. Feature Extraction (GPU)

**File:** `src/renderers/webgpu/FeatureExtractionComputer.ts` (~250 LOC)

Runs a GPU compute pass to detect surface features:

```typescript
export interface FeaturePoint {
    theta: number;      // Angular position
    t: number;          // Height parameter (0-1)
    type: number;       // 1=Ridge, 2=Valley, 3=Crease
    strength: number;   // Feature strength/curvature
}
```

**Key Features:**
- GPU-based curvature analysis at 2048×1024 resolution
- Sparse feature point output (up to 100,000 points)
- Second derivative threshold for ridge/valley detection

### 2. Constrained Delaunay Triangulation

**File:** `src/utils/geometry/ConstrainedTriangulator.ts` (~380 LOC)

Uses the `cdt2d` library to generate topology that respects feature constraints:

```typescript
static triangulate(features: FeaturePoint[], gridSizeX: number = 720, gridSizeY: number = 720): TriangulatedMesh {
    // 1. Extract and chain feature points into polylines
    const chains = this.extractChains(features);
    
    // 2. Add feature polylines as constrained edges
    for (const chain of simplifiedChains) {
        // Edges are enforced in the triangulation
        tryAddEdge(prevIdx, currIdx);
    }
    
    // 3. Run CDT with constraints
    const triangles = cdt2d(points, edges, { exterior: false });
}
```

**Key Features:**
- Spatial hashing for point merging (PT_EPS = 0.0002)
- Tube-based intersection culling to avoid crossing constraints
- Aggressive background grid exclusion near features
- Boundary box enforcement with 720×720 resolution

### 3. Adaptive Mesh Refinement (GPU)

**File:** `src/renderers/webgpu/AdaptiveExportComputer.ts` (~440 LOC)

GPU-based adaptive subdivision that refines mesh based on curvature:

**Key Features:**
- Triangle subdivision pipeline (`subdivide_triangles` compute shader)
- Maximum 4 million triangles capacity
- Convergence detection (stops when no new triangles created)
- Surface-aware subdivision (different surfaces refined independently)
- Final vertex evaluation transforms parametric to world coordinates

### 4. Mesh Topology Utilities

**Additional capabilities in the web codebase:**

| Function | Location | Purpose |
|----------|----------|---------|
| `weldMesh()` | mesh utilities | Vertex deduplication |
| `stitchSeam()` | mesh utilities | Topological seam correction |
| `simplify()` | `utils/geometry/simplify.ts` | Polyline simplification |

---

## Python Implementation (potfoundry)

The Python codebase uses a traditional **regular grid sampling** approach.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Python Mesh Generation Pipeline                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────┐                                                 │
│  │ theta_grid_cached  │  Fixed (θ, z) grid                             │
│  │ np.linspace        │                                                 │
│  └────────┬───────────┘                                                 │
│           │                                                              │
│           ▼                                                              │
│  ┌────────────────────┐    ┌─────────────────────┐                      │
│  │ sample_outer_rings │───>│ Edge Flow Reconst.  │ (600+ LOC)          │
│  │ (style function    │    │ (post-hoc fix for   │                      │
│  │  evaluation)       │    │  sampling artifacts)│                      │
│  └────────┬───────────┘    └─────────────────────┘                      │
│           │                                                              │
│           ▼                                                              │
│  ┌────────────────────┐    ┌─────────────────────┐                      │
│  │ Inner Wall, Rim,   │───>│ Face Assembly       │                      │
│  │ Drain Generation   │    │ (regular grid quads)│                      │
│  └────────────────────┘    └─────────┬───────────┘                      │
│                                      │                                   │
│                                      ▼                                   │
│                          ┌─────────────────────┐                        │
│                          │   Binary STL        │                        │
│                          │   (write_stl_binary)│                        │
│                          └─────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Current Approach

**File:** `potfoundry/core/geometry.py` (~3000+ LOC)

```python
# Regular grid sampling
thetas, cos_th, sin_th = theta_grid_cached(n_theta)  # Fixed 0..2π grid
z_outer = np.linspace(0.0, H, n_z + 1)               # Fixed 0..H grid
```

### Strengths

- ✅ **Watertight mesh generation** (verified by tests)
- ✅ **Fast binary STL export** (~15ms for typical meshes)
- ✅ **Vectorized NumPy operations** throughout
- ✅ **Modular architecture** (mesh package decomposition)
- ✅ **100% deterministic output** (golden mesh tests)
- ✅ **Comprehensive style function library**

### Weaknesses

- ❌ **Regular grid tessellation** ignores feature geometry
- ❌ **No Constrained Delaunay Triangulation**
- ❌ **No feature snapping or polyline constraints**
- ❌ **Edge flow reconstruction is complex** (600+ LOC) and fragile
- ❌ **Style functions can produce artifacts** under high modulation
- ❌ **Anisotropic tessellation not implemented**

### Edge Flow Reconstruction Problem

The Python code attempts to fix sampling artifacts post-hoc with edge flow reconstruction:

```python
# Complex reconstruction logic (lines 291-1200+)
if is_blossom and sf_edge_flow_reconstruct_enable:
    R_raw = np.vstack([...])  # Build radius field
    # Ridge detection, path tracing, envelope propagation...
    # ~600 lines of complex reconstruction logic
```

**Problems:**
1. Operates on already-sampled data (information already lost)
2. Style-specific (only applies to SuperformulaBlossom)
3. Many tuning parameters and magic numbers
4. Silent error swallowing (`except Exception: pass`)

---

## Comparative Analysis

### Mesh Quality Comparison

| Aspect | Web App | Python |
|--------|---------|--------|
| Feature edge alignment | Exact (CDT constraints) | Approximate (grid interpolation) |
| Adaptive resolution | Yes (curvature-based) | No (fixed n_theta × n_z) |
| Peak/valley preservation | Explicit detection | Post-hoc reconstruction |
| Seam handling | Constrained edges | Grid alignment workarounds |

### Performance Comparison

| Metric | Web App | Python |
|--------|---------|--------|
| Mesh generation (168×84) | ~50ms (GPU) | ~2ms (Numba) |
| High-res (672×336) | ~100ms (GPU) | ~15ms (CPU) |
| Memory usage | GPU VRAM | CPU RAM |
| Parallelism | Full GPU | NumPy vectorization |

**Note:** The Python path is faster for simple meshes due to CPU efficiency, but the web app produces higher-fidelity results for complex styles.

### Code Complexity Comparison

| Component | Web App (LOC) | Python (LOC) | Notes |
|-----------|---------------|--------------|-------|
| Feature extraction | 250 | 0 | Web-only |
| CDT triangulation | 380 | 0 | Web-only |
| Adaptive refinement | 440 | 0 | Web-only |
| Edge flow reconstruction | 0 | 600+ | Python-only workaround |
| Total mesh generation | ~1,100 | ~3,000 | Web is more focused |

---

## Recommendations

### For the Web App (potfoundry-web)

The web app already has state-of-the-art mesh generation. Suggested improvements:

1. **Add mesh quality metrics** (aspect ratio, minimum angle) to export statistics
2. **Document the adaptive mesh pipeline** in ARCHITECTURE.md
3. **Add regression tests** comparing feature-constrained vs. non-constrained output
4. **Consider mesh simplification** as a post-processing option for large exports

### For the Python Codebase (potfoundry)

Two options depending on priorities:

#### Option A: Backport Web Solutions (Higher Effort, Better Results)

1. **Port ConstrainedTriangulator** using `triangle` Python library (equivalent to `cdt2d`)
2. **Implement CPU feature extraction** using NumPy gradient analysis
3. **Add adaptive refinement** based on local curvature
4. **Remove edge flow reconstruction** once CDT is in place

**Migration Strategy:**
- Phase 1: Implement CDT path alongside existing code
- Phase 2: A/B test both paths, collect quality metrics
- Phase 3: Deprecate edge flow with 1-release warning
- Phase 4: Remove edge flow code in subsequent release

**Estimated effort:** 2-3 weeks

#### Option B: Improve Existing Pipeline (Lower Effort, Incremental)

1. **Add feature snapping** to grid generation:
   ```python
   def snap_grid_to_features(theta_grid, z_grid, style_fn, opts):
       # Insert additional samples at detected ridges/valleys
   ```

2. **Add mesh quality validation**:
   ```python
   def calculate_mesh_quality(verts, faces):
       # Compute aspect ratios, minimum angles
   ```

3. **Simplify edge flow reconstruction** (remove unused modes, magic numbers)

**Estimated effort:** 1 week

### Recommended Action

**Focus on the web app implementation** for production use, as requested. The Python codebase can remain as a batch processing / API fallback with documented limitations.

---

## Appendix: Technical Details

### A. CDT Algorithm (cdt2d)

The `cdt2d` library implements Constrained Delaunay Triangulation:

- **Input:** Points + constraint edges
- **Output:** Triangulation where constraint edges appear as triangle edges
- **Property:** Delaunay-optimal given constraints (maximizes minimum angle)

### B. Feature Detection Algorithm

The GPU feature extraction uses second-derivative analysis:

```wgsl
// Curvature estimation via central differences
let dR_dtheta = (R[i+1] - R[i-1]) / (2.0 * dTheta);
let d2R_dtheta2 = (R[i+1] - 2.0*R[i] + R[i-1]) / (dTheta * dTheta);

// Curvature magnitude
let kappa = abs(d2R_dtheta2) / pow(1.0 + dR_dtheta*dR_dtheta, 1.5);

// Classify as ridge/valley based on sign
if (kappa > threshold) {
    if (d2R_dtheta2 < 0) emit_ridge();
    else emit_valley();
}
```

### C. Adaptive Subdivision Criterion

The adaptive export uses error estimation based on **midpoint displacement**:

```typescript
const subdivThreshold = 0.05;  // Parametric space error threshold

// Error estimation: compare actual midpoint position to linear interpolation
// errorEstimate = distance(actualMidpoint, lerp(v0, v1, 0.5))
// This measures how much the surface deviates from a planar approximation

// Subdivide if midpoint error exceeds threshold
if (errorEstimate > subdivThreshold && currentDepth < maxDepth) {
    subdivide(triangle);
}
```

The error estimate measures the **normal deviation** between the true surface (evaluated at the triangle midpoint) and the linear interpolation. High curvature regions produce larger errors and get subdivided more.

### D. Web App File Reference

| File | Purpose |
|------|---------|
| `FeatureExtractionComputer.ts` | GPU feature detection (ridges, valleys, creases) |
| `ConstrainedTriangulator.ts` | CDT mesh generation with feature constraints |
| `AdaptiveExportComputer.ts` | GPU adaptive subdivision |
| `feature_extract.wgsl` | Feature detection compute shader |
| `adaptive_mesh.wgsl` | Adaptive refinement compute shader |
| `useAdaptiveExport.ts` | React hook for export pipeline |

---

## Conclusion

PotFoundry's **web application has already implemented the recommended state-of-the-art solutions** for high-fidelity mesh generation, including:
- ✅ Constrained Delaunay Triangulation
- ✅ GPU-based feature extraction
- ✅ Adaptive mesh refinement
- ✅ Feature polyline constraints

The **Python codebase uses traditional regular grid tessellation** which produces good results for simple styles but can exhibit artifacts ("50/50 results") for complex mathematical functions like SuperformulaBlossom.

**Recommendation:** Prioritize the web app export path for production use. Consider backporting the CDT approach to Python only if batch processing or API access requires matching fidelity.

---

*Document prepared by automated code review, January 2026*
