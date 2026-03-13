# Parametric Pipeline Modular Decomposition — Code Review

**Review Date:** 2026-02-24
**Branch:** `refactor/core-migration`
**Base SHA:** `4f2a95be` | **Head SHA:** `2b03d7b1`
**Reviewer:** Senior Code Review Agent
**Scope:** All 17 modules in `src/renderers/webgpu/parametric/` + `ParametricExportComputer.ts`

---

## Summary

| Category | Count |
|---|---|
| Critical issues (must fix before real usage) | 5 |
| Important issues (should fix soon) | 8 |
| Minor issues (nice to have) | 6 |

The modular decomposition succeeds in its primary structural goal: the ~6,000-line monolith has been split into focused, independently-testable modules with clear contracts. The 573-test suite covers the pure-CPU path thoroughly. The `contracts.ts` design is a genuine architectural improvement.

However, **the review found five critical bugs** that affect correctness of the exported mesh in production. The most serious finding is that the chain-vertex infrastructure in `OuterWallTessellator.ts` is entirely dead code — the data structures are built then immediately cleared before use, rendering the chain-edge enforcement verification loop permanently meaningless.

Additionally, `SurfaceEvaluator.ts` and `CurvatureSampler.ts` are fully extracted but **not imported by the orchestrator** — it duplicates their logic inline.

---

## Critical Issues

### C1. Dead chain-vertex infrastructure — chain edge enforcement is permanently inactive

**File:** `src/renderers/webgpu/parametric/OuterWallTessellator.ts`, lines 388–500
**Confidence:** High

`buildCDTOuterWall` builds `chainVertices` (lines 388–485) with full interpolation logic and records `chainEdges`, then at lines 498–500 immediately clears both arrays:

```typescript
chainVertices.length = 0;
chainEdges.length = 0;
```

Every downstream consumer operates on empty data:
- `buildMergedRow` (line 569): `rowChainVerts` map is always empty → only base grid vertices returned
- `constraintAwareTriangulate` / `sweepRegion`: constraint-aware path unreachable; `simpleSweep` always called
- Chain-edge enforcement verification loop (lines 752–787): always reports `enforced=0, missing=0`, printing deceptive "100% enforcement" to console
- `cdtResult.chainEdges` returned to orchestrator is always `[]` → `constraintEdgeSet` always empty → `optimizeChainStrips` and `optimizeBoundaryDiagonals` have no edges to protect

The v20.0 per-row UV snapping (`applyUVSnapping`, lines 507–565) is the actual feature-placement mechanism, but it only adjusts grid column U positions — it does **not** enforce chain edges as hard mesh constraints. The "100% chain edge enforcement" console log is misleading.

**Fix:** Remove lines 388–497 entirely (dead infrastructure). Add a comment explaining that edge enforcement is achieved via UV snapping + `chainDirectedFlip`, not chain vertices. Update or remove the misleading verification loop.

---

### C2. `percentile` function scale inconsistency: AdaptiveRefinement uses 0–100 range, MeshValidator calls it with 0–1

**Files:** `src/renderers/webgpu/parametric/AdaptiveRefinement.ts` line 246; `src/renderers/webgpu/parametric/MeshValidator.ts` (import sites)
**Confidence:** High

`AdaptiveRefinement.ts` exports:
```typescript
// line 246 — expects p in 0–100
const idx = Math.ceil((p / 100) * sorted.length) - 1;
```

`MeshValidator.ts` imports `percentile` from `AdaptiveRefinement` and calls it as:
```typescript
percentile(sortedPos, 0.95)  // passing 0–1 scale
```

Passing `0.95` to a function expecting 0–100 computes the **~1st percentile** instead of the 95th. Every `checkFidelity` p95/p99.9 gate silently passes with the wrong threshold — mesh quality is dramatically underreported.

**Fix:** Standardize on one convention. Recommended: use 0–1 throughout, change `p / 100` to `p` in `AdaptiveRefinement`, update its internal calls from `percentile(arr, 95)` to `percentile(arr, 0.95)`. Add JSDoc `@param p - Value in [0, 1]`.

---

### C3. BigInt edge key collision at production scale (ChainStripOptimizer + MeshSubdivision)

**Files:** `src/renderers/webgpu/parametric/ChainStripOptimizer.ts` line 167; `src/renderers/webgpu/parametric/MeshSubdivision.ts` line 122
**Confidence:** High

Both files independently use:
```typescript
export function edgeKey(a: number, b: number): bigint {
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  return BigInt(lo) * BigInt(0x100000) + BigInt(hi);
}
```

`0x100000 = 1,048,576`. The encoding is only collision-free when all vertex indices are below 1,048,576. At `ultra` profile (8M triangle budget), vertex counts exceed 1M. A mesh with 2M vertices produces collisions: `edgeKey(1, 0) = 0x100000` and `edgeKey(0, 1048576) = 0x100000`. This corrupts the edge map, causing random flip decisions to be wrong → mesh topology corruption.

**Fix (one line in both files):** Change `BigInt(0x100000)` to `BigInt(0x100000000)` (2^32 = 4,294,967,296), which safely handles up to 4 billion vertices.

---

### C4. `featureEdgesToLockedQuads` uses vertex-count stride instead of cell-count stride

**File:** `src/renderers/webgpu/parametric/FeatureEdgeGraph.ts`, `featureEdgesToLockedQuads`, ~line 329
**Confidence:** High

The function computes quad indices as:
```typescript
locked.add(minRow * numU + c0);
```

But `chainDirectedFlip` in `MeshOptimizer.ts` uses `cellsPerRow = w - 1` as its quad map stride:
```typescript
const quadIdx = j * cellsPerRow + bandCol; // cellsPerRow = w - 1
```

For `numU = 700`: locked-quad index uses stride 700, but quad map uses stride 699. The indices diverge by `+row` for every row > 0. All feature-edge protection in `chainDirectedFlip` against quads from `featureEdgesToLockedQuads` references the wrong quad — protection is silently absent.

**Fix:** Change to `locked.add(minRow * (numU - 1) + c0)`. Accept a `cellsPerRow` parameter to make the dependency explicit.

---

### C5. T normalization ambiguity in MeshSubdivision corrupts proximity checks for 2–3 row grids

**File:** `src/renderers/webgpu/parametric/MeshSubdivision.ts`, `identifyChainAdjacentVertices`, line 156
**Confidence:** High

```typescript
const tNorm = (pt.row >= 0 && pt.row <= 1)
  ? pt.row
  : Math.max(0, Math.min(1, pt.row / denom));
```

For a 3-row grid, row index `1` satisfies `pt.row <= 1`, so `tNorm = 1.0` — but the correct T is `1 / (3-1) = 0.5`. Feature-adjacent vertex identification uses wrong T positions, producing incorrect subdivision targets.

**Fix:** Remove the guard entirely. Chain `pt.row` is always an integer row index; always compute `tNorm = pt.row / denom` (clamped to `[0, 1]`):
```typescript
const tNorm = denom > 0 ? Math.max(0, Math.min(1, pt.row / denom)) : 0;
```

---

## Important Issues

### I1. SurfaceEvaluator and CurvatureSampler are orphaned — orchestrator duplicates their logic inline

**Files:** `SurfaceEvaluator.ts`, `CurvatureSampler.ts`, `ParametricExportComputer.ts`
**Severity:** Important — two canonical implementations of the same logic, any fix must be applied twice

The orchestrator has its own `evaluatePoints()` method (lines 212–368, 156 lines) and inline curvature sampling loop (lines 465–545, 138 lines) that are functionally identical to the extracted modules. Neither module is imported. Bug fixes to one implementation will miss the other.

**Fix:** Either wire the orchestrator to use `SurfaceEvaluator.evaluateBatch()` and `CurvatureSampler.sampleCurvature()`, or remove the orphaned modules and document the inline-only approach. If keeping the inline approach, delete the modules to prevent confusion.

---

### I2. `validateMeshGPU` omits distortion gate from `valid` computation

**File:** `src/renderers/webgpu/parametric/MeshValidator.ts`, `validateMeshGPU` function
**Severity:** Important — High/Ultra profiles silently skip distortion validation on the GPU path

CPU path includes `(distortion?.ok ?? true)` in `valid`. GPU path does not. When `distortionGating` is enabled via feature flags, the GPU path always reports `valid: true` for distortion regardless of actual check result.

**Fix:** Add `&& (distortion?.ok ?? true)` to the `valid` computation in `validateMeshGPU` to match CPU path logic.

---

### I3. `buildUnionFeatureGrid` cluster algorithm breaks for features straddling U=0/1 seam

**File:** `src/renderers/webgpu/parametric/GridBuilder.ts`, `buildUnionFeatureGrid`, lines 356–369
**Severity:** Important when `LOCAL_ONLY_OUTER_ADAPTATION = false` (currently routed around, but exported and will run when flag is removed)

The linear clustering sorts `allPeaks` in `[0,1)`. A feature at U=0.998 and one at U=0.003 are 0.005 apart circularly but appear at opposite ends of the sorted array. They get separate representative columns instead of merging.

**Fix:** After clustering, add a seam-wrap pass: if `allPeaks[0] + 1.0 - allPeaks[last] < FEATURE_CLUSTER_RADIUS`, merge the head and tail clusters.

---

### I4. `buildMetricField` in SurfaceMetric is O(vertexCount × resU × resT) — will freeze browser

**File:** `src/renderers/webgpu/parametric/SurfaceMetric.ts`, `buildMetricField`, lines 374–396
**Severity:** Important — freezes browser tab at standard profile (350K vertices × 350K cells = 122.5B comparisons)

The implementation scans the entire grid for each vertex to find the nearest cell. The correct approach is a direct closed-form lookup since vertex UV coordinates are already normalized.

**Fix:**
```typescript
// O(1) per vertex instead of O(resU × resT)
const gridU = Math.min(resU - 1, Math.floor(u * resU));
const gridT = Math.min(resT - 1, Math.floor(t * resT));
const cellIdx = gridT * resU + gridU;
```

---

### I5. `checkFidelityCPU` position error has wrong units — mm²·rad instead of mm

**File:** `src/renderers/webgpu/parametric/MeshValidator.ts`, `checkFidelityCPU`
**Severity:** Important — p95 position error compared against `epsPosMm` with wrong units; threshold comparison is meaningless

```typescript
const chordErr = lenSq * theta / 8;        // mm² × radians = mm²·rad (wrong)
posErrors.push(Math.sqrt(chordErr));         // sqrt(mm²·rad) ≠ mm
```

A correct chord error approximation: `chord ≈ sqrt(lenSq) × (theta / 2)` which has units mm.

**Fix:**
```typescript
const chordErr = Math.sqrt(lenSq) * (theta / 2); // mm — correct units
posErrors.push(chordErr);
```

---

### I6. `resnapChainToMeasuredPeaks` drops chain `kind` field — every chain treated as valley downstream

**File:** `src/renderers/webgpu/parametric/ChainLinker.ts`, `resnapChainToMeasuredPeaks`, ~line 207
**Severity:** Important — `OuterWallTessellator` checks `chain.kind === 'peak'` for diagonal direction; `undefined` evaluates as false

```typescript
return { points }; // kind is dropped
```

**Fix:**
```typescript
return { points, kind: chain.kind };
```

Also add test in `ChainLinker.test.ts` asserting `kind` is preserved through resnap.

---

### I7. Console.log calls in library modules (ChainLinker, CurvatureSampler)

**Files:** `ChainLinker.ts` lines 545–547; `CurvatureSampler.ts` line 113
**Severity:** Important — creates noise in unit test output, violates ConsolePatch architecture

Pure computation modules should not emit to global console. Accept an optional `ProgressCallback` (already defined in `types.ts`) for timing reports.

---

### I8. Duplicate `circularDistance` exported from both FeatureDetection and ChainLinker

**Files:** `FeatureDetection.ts`, `ChainLinker.ts`
**Severity:** Important — two sources of truth for a utility function; divergence risk

**Fix:** Keep canonical implementation in `ChainLinker.ts`, re-export from `FeatureDetection.ts`:
```typescript
export { circularDistance } from './ChainLinker';
```

---

## Minor Issues

### M1. Commented-out `if` block with no logic in `validateFeatureFlags`

**File:** `contracts.ts`, lines 389–392
```typescript
if (flags.gpuFidelityCheck && !flags.distortionGating) {
    // gpuFidelityCheck without distortionGating is valid but unusual — just a note, no error.
}
```
Dead code. Remove the empty block or add a `console.warn`.

---

### M2. Duplicate comment on consecutive lines in orchestrator

**File:** `ParametricExportComputer.ts`, lines 91–93
```typescript
// Re-export types for backward compatibility (used by useParametricExport.ts)
// Re-export types for backward compatibility (used by useParametricExport.ts)
```
Remove the duplicate.

---

### M3. `SeamTopology.ts` uses `uL + EPSILON` when `uL - EPSILON` is semantically correct

**File:** `SeamTopology.ts`, `measureSeamContinuityWithNormals`, line 402–407

`uL ≈ 0.999`. Adding EPSILON may push to `1.0 + EPSILON` (outside valid domain `[0,1)`). Intent is to sample slightly inside the last column.

**Fix:** Change `uL + EPSILON` to `uL - EPSILON`.

---

### M4. `ultraSeamThreshold = 0.02mm` is geometrically unachievable — seam gap check calibrated against wrong metric

**File:** `SeamTopology.ts`, `seamConfigForProfile`; `MeshValidator.ts` seam gap check

For a 700-column grid at Rt=50mm, cell width ≈ 0.449mm. The `ultra` threshold of `maxPositionGapMm = 0.02mm` is 22× smaller than the actual grid resolution. Every ultra export fails this check regardless of quality.

**Fix:** The seam gap check should measure 3D distance between matching vertices at U=0 and U=1 (should be ~0 for a correctly closed mesh), not the UV sampling gap. Recalibrate thresholds accordingly.

---

### M5. `edgeLengthStats` in SurfaceMetric uses string key deduplication (same class as `weldMesh` known issue)

**File:** `SurfaceMetric.ts`, `edgeLengthStats`

At 2M triangles (~3M edges), a `Set<string>` with 3M strings stresses GC heavily. Use BigInt keys (after C3 fix) or cap to a sample of triangles.

---

### M6. Global mutable debug state survives concurrent exports

**File:** `ParametricExportComputer.ts`

`LAST_CHAIN_DEBUG_DATA` and `LAST_PEAK_DEBUG_DATA` are module-level mutable globals. Concurrent exports (possible in tests) overwrite each other's debug data.

**Fix:** Return debug data as part of `ParametricExportResult` instead of storing globally.

---

## Module-by-Module Assessment

| Module | Correctness | Tests | Architecture |
|---|---|---|---|
| `types.ts` | ✅ Good | N/A | ✅ Good |
| `contracts.ts` | ✅ Good (M1 minor) | ✅ Good | ✅ Excellent |
| `QualityProfiles.ts` | ✅ Good | ✅ Excellent | ✅ Good |
| `CurvatureAnalysis.ts` | ✅ Good | ✅ Good | ✅ Good |
| `CurvatureSampler.ts` | ✅ Good but **orphaned** | ⚠️ No GPU tests | ✅ Good |
| `SurfaceEvaluator.ts` | ✅ Good but **orphaned** | ❌ None | ✅ Good |
| `FeatureDetection.ts` | ✅ Good | ✅ Good | ⚠️ Duplicate util (I8) |
| `ChainLinker.ts` | ⚠️ kind loss (I6), console.log (I7) | ⚠️ Adequate | ✅ Good |
| `GridBuilder.ts` | ⚠️ Seam cluster bug (I3) | ⚠️ Adequate | ✅ Good |
| `OuterWallTessellator.ts` | ❌ **Dead code (C1)** | ❌ Cannot detect C1 | ❌ Poor |
| `MeshOptimizer.ts` | ✅ Good | ✅ Good | ✅ Good |
| `ChainStripOptimizer.ts` | ❌ BigInt collision (C3) | ⚠️ Doesn't test bounds | ✅ Good |
| `MeshSubdivision.ts` | ❌ T normalization (C5), BigInt collision (C3) | ⚠️ Adequate | ✅ Good |
| `MeshValidator.ts` | ❌ Percentile scale (C2), distortion gap (I2), wrong units (I5) | ✅ Good | ✅ Good |
| `AdaptiveRefinement.ts` | ❌ Percentile caller side (C2) | ✅ Good | ✅ Good |
| `SurfaceMetric.ts` | ❌ O(n²) lookup (I4), string dedup (M5) | ⚠️ Adequate | ✅ Good |
| `FeatureEdgeGraph.ts` | ❌ Wrong stride (C4) | ⚠️ Missing stride test | ✅ Good |
| `SeamTopology.ts` | ⚠️ EPSILON dir (M3), threshold (M4) | ⚠️ Adequate | ✅ Good |
| `ParametricExportComputer.ts` | ⚠️ Orphaned modules (I1) | ❌ No unit tests | ⚠️ Needs refactor |

---

## Test Coverage Gaps

1. **OuterWallTessellator C1 is undetectable by any existing test.** Tests verify UV-snapping adjusts vertex positions but never assert `result.chainEdges.length > 0` when chains are provided, nor that chain edge pairs appear in the mesh's actual edge list.

2. **The percentile scale bug (C2) is not caught.** `AdaptiveRefinement.test.ts` tests `percentile(arr, 50)` (correct 0–100 scale). `MeshValidator.test.ts` never calls `percentile` directly in a way that exposes the 100× scale difference.

3. **`featureEdgesToLockedQuads` stride bug (C4) has no regression test.** `FeatureEdgeGraph.test.ts` does not verify that locked-quad indices are compatible with quad map stride in `MeshOptimizer`.

4. **`fidelity.integration.test.ts` runs the pipeline without chains.** The `runPipeline` helper passes an empty chains array to `buildCDTOuterWall`. The primary purpose of the pipeline — chain-constrained tessellation — is never exercised in integration tests.

5. **`SurfaceEvaluator` and `CurvatureSampler` have zero GPU integration tests.** As orphaned modules, breakage in `evaluateBatch` is undetectable.

6. **`resnapChainToMeasuredPeaks` kind-preservation is not tested.** No test asserts `chain.kind` survives resnap.

---

## Architecture Assessment

**Strengths:**
- `contracts.ts` is a genuine improvement: stage interfaces with `readonly` fields prevent cross-stage mutation; `PipelineFeatureFlags` enables controlled adoption of new paths with safe defaults
- `QualityProfiles.ts` correctly implements downgrade-ladder semantics
- `ChainStripOptimizer.ts` is well-structured with clear phase-based flip architecture
- The extraction pattern (leaf-dependencies first, orchestrator last) was followed correctly

**Structural concerns:**
- The orchestrator still contains 1,391 lines and has not delegated the two most easily extracted sections (curvature sampling, GPU evaluation). `SurfaceEvaluator` and `CurvatureSampler` are orphaned.
- The `evaluatePoints` method (lines 212–368, 11 parameters, 156 lines) is a candidate for further extraction
- `LAST_CHAIN_DEBUG_DATA` and `LAST_PEAK_DEBUG_DATA` are mutable module-level globals (M6)
- Dead code path in `OuterWallTessellator` means the chain-constraint tessellation described in the architecture documentation does not match the running code — the narrative in journal/CLAUDE.md describes behavior that is currently no-op'd

---

## Priority Order for Fixes

| Priority | Issue | Effort |
|---|---|---|
| P0 | C1 — remove dead chain vertex infrastructure | Low (delete code) |
| P0 | C2 — fix percentile scale | Low (one convention change) |
| P0 | C3 — fix BigInt collision bound | Minimal (one constant) |
| P0 | C4 — fix featureEdgesToLockedQuads stride | Minimal (one formula) |
| P0 | C5 — fix T normalization in MeshSubdivision | Minimal (remove guard) |
| P1 | I5 — fix wrong units in checkFidelityCPU | Minimal (one formula) |
| P1 | I6 — fix kind dropped in resnapChainToMeasuredPeaks | Minimal (add kind to return) |
| P1 | I4 — fix O(n²) buildMetricField | Low (replace with O(1) lookup) |
| P1 | I2 — fix distortion gate omission in validateMeshGPU | Minimal |
| P2 | I1 — wire orchestrator to SurfaceEvaluator/CurvatureSampler | Medium |
| P2 | I3 — fix seam cluster in buildUnionFeatureGrid | Low |
| P2 | Add regression tests for C1, C2, C4, C6 gaps | Medium |
| P3 | I7 — remove console.log from modules | Low |
| P3 | I8 — deduplicate circularDistance | Minimal |
| P3 | M1–M6 — minor cleanups | Low |
