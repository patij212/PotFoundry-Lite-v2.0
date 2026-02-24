# Parametric Pipeline Modular Redesign

**Date:** 2026-02-24
**Branch:** `refactor/core-migration`
**Status:** ✅ IMPLEMENTED (Tasks 1-14 complete)
**Goal:** Decompose the 6557-line `ParametricExportComputer.ts` monolith into testable modules, fix 3 critical bugs, and add mesh validation for SLA/resin print readiness.

**Implementation Summary:**
- Monolith reduced from ~5200 lines to ~1400 lines
- 10 sub-modules extracted to `src/renderers/webgpu/parametric/`
- 259 tests (unit + integration) across 9 test files
- 3 bugs fixed: sawtooth spirals (micro-row insertion), seam chain edges (circular wrapping), subdivision chain detection (UV-proximity)
- All changes committed on `refactor/core-migration` branch

## Cross-Reference Contract

This redesign spec is synchronized with:

- `docs/plans/2026-02-24-parametric-pipeline-implementation.md`
- `docs/plans/WebGPU Advanced Tessellation for Precision.md`

Authoritative product target:

- practical “fingerprint-level micro detail + knife-edge macro features” under finite STL constraints
- tolerance-based acceptance with profile-specific gates
- modular, replaceable stages with stable typed contracts

When wording differs across docs, shared tolerance/profile gates and modular stage contracts take precedence.

## Context

The parametric pipeline (v4.0 through v20.2) has evolved through 20+ iterations of tessellation rewrites. Each version fixed one defect while introducing another because the tessellation, optimization, and subdivision stages share mutable state inside a single massive function. The journal documents this cycle clearly.

**Current state (v20.x):**
- Per-row UV snapping (v20.0): grid vertices snapped to chain U positions
- Seam sync (v20.1): U=0/U=1 boundary synchronization
- Shader U wrap (v20.2): prevents NaN from out-of-bounds theta
- GPU-surface subdivision BROKEN (v20.0 removed chain vertex indices that subdivision relied on)
- 135 missing chain edges at seam boundary
- Sawtooth edges on spiraling features (steep chain crossings)

**Constraints (architecture decisions that must NOT be reverted):**
- No `cdt2d` in parametric pipeline (O(n^2), removed v11.1)
- No CDF-adaptive grid spacing (density band artifacts, removed v16.10)
- No stitch fan vertices (ring artifacts, removed v16.9)
- No corridor columns (grid doubling, removed v18.0)
- `CHAIN_LOCK_BAND_HALF_WIDTH = 1` (diagonal crease fix, v16.32)
- `LOCAL_ONLY_OUTER_ADAPTATION = true` (no global grid mutation)
- GPU-evaluated midpoints for subdivision (not 3D chord midpoints, v18.0)

## Precision Requirements (New)

The redesign now explicitly targets tolerance-driven geometric fidelity, not only structural refactor quality.

### Export tolerances by profile

- **Draft**: `eps_pos_mm=0.12`, `eps_normal_deg=8.0`, `eps_feature_mm=0.10`
- **Standard**: `eps_pos_mm=0.08`, `eps_normal_deg=6.0`, `eps_feature_mm=0.06`
- **High**: `eps_pos_mm=0.05`, `eps_normal_deg=4.0`, `eps_feature_mm=0.04`
- **Ultra (SLA-focused)**: `eps_pos_mm=0.03`, `eps_normal_deg=3.0`, `eps_feature_mm=0.02`

These tolerances are hard pass/fail targets for validation. Triangle budget is a cap, not a quality proxy.

## Architecture

### Module Map

```
src/renderers/webgpu/parametric/
  types.ts                  ← EXISTING (shared types + constants)
  SurfaceEvaluator.ts       ← EXISTING (GPU compute wrapper)
  CurvatureSampler.ts       ← EXISTING (stage 1 sampling)
  CurvatureAnalysis.ts      ← NEW (computeRawCurvature, normalize, smooth)
  FeatureDetection.ts       ← NEW (row + column feature detection)
  ChainLinker.ts            ← NEW (chain linking, interpolation, seam wrap)
  GridBuilder.ts            ← NEW (grid dimensions, uniform generation, budget)
  OuterWallTessellator.ts   ← NEW (buildCDTOuterWall, merged row, sweep, UV snap)
  MeshOptimizer.ts          ← NEW (chainDirectedFlip, flipEdges3D, boundary pass)
  MeshSubdivision.ts        ← NEW (GPU-surface subdivision, reworked for v20.x)
  MeshValidator.ts          ← NEW (watertight, normals, degenerate, wall thickness)

src/renderers/webgpu/
  ParametricExportComputer.ts  ← SLIMMED to ~1500 lines (orchestrator + GPU lifecycle)
```

### Function-to-Module Mapping

| Function | Current Lines | Target Module |
|----------|--------------|---------------|
| `computeRawCurvature` | 163-182 | CurvatureAnalysis |
| `normalizeProfile` | 188-205 | CurvatureAnalysis |
| `smoothProfile` | 211-226 | CurvatureAnalysis |
| `detectFeatureEdges` | 315-436 | FeatureDetection |
| `detectRowFeaturesV16` | 2405-2672 | FeatureDetection |
| `detectColumnFeaturesV16` | 2730-2921 | FeatureDetection |
| `detectRowFeatures` (legacy wrapper) | 2674-2689 | FeatureDetection |
| `detectAllRowFeatures` | 2691-2712 | FeatureDetection |
| `detectColumnFeatures` (legacy wrapper) | 2923-2957 | FeatureDetection |
| `detectAndMergeColumnFeatures` | 2959-3147 | FeatureDetection |
| `circularDistance` | 3165-3169 | ChainLinker |
| `circularSignedDelta` | 3171-3176 | ChainLinker |
| `liftUToReference` | 3178-3182 | ChainLinker |
| `unwrapChain` | 3184-3195 | ChainLinker |
| `chainRoughness` | 3197-3209 | ChainLinker |
| `suppressDuplicateChains` | 3211-3264 | ChainLinker |
| `resnapChainToMeasuredPeaks` | 3266-3301 | ChainLinker |
| `postProcessFeatureChains` | 3303-3333 | ChainLinker |
| `linkFeatureChainsCore` | 3335-3484 | ChainLinker |
| `linkFeatureChains` | 3486-3556 | ChainLinker |
| `linkFeatureChainsByKind` | 3558-3634 | ChainLinker |
| `insertChainGuidedRows` | 3636-3806 | ChainLinker |
| `mergeFeaturePositions` | 438-514 | GridBuilder |
| `generateCDFAdaptivePositions` | 516-578 | GridBuilder (retained but unused — doc reference) |
| `generateAdaptiveGrid` | 588-629 | GridBuilder |
| `computeGridDimensions` | 4092-4121 | GridBuilder |
| `downsampleSortedPositions` | 4123-4147 | GridBuilder |
| `buildUnionFeatureGrid` | 3808-4041 | GridBuilder |
| `bsearchFloor` | 665-704 | shared util in types.ts |
| `buildCDTOuterWall` | 706-1449 | OuterWallTessellator |
| `flipFeatureAlignedDiagonals` | 1451-1596 | MeshOptimizer (legacy, may be dead) |
| `prepareStitchVertices` | 1598-1804 | MeshOptimizer (legacy, may be dead) |
| `applyStitchTriangulation` | 1806-1863 | MeshOptimizer (legacy, may be dead) |
| `chainDirectedFlip` | 1894-2141 | MeshOptimizer |
| `flipEdges3D` | 2143-2356 | MeshOptimizer |
| `patchRowFeatures` | 4043-4090 | OuterWallTessellator (legacy, may be dead) |
| `ParametricExportComputer` class | 4151-6557 | Stays in ParametricExportComputer.ts (slimmed) |

### Data Flow Between Modules

```
SurfaceEvaluator.sampleStrip()
    ↓ Float32Array (3D positions per strip)
CurvatureAnalysis.computeRawCurvature() → normalize() → smooth()
    ↓ Float32Array (curvature profiles)
FeatureDetection.detectRowFeaturesV16() + detectColumnFeaturesV16()
    ↓ FeaturePoint[][] (per-row features)
ChainLinker.linkFeatureChainsByKind()
    ↓ FeatureChain[] (linked chains with interpolated points)
GridBuilder.computeGridDimensions() → generateAdaptiveGrid()
    ↓ { unionU: Float32Array, tPositions: Float32Array }
OuterWallTessellator.buildCDTOuterWall(grid, chains, evaluator)
    ↓ { vertices: Float32Array, indices: Uint32Array, quadMap: Int32Array }
MeshOptimizer.optimize(vertices, indices, quadMap, chains)
    ↓ { indices: Uint32Array } (flipped diagonals, boundary reconciliation)
MeshSubdivision.subdivide(vertices, indices, chains, evaluator)
    ↓ { vertices: Float32Array, indices: Uint32Array } (GPU-evaluated midpoints)
AdaptiveRefinement.refineToTolerance(vertices, indices, featureGraph, evaluator, tolerances)
    ↓ { vertices: Float32Array, indices: Uint32Array, metrics } (iterative anisotropic refinement)
MeshValidator.validate(vertices, indices, surfaceConfig)
    ↓ ValidationReport { manifold, normals, degenerates, wallThickness, selfIntersect }
```

Each arrow represents a clean, typed interface. No shared mutable state between modules.

## Phase 1: Extract Modules (Pure Refactoring)

**Rule:** Zero behavior change. Every extracted function keeps its exact signature and implementation. The monolith becomes re-exports from modules.

**Extraction order** (dependencies flow downward — extract leaf modules first):

1. `CurvatureAnalysis.ts` — pure math, no dependencies
2. `FeatureDetection.ts` — depends on CurvatureAnalysis types only
3. `ChainLinker.ts` — depends on FeatureDetection types
4. `GridBuilder.ts` — depends on types only
5. `OuterWallTessellator.ts` — depends on GridBuilder, ChainLinker
6. `MeshOptimizer.ts` — depends on types only
7. `MeshSubdivision.ts` — depends on SurfaceEvaluator

**After extraction:** `ParametricExportComputer.ts` imports from modules and orchestrates the pipeline. All 179+ existing tests must pass unchanged.

## Phase 2: Test Each Module

Each module gets `<Module>.test.ts` with:

| Module | Test Strategy |
|--------|--------------|
| CurvatureAnalysis | Golden-value: known sinusoidal input → expected curvature. Edge cases: flat profile, single-sample, NaN input. |
| FeatureDetection | Per-style: each of 20 styles at standard params → expected peak/valley count ±10%. Edge cases: flat style (ID 0 with nLobes=0), maximum lobe count. |
| ChainLinker | Seam crossing: chain wrapping U≈0→U≈1. Kind separation: peaks and valleys link independently. Interpolation: multi-row gaps filled correctly. |
| GridBuilder | Budget: requested 500K tris → grid dimensions respect budget ±5%. Uniform: all column spacings within 0.1% of each other. |
| OuterWallTessellator | Watertight: every edge has exactly 2 adjacent triangles. Winding: all normals face outward. Vertex range: all indices < vertex count. Per-row snapping: snapped vertices within 1e-6 of chain U. |
| MeshOptimizer | Diagonal consistency: CHAIN_LOCK_BAND prevents flip at ±1 quads (existing test). Flip quality: avg min-angle improves after optimization. |
| MeshSubdivision | On-surface: subdivided vertices within 1e-4 of mathematical surface. No T-junctions: no hanging vertices after subdivision. |
| MeshValidator | Deliberately broken meshes → correct error detection. Clean meshes → pass. |

## Phase 3: Fix Critical Bugs

### Bug 1: Broken Subdivision (MeshSubdivision.ts)

**Root cause:** v20.0 removed chain vertex indices. Subdivision scanned for `vertexIdx >= outerGridVertexCount` to find chain-strip triangles. With per-row UV snapping, all vertices are grid vertices.

**Fix:** Instead of using vertex index to identify feature-adjacent triangles, use the chain UV data:
1. For each triangle, compute its UV centroid
2. Check proximity to any chain point (within 2× grid spacing)
3. Triangles near chains are candidates for subdivision
4. Use GPU-evaluated UV midpoints (v18.0 approach — already correct)

### Bug 2: Sawtooth on Spiraling Features (OuterWallTessellator.ts)

**Root cause:** Per-row UV snapping moves a grid vertex to the chain's exact U. When the chain moves >1 column between adjacent rows, the snapped vertex in row j is at column C, but row j+1 snaps to column C+2. The diagonal between rows creates a zigzag.

**Fix:** Targeted micro-row insertion. When a chain crosses >1 column between rows j and j+1:
1. Insert a single intermediate row at t = (t_j + t_{j+1}) / 2
2. Snap the intermediate row's vertex to the chain's interpolated U at that t
3. This is LOCAL insertion (only adds 1 row per steep crossing, not global)
4. Budget: typically 50-200 micro-rows for spiral styles (negligible vs 180K grid vertices)

### Bug 3: 135 Missing Chain Edges at Seam (ChainLinker.ts)

**Root cause:** Chain wrapping at U≈0/1 boundary. When a chain's U position is near 0 and the next row's position is near 1 (or vice versa), the `circularDistance` check works but the chain edge recording skips these because the signed delta exceeds the seam threshold (0.4).

**Fix:** Seam-crossing chain edges need special handling:
1. Detect seam-crossing pairs: |u1 - u0| > 0.4 (already detected)
2. Instead of skipping, create a wrapped chain edge: split into two edges
   - Edge A: (u0, row_j) → (1.0, row_j+0.5) [hits seam]
   - Edge B: (0.0, row_j+0.5) → (u1, row_j+1) [resumes from seam]
3. Both edges snap to the nearest grid column on their respective sides of the seam

## Phase 4: MeshValidator (3D Print Readiness)

New module that runs as the final pipeline stage. Reports issues but does not auto-fix (repairs are upstream responsibility).

### Checks

1. **Manifold check:** Build edge→face adjacency. Every edge must have exactly 2 faces. Report non-manifold edges with their (u,t) positions.

2. **Normal consistency:** For each triangle, compute face normal via cross product. Check that all normals point outward (dot product with radial direction > 0). Report inverted triangles.

3. **Degenerate check:** Triangles with area < epsilon (1e-10 mm^2). Edges with length < epsilon (1e-6 mm). Report count and positions.

4. **Wall thickness:** For each outer wall vertex, find the corresponding inner wall vertex (same u,t). Compute distance. Report minimum wall thickness. SLA minimum: 0.8mm, FDM minimum: 1.2mm.

5. **Self-intersection (optional, expensive):** BVH-accelerated ray-cast check. Skip by default for exports < 1M tris, run for high-quality exports. Report intersecting triangle pairs.

6. **Geometric fidelity (required for High/Ultra):**
    - Approximate Hausdorff/chord error percentile metrics vs analytic surface
    - Normal error percentile metrics vs analytic surface normals
    - Feature drift distance from linked chain graph

7. **Triangle quality:**
    - Minimum triangle angle
    - Aspect ratio distribution
    - Sliver triangle count

8. **Seam continuity:**
    - Position continuity at U=0/1 for matched rows
    - Normal continuity at U=0/1 for matched rows

### Output

```typescript
interface ValidationReport {
    valid: boolean;
    manifold: { ok: boolean; nonManifoldEdges: number; boundaryEdges: number };
    normals: { ok: boolean; invertedTriangles: number; inconsistentPairs: number };
    degenerates: { ok: boolean; zeroAreaTriangles: number; collapsedEdges: number };
    wallThickness: { ok: boolean; minThicknessMm: number; thinSpots: number };
    fidelity?: {
        ok: boolean;
        p95PosErrorMm: number;
        p999PosErrorMm: number;
        p95NormalErrorDeg: number;
        p999NormalErrorDeg: number;
        maxFeatureDriftMm: number;
    };
    triangleQuality?: {
        ok: boolean;
        minAngleDeg: number;
        maxAspectRatio: number;
        sliverCount: number;
    };
    seam?: {
        ok: boolean;
        maxPositionDiscontinuityMm: number;
        maxNormalDiscontinuityDeg: number;
    };
    selfIntersection?: { ok: boolean; intersectingPairs: number };
    warnings: string[];
}
```

## Phase 5: Adaptive Refinement to Tolerance (New)

### Objective

Guarantee target fidelity with minimal triangles by refining only where error exceeds tolerance.

### Loop

1. Compute local error metrics per triangle (position + normal)
2. Mark over-threshold triangles
3. Split triangles anisotropically (along principal curvature direction)
4. Reproject new vertices via GPU surface evaluator
5. Legalize and optimize with constrained edges preserved
6. Repeat until all triangles pass or `max_refine_iters` is reached

### Guardrails

- Preserve constrained feature edges (ridges/valleys/creases)
- Preserve seam periodicity as a topological invariant
- Abort refinement if memory cap is exceeded and return explicit quality downgrade warning

## Style-Specific Considerations

The pipeline must handle all 20 styles mathematically. Key challenges per style category:

| Style Category | Styles | Challenge |
|---------------|--------|-----------|
| **High-frequency radial** | Superformula(0), HarmonicRipple(4), WaveInterference(6), RippleInterference(11) | Many peaks close together → chain linking must not merge adjacent features |
| **Spiraling** | SpiralRidges(2), DragonScales(9) | Features rotate with height → steep U-shift per row → sawtooth bug |
| **Segmented** | GothicArches(5), BambooSegments(10) | Sharp discontinuities (non-C1) → feature detection must handle cusps, not just smooth peaks |
| **2D texture** | Gyroid(12), Voronoi(13), BasketWeave(14), HexHive(16) | Features in BOTH U and T directions → need column-direction feature detection (currently disabled in LOCAL_ONLY mode) |
| **Low-frequency** | Superellipse(3), ArtDeco(8), GeometricStar(15), CelticKnot(17,18), LowPoly(19) | Few features but sharp → high precision needed at each feature, uniform grid elsewhere |

### Mathematical Precision Requirements

For each style, the exported mesh must satisfy:
- **Feature position error < 0.1mm** at typical pot radius (50mm). This means chain U detection must be accurate to 0.1/314 ≈ 0.0003 in U-space.
- **Surface normal error < 5 degrees** between mesh normals and analytical surface normals. This drives minimum triangle density at high-curvature regions.
- **No visible faceting** at print resolution (0.05mm layer height for SLA). This means triangle edge length < 2mm in regions visible to the eye (roughly < 45 degree incidence angle).

Additional requirements for High/Ultra:
- **Seam continuity error < 0.02mm** in position and <2° in normal
- **Max feature drift < 0.02mm** for ridge/crease chains
- **Min angle >= 22°** after optimization (except explicitly exempted boundary triangles)

## Implementation Plan

| Step | Scope | Risk | Test Gate |
|------|-------|------|-----------|
| 1a | Extract CurvatureAnalysis | None (pure math) | 179 tests pass |
| 1b | Extract FeatureDetection | Low (many functions, clear boundaries) | 179 tests pass |
| 1c | Extract ChainLinker | Medium (circular math, seam handling) | 179 tests pass + new chain tests |
| 1d | Extract GridBuilder | Low (pure math) | 179 tests pass |
| 1e | Extract OuterWallTessellator | High (largest module, most state) | 179 tests pass + watertight test |
| 1f | Extract MeshOptimizer | Medium (shared quadMap state) | 179 tests pass + diagonal test |
| 1g | Extract MeshSubdivision | Medium (GPU interaction) | 179 tests pass |
| 2 | Add per-module tests | None (test-only) | All new tests pass |
| 3a | Fix subdivision | Medium | Subdivision produces on-surface vertices |
| 3b | Fix sawtooth spirals | Medium | Spiral styles export without zigzag |
| 3c | Fix seam chain edges | Low | 0 missing chain edges |
| 4 | Add MeshValidator | None (new module) | Validator catches known-bad meshes |

## Risk Mitigation

- **Each extraction step is a separate commit.** If extraction N breaks something, revert N only.
- **The orchestrator (`ParametricExportComputer.ts`) re-exports all public types** from the old location so downstream consumers don't break.
- **No behavior changes in Phase 1.** The test suite is the safety net.
- **Dead code audit:** Functions like `flipFeatureAlignedDiagonals`, `prepareStitchVertices`, `applyStitchTriangulation`, `patchRowFeatures` are likely unused. Confirm via grep before deleting.

## Success Criteria

1. `ParametricExportComputer.ts` < 1500 lines (currently 6557)
2. All 20 styles export valid STL at all quality presets (draft/standard/high/ultra)
3. MeshValidator reports `valid: true` and geometric fidelity passes profile tolerance gates
4. No visual regressions in any style (A/B comparison with v20.x output)
5. High profile export time within 20% of current performance; Ultra may exceed this with warning
6. All exports load in PrusaSlicer + ChiTuBox without repair warnings
7. Seam continuity and feature drift metrics remain below profile thresholds

## Reality Check (explicit)

Finite STL tessellation cannot produce mathematically perfect infinite sharpness and infinite smoothness simultaneously. The practical target is to be visually indistinguishable from analytic geometry at print/display resolution by enforcing strict error bounds and constrained feature preservation.

## Phase 6: UV Metric-Space Refinement (Required for High/Ultra)

### Why this is needed

Uniform UV spacing does not map to uniform 3D triangle size on flared walls, deep grooves, or sharp ridges. This creates stretched triangles, visible faceting, and inconsistent feature preservation.

### Surface metric model

Let the analytic surface be `X(u, v)`.

- Jacobian: `J = [Xu Xv]`
- First fundamental form: `G = J^T J = [[E, F], [F, G]]`
- Local 3D length from UV offset `dξ = [du, dv]^T`:
  - `|dx|^2 ~= dξ^T G dξ`

This metric defines how UV distances must be scaled to represent true 3D distances.

### Refinement policy

1. Build per-sample metric tensor `G(u, v)` from `SurfaceEvaluator`
2. Eigendecompose `G` to get principal stretches `σ1, σ2`
3. Convert target 3D edge size `l_target` to UV step bounds:
    - `h1 = l_target / σ1`, `h2 = l_target / σ2`
4. Refine triangles using metric-length criterion `dξ^T M dξ` (anisotropic)
5. Reproject inserted vertices to analytic surface via GPU evaluator
6. Stop only when position/normal tolerance gates pass

### Integration points

- `AdaptiveRefinement.ts`: own metric construction and split decisions
- `MeshSubdivision.ts`: use metric-aware split candidates instead of UV-only spacing
- `OuterWallTessellator.ts`: seed with metric-aware initial row/column density
- `MeshValidator.ts`: add metric-distortion diagnostics (`p95`, `p999`)

### New validation metrics

- `uvMetricDistortion.p95StretchRatio` and `p999StretchRatio`
- `edgeLength3D.p95` vs target edge length
- `featureEdgeEdgeLength3D.p95` for constrained ridges

Pass criteria for High/Ultra:

- High: `p95StretchRatio <= 1.8`, `p999StretchRatio <= 3.0`
- Ultra: `p95StretchRatio <= 1.5`, `p999StretchRatio <= 2.5`
- Feature-edge drift and normal targets remain within profile tolerances

## Additional Gaps to Close (State-of-the-Art Checklist)

1. **Curvature-only detection is insufficient for hard edges**
    - Add explicit style-driven crease tags (CAD-like smoothing groups)
2. **No guaranteed sliver suppression after repeated refinement**
    - Enforce post-refinement min-angle optimization each iteration
3. **Topology checks exist, but print-process checks are limited**
    - Add overhang/island risk analysis for SLA/FDM guidance (warning-only)
4. **Global memory guardrail is present, but no graceful fallback strategy**
    - Add deterministic quality downgrade ladder (`ultra -> high -> standard`)
5. **Validation lacks local visual-risk focus**
    - Add highlight-risk metric using normal variation in high-specular regions

## Updated State-of-the-Art Acceptance

The pipeline is considered state-of-the-art for this product scope only if:

1. Tolerance gates pass (`pos`, `normal`, `feature`) for all styles at selected profile
2. UV metric-distortion gates pass at `p95` and `p999`
3. Constrained feature edges remain locked through all refinement stages
4. Seam periodic continuity remains below threshold in both position and normal
5. Exports are repair-free in downstream slicers without manual fix-ups

## Modular Evolution Protocol (Maintainable + Expandable)

To keep the refactor durable and easy to extend:

1. **Stable stage contracts first**
    - Each stage exposes a typed contract (`input`, `output`, `metrics`)
    - No stage reaches into another stage’s internals

2. **Versioned data contracts**
    - Add a lightweight contract version for major stage I/O changes
    - Keep orchestrator backward-compatible through adapters during migrations

3. **Feature-flagged advanced algorithms**
    - Experimental paths (for example MDC-inspired simplification controls) must be opt-in
    - Default path remains stable until validator + fidelity tests pass

4. **Deterministic downgrade behavior**
    - Memory/time pressure triggers explicit profile ladder (`ultra -> high -> standard`)
    - Export report must include downgrade reason and final achieved gates

5. **Regression gates are release blockers**
    - Topology + fidelity + seam continuity + distortion + triangle quality all required
    - No merge for visual-quality improvements without benchmark snapshot updates
