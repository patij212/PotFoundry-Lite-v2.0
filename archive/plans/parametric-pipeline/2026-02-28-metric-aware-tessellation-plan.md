# Metric-Aware Tessellation: Threading Surface Metrics Into the Parametric Pipeline

**Date**: 2026-02-28
**Branch**: `refactor/core-migration`
**Goal**: Give the triangulation stage the information and tools (surface metrics, companion vertices) it needs to produce good triangles the first time — eliminating the need for extensive post-hoc repair.

---

## 1. Problem Statement

The parametric export pipeline builds an outer-wall mesh in two disconnected phases:

1. **Blind tessellation** (Phase 3–4): A uniform grid is built, chain vertices are inserted, and a monotone sweep triangulates the result — all in UV space with zero knowledge of 3D surface geometry.
2. **Reactive repair** (Phase 5–6): After GPU evaluation provides 3D positions, a cascade of post-hoc passes (edge flipping, subdivision, adaptive refinement) attempts to fix topology that was structurally wrong from the start.

This architecture produces **blade triangles** (aspect ratio 5-20:1, min angle ~5°) at every chain-grid boundary. The sweep creates fan topology around chain vertices, and no amount of edge flipping can fix a fan — only vertex insertion can break it.

Meanwhile, the system already computes a rich `SurfaceMetric` tensor field with Jacobian-based anisotropic stretch information — but only uses it in Phase 6 (adaptive refinement) and Phase 7 (validation), long after the damage is done.

### What "Fingerprint on a Knife's Edge" Means

- **Feature edges** (ridges, valleys) must be continuous mesh edges — achieved today via chain constraints
- **Bridging triangles** from feature edges to the surrounding grid must be well-shaped (min angle > 20°, aspect < 3:1)
- **Triangle orientation** should follow the surface's principal stretch directions
- **No visible artifacts** at chain-grid boundaries — smooth normal transitions, uniform triangle sizing

---

## 2. Architecture Overview

### Current Pipeline

```
Phase 1   GPU curvature sampling
Phase 2   CPU feature detection (peaks/valleys)
Phase 3   CPU grid + chain insertion + BLIND tessellation ← PROBLEM
Phase 4   GPU evaluation → 3D positions
Phase 5   Post-hoc repair (flip, strip-opt, subdivide)
Phase 6   Adaptive refinement (metric-aware, flag-gated)
Phase 7   Validation (metric-aware, flag-gated)
```

### Proposed Pipeline

```
Phase 1     GPU curvature sampling
Phase 2     CPU feature detection
Phase 3a    CPU grid construction
Phase 3b    CPU companion vertex insertion around diagonal chains  ← NEW
Phase 3c    CPU tessellation (existing sweep, now with companions)
Phase 4     GPU full-mesh evaluation → final 3D positions
Phase 4b    CPU metric field computation from evaluated mesh       ← NEW (future)
Phase 5     Metric-aware topology optimization                     ← ENHANCED (future)
Phase 6     Adaptive refinement (already metric-aware)
Phase 7     Validation (already metric-aware)
```

The key insight: **insert companion vertices alongside diagonal chain edges to give the sweep good topology from the start**. Diagonal chain edges are geometrically correct (they follow the true feature path) — the problem is that the sweep lacks nearby vertices and fans out to distant grid corners. Companions provide those nearby vertices.

> **Staircase decomposition was considered and rejected.** Replacing diagonal interpolated edges with vertical+horizontal "staircase" segments would create visible sawtooth artifacts along feature edges. The diagonal interpolation correctly approximates the smooth feature path and must be preserved.

---

## 3. Implementation Phases

### Phase 1: Metric Field Infrastructure (Foundation)

**Goal**: Create a `MetricFieldProvider` that can supply metric tensors at arbitrary UV points, computed from a pilot mesh.

#### 3.1.1 New file: `src/renderers/webgpu/parametric/MetricFieldProvider.ts`

This module wraps `SurfaceMetric` functions into a clean provider interface for use by tessellation and optimization stages.

```typescript
/**
 * MetricFieldProvider — Grid-sampled surface metric for pre-tessellation decisions.
 *
 * Wraps SurfaceMetric's buildMetricField + interpolateMetric into a provider
 * that any pipeline stage can query for the metric tensor at arbitrary UV points.
 *
 * Usage:
 *   1. Build from a pilot mesh: MetricFieldProvider.fromMesh(positions, uvs, indices)
 *   2. Query: provider.getMetricAt(u, t) → MetricTensor
 *   3. Query: provider.getStretchAt(u, t) → PrincipalStretches
 *   4. Query: provider.metricLength(u0, t0, u1, t1) → number (3D-aware distance)
 *   5. Query: provider.idealEdgeLength(u, t) → number (target edge size at point)
 */

export interface MetricFieldProvider {
    /** Interpolated metric tensor at (u, t). */
    getMetricAt(u: number, t: number): MetricTensor;

    /** Principal stretches and anisotropy at (u, t). */
    getStretchAt(u: number, t: number): PrincipalStretches;

    /** Metric-weighted distance between two UV points. */
    metricLength(u0: number, t0: number, u1: number, t1: number): number;

    /** Target edge length (in UV) at (u, t) for the given triangle budget. */
    idealEdgeLengthUV(u: number, t: number): number;

    /** Grid resolution. */
    readonly resU: number;
    readonly resT: number;

    /** Global statistics. */
    readonly stats: MetricFieldStats;
}

export interface MetricFieldStats {
    meanAnisotropy: number;
    maxAnisotropy: number;
    p95Anisotropy: number;
    meanStretch: number;      // average of sigma1
    totalSurfaceArea: number; // mm²
    targetEdgeLength3D: number; // mm (from budget)
}
```

**Key functions to implement:**

1. `buildMetricFieldProvider(positions, uvs, indices, indexCount, triangleBudget, resU?, resT?)`:
   - Calls `computeVertexMetrics()` → per-vertex E, F, G
   - Calls `buildMetricField()` → grid-sampled MetricField
   - Calls `estimateSurfaceArea()` → total area
   - Calls `targetEdgeLength()` → target edge size
   - Computes anisotropy stats via `eigenDecompose()` on sampled grid cells
   - Returns a `MetricFieldProvider` object

2. `idealEdgeLengthUV(u, t)`:
   - Gets metric at (u, t), computes √(E) and √(G) (stretch in u and t directions)
   - Returns `targetEdgeLength3D / max(√E, √G)` — the UV-space edge length that maps to the target 3D edge length

**File dependencies**: `SurfaceMetric.ts` (all existing functions), `types.ts` (MetricTensor, PrincipalStretches)

**Tests**: `MetricFieldProvider.test.ts` (~15 tests)
- Identity metric → idealEdgeLength = targetLength
- High stretch → smaller idealEdgeLength (more triangles)
- Anisotropic region → principal directions correct
- Bilinear interpolation smooth across cell boundaries
- Stats computation correct (area, anisotropy)

---

### Phase 2: Pilot Mesh Evaluation (Pipeline Change)

**Goal**: Add a lightweight GPU evaluation of the base grid BEFORE chain insertion, to provide 3D positions for metric computation.

#### 3.2.1 Changes to `ParametricExportComputer.ts`

**New step between grid construction and outer wall tessellation** (after line ~1140, before `buildCDTOuterWall` call at line ~1144):

```typescript
// ── Phase 3b: Pilot evaluation ──
// Evaluate the base grid (no chains) to get 3D positions for metric field.
// This is a lightweight dispatch: only grid vertices, no chain vertices.
const pilotStart = performance.now();
const pilotPositions = await this.evaluatePoints(
    baseGridUVs,      // UV coordinates of grid-only vertices
    uniformBuffer, styleParamBuffer,
    /* ... standard dummy buffers ... */
    false, 0           // no snap, no relax
);
const pilotMs = performance.now() - pilotStart;

// ── Phase 3c: Metric field computation ──
const metricStart = performance.now();
const metricProvider = buildMetricFieldProvider(
    pilotPositions,
    baseGridUVs,
    baseGridIndices,    // Simple grid triangulation (2 tris per cell)
    baseGridIndices.length,
    targetOuterTris,
    64,                 // resU (metric grid resolution)
    Math.max(16, Math.round(finalT.length / 4)), // resT
);
const metricMs = performance.now() - metricStart;
console.log(`[ParametricExport] Phase 3b+3c: pilot eval ${pilotMs.toFixed(1)}ms + metric field ${metricMs.toFixed(1)}ms`);
console.log(`[ParametricExport]   anisotropy: mean=${metricProvider.stats.meanAnisotropy.toFixed(2)}, max=${metricProvider.stats.maxAnisotropy.toFixed(2)}, target edge=${metricProvider.stats.targetEdgeLength3D.toFixed(3)}mm`);
```

**Constructing the pilot mesh**: The base grid is already available as `unionU × activeTPositions` with simple quad tessellation. We need a helper that produces:
- `baseGridUVs: Float32Array` — packed [u, t, surfaceId] for each grid vertex
- `baseGridIndices: Uint32Array` — two triangles per quad cell

This helper belongs in `GridBuilder.ts` as `buildPilotGridMesh(unionU, tPositions, surfaceId)`.

#### 3.2.2 New export from `GridBuilder.ts`

```typescript
/**
 * Build a minimal pilot mesh for metric field computation.
 * Returns UV coordinates and index buffer for a simple grid triangulation.
 * No chain vertices, no features — just the base grid.
 */
export function buildPilotGridMesh(
    unionU: Float32Array,
    tPositions: Float32Array,
    surfaceId: number,
): { uvs: Float32Array; indices: Uint32Array }
```

**Tests**: Add 3-4 tests to existing `GridBuilder` test file:
- Correct vertex count (numU × numT)
- Correct index count (2 × (numU-1) × (numT-1) × 3)
- All indices valid
- UV coordinates match grid positions

#### 3.2.3 Cost analysis

The pilot evaluation is a GPU dispatch of `numU × numT` vertices (typically 800×400 = 320K vertices). This is ~25% of the full mesh evaluation cost. At typical timings:
- GPU dispatch: ~15ms
- Metric computation: ~2ms
- Total overhead: ~17ms (acceptable for exports that take 200-500ms)

The pilot mesh is temporary — it's only used for metric computation and can be freed immediately after.

#### 3.2.4 Feature flag

Add `pilotMetricField` to `PipelineFeatureFlags` in `contracts.ts`:

```typescript
export interface PipelineFeatureFlags {
    // ...existing...
    /** Compute metric field from pilot mesh before tessellation. */
    pilotMetricField?: boolean;
}
```

Default: `true` for quality profiles `high` and `ultra`, `false` for `draft` and `standard`.

---

### Phase 3: Companion Vertex Insertion (Core Implementation)

**Goal**: Insert companion vertices around chain vertices to break fan topology, using the metric field to determine optimal placement.

This is the core innovation. Instead of the sweep creating fan triangles, we pre-insert vertices that give the sweep better topology to work with.

#### 3.4.1 New export function in `OuterWallTessellator.ts`

```typescript
/**
 * Insert metric-aware companion vertices around chain vertices to prevent
 * fan topology in the sweep triangulation.
 *
 * For each chain vertex CV at (u_cv, t_cv), analyze the local grid cell:
 *   - Get the metric tensor at CV's position
 *   - Compute principal stretch directions
 *   - Insert 2-4 companion vertices that form a local "diamond" around CV
 *   - Companions are placed at metric-optimal positions (equal metric distance)
 *
 * Companions are added as additional chain vertices (same chainId as CV)
 * so the sweep treats them as part of the constraint topology.
 *
 * Must be called AFTER chain vertices are created but BEFORE row merging
 * and triangulation (between current steps 1 and 2 of buildCDTOuterWall).
 */
export function insertCompanionVertices(
    chainVertices: ChainVertex[],
    chainEdges: Array<[number, number]>,
    unionU: Float32Array,
    tPositions: Float32Array,
    gridVertexCount: number,
    nextVertexIdx: number,
    surfaceId: number,
    metricProvider: MetricFieldProvider | null,
    options?: CompanionVertexOptions,
): CompanionResult
```

**`CompanionVertexOptions`**:
```typescript
interface CompanionVertexOptions {
    /** Maximum companions per chain vertex. Default: 4. */
    maxCompanionsPerVertex: number;
    /** Minimum metric-space distance ratio to trigger companions. Default: 1.5.
     *  If the ratio of metric-distance to nearest grid vertex vs ideal edge length
     *  exceeds this, insert a companion. */
    triggerRatio: number;
    /** Companion placement radius in UV, as fraction of grid cell size. Default: 0.4. */
    placementRadius: number;
}
```

**`CompanionResult`**:
```typescript
interface CompanionResult {
    /** Updated chain vertices array (companions appended). */
    chainVertices: ChainVertex[];
    /** Updated chain edges (new edges from companions). */
    chainEdges: Array<[number, number]>;
    /** Next available vertex index. */
    nextVertexIdx: number;
    /** Number of companions inserted. */
    companionCount: number;
    /** Diagnostic: breakdown by placement type. */
    diagnostics: {
        flanking: number;    // Companions at ±1 column from chain vertex
        interRow: number;    // Companions at ±0.5 row from chain vertex
        skippedNearGrid: number; // Chain vertices too close to grid → no companion needed
    };
}
```

#### 3.4.2 Companion placement algorithm

For each chain vertex CV at grid position (u_cv, row_cv):

1. **Find the enclosing grid cell**: Binary search `unionU` for the column index `col` such that `unionU[col] <= u_cv < unionU[col+1]`

2. **Compute metric at CV**: `M = metricProvider.getMetricAt(u_cv, tPositions[row_cv])`

3. **Compute ideal edge length**: `idealUV = metricProvider.idealEdgeLengthUV(u_cv, tPositions[row_cv])`

4. **Check if companions are needed**: Measure metric distance from CV to the 4 grid corners of the enclosing cell. If all distances < `triggerRatio × idealUV`, skip (grid is dense enough).

5. **Place companions** at positions that create well-shaped triangles:

   **Type A — Column flanking companions** (same row as CV):
   - Place at `(u_cv ± idealUV_u, row_cv)` where `idealUV_u = idealUV / √E`
   - These break the left-right fan into well-shaped triangles
   - Clamp to grid cell boundaries (don't extend beyond adjacent cells)

   **Type B — Row flanking companions** (same column as CV, adjacent rows):
   - Place at `(u_cv, row_cv ± 1)` — these are the staircase vertices from Phase 3
   - If the chain already has vertices at adjacent rows (from interpolation), don't duplicate

   **Type C — Diagonal companions** (for highly anisotropic regions):
   - Only when `anisotropy > 2.0`
   - Place along the principal stretch direction at distance `idealUV`
   - These align the companion diamond with the surface stretch

6. **Connect companions**: Add chain edges from CV to each companion. These become constraint edges that force the sweep to create triangles between CV and its companions rather than fanning to distant grid vertices.

#### 3.4.3 Integration into `buildCDTOuterWall`

Insert companion vertex generation between chain vertex creation (step 1) and vertex buffer construction (step 2):

```typescript
// ── Step 1b: Insert metric-aware companion vertices ──
let companionResult: CompanionResult | undefined;
if (metricProvider) {
    companionResult = insertCompanionVertices(
        chainVertices, chainEdges, unionU, activeTPositions,
        gridVertexCount, nextVertexIdx, surfaceId, metricProvider,
    );
    chainVertices = companionResult.chainVertices;
    chainEdges = companionResult.chainEdges;
    nextVertexIdx = companionResult.nextVertexIdx;
    console.log(`[CDT] Step 1b: Inserted ${companionResult.companionCount} companion vertices`);
}
```

**Signature change for `buildCDTOuterWall`**: Add optional `metricProvider` parameter:

```typescript
export function buildCDTOuterWall(
    chains: FeatureChain[],
    rowMapping: number[],
    tPositions: Float32Array,
    unionU: Float32Array,
    _targetOuterTris: number,
    surfaceId?: number,
    metricProvider?: MetricFieldProvider | null,  // NEW
): OuterWallResult
```

#### 3.4.4 Tests (~16 tests)

New test group: **"metric-aware companion vertices"**

| Test | Verifies |
|------|----------|
| No metric → no companions | Graceful no-op when metricProvider is null |
| Chain vertex in middle of cell → 2 column companions | Left/right flanking at ideal distance |
| Chain vertex near grid edge → 1 companion (away from edge) | Clamp to cell boundary |
| Chain vertex at grid vertex → 0 companions | Already well-connected |
| High anisotropy → diagonal companions | Alignment with principal stretch |
| Low anisotropy → only column companions | No unnecessary vertices |
| Companion edges recorded | New chain edges connect CV to companions |
| Companion vertices in merged row | buildMergedRow includes companions |
| No duplicate companions | Same-position companions deduplicated |
| Budget cap respected | Max companions per vertex honored |
| Integration: reduced max aspect ratio | Full pipeline with metric produces better triangles |
| Integration: increased min angle | Min angle > 15° in chain strip |
| Integration: all indices valid | No out-of-bounds references |
| Integration: constraint edges present | Chain edges enforced for companions |
| Companion count logged | Diagnostic output correct |
| Deterministic output | Same input → same companions |

---

### Phase 5: Thread Metrics Through Post-GPU Optimization

**Goal**: Give Phase 5 optimization passes access to the metric field so they can make metric-aware decisions.

#### 3.5.1 `ChainStripOptimizer.ts` — Metric-aware edge flipping

Currently, `optimizeChainStrips` uses 3D angle and valence criteria. With metrics, it can also:

- **Weight flip decisions by metric edge length**: Prefer flips that equalize metric-space edge lengths (not just 3D angles)
- **Anisotropy-aware aspect ratio guard**: In anisotropic regions, allow higher UV-space aspect ratios if the 3D aspect is acceptable

**Changes to `ChainStripFlipParams`**:
```typescript
export interface ChainStripFlipParams {
    // ...existing...
    /** Optional metric data for metric-aware flip decisions. */
    vertexMetrics?: { E: Float32Array; F: Float32Array; G: Float32Array; vertexCount: number };
}
```

**Changes to Phase A flip criterion** (angle-based):
- Currently: flip if `minAngle(new) > minAngle(old)`
- Enhanced: flip if `minAngle(new) > minAngle(old)` AND `metricAspect(new) < metricAspect(old)`
- The metric aspect ratio uses `metricEdgeLengthSq` for edge lengths

**Estimated impact**: 10-15% more beneficial flips identified (currently rejected by Euclidean guards that don't account for surface stretch).

#### 3.5.2 `MeshSubdivision.ts` — Metric-aware subdivision threshold

Currently, edges longer than `1.8 × avgGridEdge` (3D Euclidean) are split. With metrics:

- **Replace threshold**: Split edges where `metricEdgeLength > 1.5 × idealMetricEdgeLength`
- **Skip over-subdivision**: Don't split edges in low-anisotropy regions that are already close to ideal metric length

**Changes to `SubdivisionParams`**:
```typescript
export interface SubdivisionParams {
    // ...existing...
    /** Optional per-vertex metrics for metric-aware edge selection. */
    vertexMetrics?: { E: Float32Array; F: Float32Array; G: Float32Array; vertexCount: number };
}
```

#### 3.5.3 `MeshOptimizer.ts` — Metric-aware diagonal choice

Currently, `flipEdges3D` uses 3D dihedral angle + min angle criterion. With metrics:

- **Consider metric-space triangle quality**: A triangle that looks like a sliver in UV but maps to a well-shaped triangle in 3D is acceptable
- **The lock band** (`CHAIN_LOCK_BAND_HALF_WIDTH`) could be widened or narrowed based on local anisotropy

This is lower priority — the chain strip optimizer and companion vertices address most of the issue.

#### 3.5.4 Orchestrator changes in `ParametricExportComputer.ts`

After computing the metric field (Phase 3c), pass it through to all Phase 5 stages:

```typescript
// After Phase 4 GPU evaluation, recompute metrics on the actual mesh
const postEvalMetrics = computeVertexMetrics(
    resultData, combinedVerts, combinedIdxs, outerIdxCount,
);

// Pass to chain strip optimizer
csResult = optimizeChainStrips({
    ...existingParams,
    vertexMetrics: postEvalMetrics,  // NEW
});

// Pass to subdivision
const subdivResult = await subdivideLongEdges({
    ...existingParams,
    vertexMetrics: postEvalMetrics,  // NEW
}, evaluateMidpointsFn);
```

---

### Phase 6: Architectural Cleanup

**Goal**: Ensure the metric-threading changes maintain modularity and don't create tight coupling.

#### 3.6.1 Module dependency diagram (proposed)

```
MetricFieldProvider  (new, standalone)
    ├── depends on: SurfaceMetric.ts (existing, unchanged)
    └── used by:
        ├── OuterWallTessellator.ts  (optional param)
        ├── ChainStripOptimizer.ts   (optional param)
        ├── MeshSubdivision.ts       (optional param)
        ├── AdaptiveRefinement.ts    (already uses SurfaceMetric)
        └── ParametricExportComputer.ts (orchestrator, creates provider)
```

Every consumer accepts the metric as an **optional parameter** — the pipeline works identically without it (graceful degradation). This means:
- All existing tests pass without modification
- The metric field can be disabled via feature flag
- Individual modules remain independently testable

#### 3.6.2 Type consolidation

Move the `VertexMetrics` type from `AdaptiveRefinement.ts` to `types.ts` so all modules can import it from the same place:

```typescript
// types.ts (add)
/** Per-vertex metric tensor data. */
export interface VertexMetrics {
    E: Float32Array;
    F: Float32Array;
    G: Float32Array;
    vertexCount: number;
}
```

Update imports in `AdaptiveRefinement.ts`, `ChainStripOptimizer.ts`, `MeshSubdivision.ts`.

#### 3.6.3 Contract updates in `contracts.ts`

Add metric field to `TessellationInput`:

```typescript
export interface TessellationInput {
    // ...existing...
    /** Optional metric field for metric-aware vertex placement. */
    metricProvider?: MetricFieldProvider | null;
}
```

Add `pilotMetricField` to `PipelineFeatureFlags` (see Phase 2 above).

#### 3.6.4 Remove dead Steiner code

The `insertStripSteinerPoints` function (currently disabled with `STEINER_ENABLED = false`) can be removed. The helper functions it uses (`minAngleUV`, `aspectRatioUV`, `edgeKeyStr`, `buildChainEdgeKeySet`) are useful for the companion vertex quality assessment — keep those, remove the Steiner-specific function and its tests.

---

## 4. File Change Summary

| File | Changes | Lines (est.) |
|------|---------|-------------|
| **NEW: `MetricFieldProvider.ts`** | New module: provider interface + builder | ~200 |
| **NEW: `MetricFieldProvider.test.ts`** | Unit tests for provider | ~250 |
| `GridBuilder.ts` | Add `buildPilotGridMesh()` | +40 |
| `OuterWallTessellator.ts` | Staircase decomposition + companion vertices + accept metricProvider | +180, ~60 modified |
| `OuterWallTessellator.test.ts` | New test groups (staircase + companions) | +400 |
| `ChainStripOptimizer.ts` | Accept optional vertexMetrics, metric-aware flip criterion | +30, ~20 modified |
| `ChainStripOptimizer.test.ts` | Tests for metric-aware flipping | +60 |
| `MeshSubdivision.ts` | Accept optional vertexMetrics, metric-aware threshold | +20, ~15 modified |
| `MeshSubdivision.test.ts` | Tests for metric-aware subdivision | +40 |
| `ParametricExportComputer.ts` | Pilot evaluation, metric field creation, thread metrics through | +80, ~30 modified |
| `types.ts` | Add `VertexMetrics` type, move from AdaptiveRefinement | +10 |
| `contracts.ts` | Add `pilotMetricField` flag, metric in TessellationInput | +15 |
| `AdaptiveRefinement.ts` | Update `VertexMetrics` import path | ~2 modified |

**Total**: ~1 new file, ~10 modified files, ~1300 new lines, ~130 modified lines

---

## 5. Implementation Order

The phases are designed to be independently shippable — each one improves the pipeline without requiring the others.

### Batch 1: Companion Vertex Insertion (Phase 3)
- `insertCompanionVertices()` in OuterWallTessellator
- Integration into `buildCDTOuterWall`
- Remove disabled Steiner code (replaced by companions)
- Tests for companion vertex insertion
- **Verification**: Fan topology broken at chain vertices, min angle improvement in chain strips, all 650+ tests pass

### Batch 2: Metric Field Foundation (Phases 1 + 2)
- `MetricFieldProvider.ts` + tests
- `buildPilotGridMesh()` in GridBuilder
- Pilot evaluation in orchestrator
- Feature flag `pilotMetricField`
- **Verification**: Metric field computed and logged, companions enhanced with metric-aware placement

### Batch 3: Threading + Cleanup (Phases 4 + 5)
- Metric-aware flip criterion in ChainStripOptimizer
- Metric-aware threshold in MeshSubdivision
- Type consolidation (VertexMetrics to types.ts)
- Contract updates
- **Verification**: Full pipeline passes, metric-aware optimization logged, all 650+ tests pass

---

## 6. Verification Strategy

### Per-batch verification

Each batch must pass:
1. `npx vitest run src/renderers/webgpu/parametric/OuterWallTessellator.test.ts` — all tests
2. `npx vitest run src/renderers/webgpu/parametric/` — full parametric suite (650+ tests)
3. TypeScript compilation: `npx tsc --noEmit`
4. Lint: `npx eslint src/renderers/webgpu/parametric/ --max-warnings=0`

### Quality metrics to track

Export a styled pot (e.g., Diamond style) and compare before/after:

| Metric | Current (baseline) | Target |
|--------|-------------------|--------|
| Max aspect ratio (chain strip) | 20:1+ | < 5:1 |
| Min angle (chain strip) | ~5° | > 15° |
| Valence < 5 (%) | 53% | < 20% |
| Cross-row triangles (4+) | hundreds | < 10 |
| Zero-area triangles | 0 | 0 |
| Inverted triangles | ~156K (pre-existing) | no regression |
| Boundary edges | ~55K (pre-existing) | no regression |

### Regression protection

- All existing tests continue to pass (no behavioral changes when metricProvider is null)
- New tests cover every new code path
- Feature flag allows disabling pilot metric for performance-sensitive profiles

---

## 7. Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Pilot evaluation adds 15-20ms overhead | Certain | Low | Only for high/ultra profiles; draft/standard skip it |
| Horizontal chain edges break constraintAwareTriangulate | Medium | Medium | Skip horizontal edges as explicit constraints; they're naturally enforced by row ordering |
| Companion vertices in seam region cause wrap issues | Medium | Medium | Apply same seam guard (u-extent > 0.4 → skip) used elsewhere |
| Companion vertices too close to grid vertices | Medium | Low | Dedup: skip companions within 1e-6 UV of existing vertices |
| Metric field inaccurate near seam | Low | Low | Seam vertices use identity metric fallback (already in SurfaceMetric) |
| Memory overhead for metric field | Low | Low | 64×64 grid × 3 floats × 4 bytes = 49KB |

---

## 8. What This Does NOT Address

These are known issues that remain out of scope for this plan:

- **Inverted triangles (~156K)**: Pre-existing issue likely from winding order or UV mapping, not from chain bridging
- **Seam-crossing UV midpoint bug in MeshSubdivision**: Causes 142mm position errors, needs separate fix
- **Inner wall tessellation**: This plan only addresses outer wall; inner wall uses separate logic
- **webgpu_core.ts monolith**: 5500+ lines, needs its own extraction effort
- **Advancing front triangulation**: A full replacement of the monotone sweep could produce even better topology, but is a much larger effort than companion vertices. The companion approach gets 80% of the benefit at 20% of the cost.
