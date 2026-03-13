# Parametric Pipeline — Further Work Plan

> **Companion to:** `docs/plans/2026-02-24-code-review.md`
> **Date:** 2026-02-24 | **Branch:** `refactor/core-migration`
>
> This document is the authoritative task list for all remaining work on the parametric
> export pipeline. It is sequenced so that every phase leaves the pipeline in a more
> correct and testable state than it started. Work phases should be taken in order —
> later phases depend on earlier fixes being in place.

---

## Goals (non-negotiable)

| Goal | Criterion |
|---|---|
| Mathematical correctness | All 20 registered styles export surfaces that match their analytic functions within `eps_pos = 0.05 mm` at `standard` profile |
| Surface smoothness | No density bands, no diagonal creases, no oscillating normals at feature ridges |
| SLA/Resin print readiness | Every exported STL is: watertight (0 open edges), manifold (no T-junctions), non-self-intersecting, all normals outward, no degenerate triangles (area > 0) |
| Seam quality | U=0/U=1 cylinder seam: ≤1 UV unit position gap, no visible crease in slicer |

---

## Phase 1 — Critical Bug Fixes (P0)

These five bugs make the pipeline produce wrong output in production today.
Fix all five before doing anything else — they are preconditions for all other testing.

---

### Task 1.1 — Remove dead chain-vertex infrastructure in OuterWallTessellator

**Bug:** C1 from code review.
**File:** `src/renderers/webgpu/parametric/OuterWallTessellator.ts`

Lines 388–497 build `chainVertices[]` and `chainEdges[]` with complex interpolation logic.
Lines 498–500 immediately clear both arrays:
```typescript
chainVertices.length = 0;
chainEdges.length = 0;
```
Every downstream use of these arrays operates on empty data. The verification loop
(lines 752–787) always reports `enforced=0, missing=0` and prints a misleading
"100% enforcement" console log. This is dead code: the v20.0 per-row UV snapping
(lines 507–565, `applyUVSnapping`) is the actual feature-placement mechanism.

**Step 1: Write the failing regression test**
File: `src/renderers/webgpu/parametric/OuterWallTessellator.test.ts`

Add a test that builds a minimal 5×4 grid with one chain and asserts that the
returned `chainEdges` array from `buildCDTOuterWall` is **empty** (as currently happens)
and that the test description notes this is the known bug:

```typescript
it('C1-regression: buildCDTOuterWall returns empty chainEdges (known dead-code bug)', () => {
  const chains: FeatureChain[] = [{
    points: [
      { u: 0.5, row: 0 }, { u: 0.5, row: 1 }, { u: 0.5, row: 2 }
    ],
    kind: 'peak'
  }];
  const result = buildCDTOuterWall({ /*...minimal params...*/ }, chains);
  // C1: should be length 2 (3 points → 2 edges), currently always 0
  expect(result.chainEdges.length).toBe(0); // documents the bug
});
```

Run: `npm run test -- OuterWallTessellator.test`
Expected: PASS (documents current broken state)

**Step 2: Remove the dead code**

Delete lines 388–497 entirely (the `chainVertices`/`chainEdges` build loop and
`chainDataForSnap` save). Replace with a clear comment:

```typescript
// v20.0: Chain edge enforcement is achieved via per-row UV snapping (applyUVSnapping)
// and chainDirectedFlip in MeshOptimizer — NOT via appended chain vertices.
// The chain-vertex approach was abandoned at v20.0 (caused bridge-triangle topology).
// The data appended here was always cleared before use.
```

Also delete lines 752–787 (the verification loop that was always vacuously correct).

**Step 3: Update the test to assert the corrected state**

Change the test expectation:
```typescript
// After C1 fix: chain edges are no longer tracked (UV snapping is the mechanism)
expect(result.chainEdges.length).toBe(0); // correctly empty in v20+ architecture
```

Add a NEW test asserting UV snapping actually adjusts vertex positions toward the chain:
```typescript
it('applyUVSnapping moves nearest column vertex to chain U position', () => {
  // Build grid with columns at U=[0.0, 0.25, 0.5, 0.75] and chain at U=0.48
  // Nearest column to U=0.48 is U=0.5 → should snap to 0.48
  const grid = buildGrid([0.0, 0.25, 0.5, 0.75]);
  const chain: FeatureChain = { points: [{ u: 0.48, row: 1 }], kind: 'peak' };
  const snapped = applyUVSnapping(grid, [chain]);
  expect(snapped.columns[2]).toBeCloseTo(0.48, 5); // column 2 (was 0.5) snapped to chain
});
```

Run: `npm run test -- OuterWallTessellator.test`
Expected: All pass

**Step 4: Commit**
```bash
git add src/renderers/webgpu/parametric/OuterWallTessellator.ts \
        src/renderers/webgpu/parametric/OuterWallTessellator.test.ts
git commit -m "fix(tessellator): remove dead chain-vertex infrastructure (C1)

Chain edges were built then immediately cleared at v20.0 transition.
UV snapping + chainDirectedFlip are the actual enforcement mechanism.
Removes ~110 lines of dead code and the misleading 100% enforcement log."
```

---

### Task 1.2 — Fix `percentile` scale inconsistency

**Bug:** C2 from code review.
**Files:**
- `src/renderers/webgpu/parametric/AdaptiveRefinement.ts` line 247
- `src/renderers/webgpu/parametric/MeshValidator.ts` (all `percentile(...)` call sites)

`percentile` expects `p` in `0–100` but every caller in `MeshValidator.ts` passes `0–1`.
`percentile(arr, 0.95)` computes the ~1st percentile instead of 95th.
All quality gate checks are silently wrong.

**Step 1: Write failing test**
File: `src/renderers/webgpu/parametric/AdaptiveRefinement.test.ts`

```typescript
it('C2-regression: percentile(arr, 0.95) should return 95th percentile value', () => {
  const arr = Array.from({ length: 100 }, (_, i) => i + 1).sort((a, b) => a - b);
  // 95th percentile of [1..100] is 95
  expect(percentile(arr, 0.95)).toBeCloseTo(95, 0);
});
```

Run: `npm run test -- AdaptiveRefinement.test`
Expected: FAIL (`percentile(arr, 0.95)` currently returns ~1)

**Step 2: Fix `percentile` in AdaptiveRefinement.ts**

Change line 247 from:
```typescript
const idx = Math.ceil((p / 100) * sorted.length) - 1;
```
to:
```typescript
// p is in [0, 1] — standardized convention
const idx = Math.ceil(p * sorted.length) - 1;
```

Update the JSDoc at line 243:
```typescript
* @param p - Percentile value in [0, 1]. E.g. pass 0.95 for 95th percentile.
```

**Step 3: Update internal callers in AdaptiveRefinement.ts**
Search the file for `percentile(` calls that pass 0–100 scale values (e.g. `percentile(arr, 95)`).
Change each to the 0–1 equivalent: `percentile(arr, 0.95)`.

**Step 4: Run test — expect PASS**
Run: `npm run test -- AdaptiveRefinement.test`

**Step 5: Run all tests to check MeshValidator callers compile and pass**
Run: `npm run test -- MeshValidator.test`
Expected: Existing tests pass (callers already use 0–1 scale)

**Step 6: Commit**
```bash
git add src/renderers/webgpu/parametric/AdaptiveRefinement.ts \
        src/renderers/webgpu/parametric/AdaptiveRefinement.test.ts
git commit -m "fix(refinement): standardize percentile to 0–1 convention (C2)

percentile() was documented as 0–100 but all callers in MeshValidator
passed 0–1, causing p95 gates to evaluate at ~p1. Fixes silent quality
underreporting across all checkFidelity paths."
```

---

### Task 1.3 — Fix BigInt edge key collision bound

**Bug:** C3 from code review.
**Files:**
- `src/renderers/webgpu/parametric/ChainStripOptimizer.ts` line 167
- `src/renderers/webgpu/parametric/MeshSubdivision.ts` line 122

`BigInt(0x100000)` (= 1,048,576) is the stride. Collisions occur when vertex indices
exceed 1M (achievable at `ultra` profile). Corrupt edge maps → wrong flip decisions.

**Step 1: Write failing test for ChainStripOptimizer**
File: `src/renderers/webgpu/parametric/ChainStripOptimizer.test.ts`

```typescript
it('C3-regression: edgeKey produces distinct values for indices above 1M', () => {
  // With multiplier 0x100000 (1M): edgeKey(1, 0) === edgeKey(0, 1_048_576)
  // This is a hash collision that silently merges distinct edges
  const key1 = edgeKey(0, 1);
  const key2 = edgeKey(0, 1_100_000); // above 1M threshold
  expect(key1).not.toBe(key2);
});
```

Run: `npm run test -- ChainStripOptimizer.test`
Expected: FAIL (collision exists at current multiplier)

**Step 2: Fix ChainStripOptimizer.ts line 167**
```typescript
// Before:
return BigInt(lo) * BigInt(0x100000) + BigInt(hi);
// After:
return BigInt(lo) * BigInt(0x100000000) + BigInt(hi); // 2^32, safe to 4B vertices
```

**Step 3: Fix MeshSubdivision.ts line 122** (same function, same fix)
```typescript
return BigInt(lo) * BigInt(0x100000000) + BigInt(hi);
```

**Step 4: Run tests to confirm fix**
Run: `npm run test -- ChainStripOptimizer.test MeshSubdivision.test`
Expected: All pass

**Step 5: Commit**
```bash
git add src/renderers/webgpu/parametric/ChainStripOptimizer.ts \
        src/renderers/webgpu/parametric/MeshSubdivision.ts \
        src/renderers/webgpu/parametric/ChainStripOptimizer.test.ts
git commit -m "fix(optimizer): fix BigInt edge key collision above 1M vertices (C3)

Multiplier 0x100000 (1,048,576) caused edgeKey collisions at ultra
profile vertex counts. Changed to 0x100000000 (2^32) in both
ChainStripOptimizer and MeshSubdivision."
```

---

### Task 1.4 — Fix featureEdgesToLockedQuads stride

**Bug:** C4 from code review.
**File:** `src/renderers/webgpu/parametric/FeatureEdgeGraph.ts`, `featureEdgesToLockedQuads`

The function indexes quads as `row * numU + col` (vertex-column stride).
`MeshOptimizer.chainDirectedFlip` indexes quads as `row * (numU - 1) + col` (cell-column stride).
For `numU = 700`: off by `+row` for every row > 0. Feature-edge protection is silently absent.

**Step 1: Write failing test**
File: `src/renderers/webgpu/parametric/FeatureEdgeGraph.test.ts`

```typescript
it('C4-regression: featureEdgesToLockedQuads produces cell-stride quad indices', () => {
  // 4×3 grid: numU=4 → cellsPerRow=3
  // Edge from vertex (row=1, col=2) to (row=2, col=2)
  // Quad index for this cell = row * cellsPerRow + col = 1 * 3 + 2 = 5
  const graph: FeatureEdgeGraph = {
    edges: [{ v0: 1 * 4 + 2, v1: 2 * 4 + 2 }] // vertex indices with numU=4
  };
  const locked = featureEdgesToLockedQuads(graph, 4, 0);
  // With cellsPerRow = numU-1 = 3, the correct quad index at row=1, col=2 is 1*3+2=5
  expect(locked.has(5)).toBe(true);
  // NOT 1*4+2=6 (which is what the bug produces)
  expect(locked.has(6)).toBe(false);
});
```

Run: `npm run test -- FeatureEdgeGraph.test`
Expected: FAIL (currently returns 6, not 5)

**Step 2: Fix `featureEdgesToLockedQuads` in FeatureEdgeGraph.ts**

Find the two `locked.add(minRow * numU + ...)` lines inside the function and change both:
```typescript
// Before:
locked.add((minRow - 1) * numU + c0);
locked.add((minRow - 1) * numU + c1);
// ...
locked.add(minRow * numU + c0);
locked.add(minRow * numU + c1);

// After:
const stride = numU - 1; // cell stride, matching MeshOptimizer.chainDirectedFlip
if (minRow > 0) {
    locked.add((minRow - 1) * stride + c0);
    locked.add((minRow - 1) * stride + c1);
}
locked.add(minRow * stride + c0);
locked.add(minRow * stride + c1);
```

Also update the function signature's JSDoc to note the `stride = numU - 1` contract.

**Step 3: Run tests**
Run: `npm run test -- FeatureEdgeGraph.test MeshOptimizer.test`
Expected: All pass

**Step 4: Commit**
```bash
git add src/renderers/webgpu/parametric/FeatureEdgeGraph.ts \
        src/renderers/webgpu/parametric/FeatureEdgeGraph.test.ts
git commit -m "fix(graph): use cell-stride in featureEdgesToLockedQuads (C4)

Was using numU as stride, but MeshOptimizer uses numU-1 (cell count).
For numU=700 this caused all locked-quad indices to be wrong by +row,
silently disabling feature-edge protection in chainDirectedFlip."
```

---

### Task 1.5 — Fix T normalization in MeshSubdivision

**Bug:** C5 from code review.
**File:** `src/renderers/webgpu/parametric/MeshSubdivision.ts`, `identifyChainAdjacentVertices`, line 156

```typescript
const tNorm = (pt.row >= 0 && pt.row <= 1)
  ? pt.row          // BUG: row index 1 → tNorm = 1.0 regardless of grid height
  : Math.max(0, Math.min(1, pt.row / denom));
```

For a 3-row grid (denom=2), row=1 should give tNorm=0.5 but the guard returns 1.0.
Feature-adjacent vertex identification uses wrong T, producing wrong subdivision targets.

**Step 1: Write failing test**
File: `src/renderers/webgpu/parametric/MeshSubdivision.test.ts`

```typescript
it('C5-regression: identifyChainAdjacentVertices normalizes row=1 correctly for 3-row grid', () => {
  // 3-row grid: rows 0, 1, 2 → T = 0.0, 0.5, 1.0
  // Chain at row=1 should produce tNorm=0.5, NOT 1.0
  const verts = new Float32Array([
    0.5, 0.5, 0, // vertex at U=0.5, T=0.5 (should be adjacent to chain at row=1)
  ]);
  const chains: ChainUV[] = [{ points: [{ u: 0.5, row: 1 }], kind: 'peak' }];
  const adjacent = identifyChainAdjacentVertices(verts, 1, chains, 0.1, 3 /* outerH */);
  expect(adjacent.has(0)).toBe(true); // vertex IS adjacent — tNorm should be 0.5 not 1.0
});
```

Run: `npm run test -- MeshSubdivision.test`
Expected: FAIL (currently tNorm=1.0 for row=1, vertex not recognized as adjacent)

**Step 2: Fix the T normalization guard**

Replace lines 156–158 with:
```typescript
// Always normalize: pt.row is an integer row index.
// denom = outerH - 1 (last row index = T=1).
const tNorm = denom > 0 ? Math.max(0, Math.min(1, pt.row / denom)) : 0;
```

**Step 3: Run tests**
Run: `npm run test -- MeshSubdivision.test`
Expected: All pass

**Step 4: Commit**
```bash
git add src/renderers/webgpu/parametric/MeshSubdivision.ts \
        src/renderers/webgpu/parametric/MeshSubdivision.test.ts
git commit -m "fix(subdivision): remove T normalization guard for 2–3 row grids (C5)

Guard caused row index 1 to map to tNorm=1.0 regardless of grid height.
For a 3-row grid, row=1 should normalize to tNorm=0.5. Removed the
shortcut and always compute row/denom."
```

---

## Phase 2 — High-Priority Functional Fixes (P1)

All Phase 1 bugs must be fixed before starting Phase 2. These are correctness issues
that affect specific validation paths or cause incorrect behavior in named conditions.

---

### Task 2.1 — Fix position error units in checkFidelityCPU

**Bug:** I5 from code review.
**File:** `src/renderers/webgpu/parametric/MeshValidator.ts`, `checkFidelityCPU`

```typescript
// Current (wrong units: mm²·rad)
const chordErr = lenSq * theta / 8;
posErrors.push(Math.sqrt(chordErr)); // sqrt(mm²·rad) ≠ mm
```

The p95 position error is compared against `epsPosMm` (mm). Wrong units make the
comparison meaningless — every mesh passes or fails the gate incorrectly.

**Fix:**
```typescript
// Correct: chord ≈ sqrt(lenSq) × (theta / 2), in mm
const chordErr = Math.sqrt(lenSq) * (theta / 2);
posErrors.push(chordErr);
```

Write a test: a flat mesh with a known edge length and angle produces `chordErr`
equal to the expected chord length within float tolerance.

---

### Task 2.2 — Fix `kind` field dropped in `resnapChainToMeasuredPeaks`

**Bug:** I6 from code review.
**File:** `src/renderers/webgpu/parametric/ChainLinker.ts`, `resnapChainToMeasuredPeaks`, ~line 207

```typescript
return { points }; // BUG: kind is dropped
```

`OuterWallTessellator` and `MeshOptimizer` check `chain.kind === 'peak'` to decide
diagonal flip direction. When `kind` is `undefined` (because it was dropped), every
chain evaluates as non-peak (valley), and peak diagonals are flipped in the wrong direction.

**Fix:**
```typescript
return { points, kind: chain.kind };
```

**Regression test in ChainLinker.test.ts:**
```typescript
it('I6-regression: resnapChainToMeasuredPeaks preserves chain.kind', () => {
  const chain: FeatureChain = {
    points: [{ u: 0.5, row: 0 }, { u: 0.5, row: 1 }],
    kind: 'peak'
  };
  const snapped = resnapChainToMeasuredPeaks(chain, /* mockPeaks */ []);
  expect(snapped.kind).toBe('peak');
});
```

---

### Task 2.3 — Fix O(n²) `buildMetricField` in SurfaceMetric

**Bug:** I4 from code review.
**File:** `src/renderers/webgpu/parametric/SurfaceMetric.ts`, `buildMetricField`

The function scans the entire importance grid for every vertex to find the nearest cell.
At standard profile (350K vertices × 350K grid cells) this is 122.5B comparisons.
The browser tab freezes.

**Fix — O(1) lookup using UV coordinates already on the vertex:**
```typescript
// Replace the scan loop with a direct closed-form lookup.
// Vertex UV coords are normalized [0,1], so the containing grid cell is:
function metricForVertex(u: number, t: number, field: ImportanceField): number {
    const gridU = Math.min(field.resU - 1, Math.floor(u * field.resU));
    const gridT = Math.min(field.resT - 1, Math.floor(t * field.resT));
    return field.data[gridT * field.resU + gridU];
}
```

Write a benchmark test confirming `buildMetricField` runs in <10ms for 350K vertices.

---

### Task 2.4 — Fix distortion gate omission in `validateMeshGPU`

**Bug:** I2 from code review.
**File:** `src/renderers/webgpu/parametric/MeshValidator.ts`, `validateMeshGPU`

The CPU path includes `(distortion?.ok ?? true)` in the `valid` computation.
The GPU path omits it: when `distortionGating` feature flag is enabled, the GPU path
always reports `valid: true` for distortion regardless of actual check result.

**Fix:** Add the missing conjunction to `validateMeshGPU`'s `valid` computation:
```typescript
const valid = (fidelity?.ok ?? true)
    && (distortion?.ok ?? true) // <-- add this line
    && (seam?.ok ?? true);
```

---

### Task 2.5 — Remove console.log from library modules

**Bug:** I7 from code review.
**Files:**
- `ChainLinker.ts` lines 545–547
- `CurvatureSampler.ts` line 113

Pure computation modules must not emit to global console — `ConsolePatch` in `main.tsx`
intercepts all `console.*` output for the debug overlay. Library noise pollutes it.

**Fix:** Remove the `console.log` calls. If timing data is needed, accept an optional
`ProgressCallback` (already defined in `types.ts`) and call it instead:
```typescript
// In ChainLinker.ts function signature:
function resnapChainToMeasuredPeaks(
  chain: FeatureChain,
  peaks: FeaturePoint[],
  onProgress?: ProgressCallback, // add this
): FeatureChain {
  // Replace: console.log(`[ChainLinker] resnap: ${time}ms`)
  // With:    onProgress?.('resnap', 1.0);
}
```

---

### Task 2.6 — Deduplicate `circularDistance` utility

**Bug:** I8 from code review.
**Files:**
- `src/renderers/webgpu/parametric/FeatureDetection.ts`
- `src/renderers/webgpu/parametric/ChainLinker.ts`

Both export `circularDistance`. Two implementations = divergence risk.

**Fix:** Keep the canonical implementation in `ChainLinker.ts`, re-export from `FeatureDetection.ts`:
```typescript
// In FeatureDetection.ts — replace the implementation with:
export { circularDistance } from './ChainLinker';
```

Write a test asserting both imports produce the same value for the same inputs.

---

## Phase 3 — Test Coverage Gaps

The code review found six specific gaps where existing tests cannot detect known bugs.
Each gap needs a dedicated regression test that would have caught the bug.

---

### Task 3.1 — Regression test: chain edges non-empty when chains provided

**Gap:** OuterWallTessellator integration tests never verify `result.chainEdges.length > 0`.
The dead-code bug (C1) was undetectable by any existing test.

After Task 1.1, the architecture no longer tracks chain edges (UV snapping is the mechanism).
The new test should verify that UV snapping actually fires and measurably adjusts vertex positions
when chains are present:

```typescript
it('buildCDTOuterWall with a chain: snapped column is closer to chain U than unsnapped', () => {
  const unsnappedResult = buildCDTOuterWall(params, []);
  const chainResult = buildCDTOuterWall(params, [{
    points: [{ u: 0.499, row: 1 }, { u: 0.499, row: 2 }],
    kind: 'peak'
  }]);
  // Column nearest to U=0.499 should shift toward 0.499
  const colDeltaUnsnapped = Math.abs(nearestColU(unsnappedResult, 0.499) - 0.499);
  const colDeltaSnapped = Math.abs(nearestColU(chainResult, 0.499) - 0.499);
  expect(colDeltaSnapped).toBeLessThan(colDeltaUnsnapped);
});
```

---

### Task 3.2 — Regression test: percentile scale contract

**Gap:** No test caught the 0–100 vs 0–1 mismatch (C2).

After Task 1.2, add a cross-module test:
```typescript
// In a new file: src/renderers/webgpu/parametric/validator-refinement.integration.test.ts
it('C2-cross-module: MeshValidator percentile calls use [0,1] convention', () => {
  // Build a sorted array where the difference between p1 and p95 is large
  const sorted = Array.from({ length: 1000 }, (_, i) => i / 10); // 0..99.9
  expect(percentile(sorted, 0.95)).toBeCloseTo(94.95, 1); // 95th percentile ≈ 95
  expect(percentile(sorted, 0.01)).toBeCloseTo(9.99, 1);  // 1st percentile ≈ 1, NOT 95th
});
```

---

### Task 3.3 — Regression test: locked-quad stride compatibility

**Gap:** No test verifies that `featureEdgesToLockedQuads` produces indices that match
`MeshOptimizer.chainDirectedFlip`'s quad map stride (C4 gap).

After Task 1.4, add an integration test:
```typescript
// In FeatureEdgeGraph.test.ts
it('C4-cross-module: locked quad indices use cell-stride matching MeshOptimizer', () => {
  const numU = 5;  // 5 columns → 4 cells per row
  const graph: FeatureEdgeGraph = {
    edges: [{ v0: 0 * numU + 2, v1: 1 * numU + 2 }] // edge at col=2, row 0→1
  };
  const locked = featureEdgesToLockedQuads(graph, numU, 0);
  // Cell at row=0, col=2: index = 0 * (numU-1) + 2 = 0*4+2 = 2
  expect(locked.has(2)).toBe(true);
  // Verify NOT vertex-stride index (0*5+2 = 2 happens to be same here; use row>0 case)
  const graph2: FeatureEdgeGraph = {
    edges: [{ v0: 1 * numU + 2, v1: 2 * numU + 2 }]
  };
  const locked2 = featureEdgesToLockedQuads(graph2, numU, 0);
  // Cell at row=1, col=2: index = 1*4+2 = 6 (cell stride)
  // Bug would produce: 1*5+2 = 7 (vertex stride)
  expect(locked2.has(6)).toBe(true);
  expect(locked2.has(7)).toBe(false);
});
```

---

### Task 3.4 — Integration test with real chains

**Gap:** `fidelity.integration.test.ts` runs the pipeline with empty `chains: []`.
The primary purpose of the pipeline — chain-constrained tessellation — is never exercised.

Add a dedicated integration test that runs the full pipeline with a synthetic chain and
asserts a measurable quality metric:

```typescript
// In fidelity.integration.test.ts (extend existing file)
describe('Pipeline with feature chains', () => {
  it('exports a mesh where grid columns are snapped near chain U positions', async () => {
    const chainU = 0.333;
    const result = await runPipeline({
      // ...standard params...
      chains: [{
        points: Array.from({ length: 20 }, (_, row) => ({ u: chainU, row })),
        kind: 'peak'
      }]
    });
    // After UV snapping, at least one column should be within 1 grid cell width of chainU
    const nearestColDist = result.outerWall.nearestColumnU(chainU);
    expect(nearestColDist).toBeLessThan(1 / result.outerWall.numU * 2);
  });
});
```

---

### Task 3.5 — Regression test: kind preserved through resnap

**Gap:** No test asserts `chain.kind` survives `resnapChainToMeasuredPeaks` (I6 gap).
(This test is included in Task 2.2 above — ensure it is in place.)

---

### Task 3.6 — Test: SurfaceEvaluator wiring

After Task 4.1 (wire orphaned SurfaceEvaluator), add:
```typescript
it('orchestrator evaluatePoints delegates to SurfaceEvaluator.evaluateBatch', () => {
  // Spy on SurfaceEvaluator.evaluateBatch
  const spy = vi.spyOn(SurfaceEvaluator, 'evaluateBatch');
  const computer = new ParametricExportComputer(device);
  await computer.compute(params);
  expect(spy).toHaveBeenCalled();
});
```

---

## Phase 4 — Architecture Completion (P2)

These tasks complete the modular decomposition and eliminate remaining structural issues.

---

### Task 4.1 — Wire orchestrator to SurfaceEvaluator and CurvatureSampler

**Issue:** I1 from code review.
**Files:**
- `src/renderers/webgpu/ParametricExportComputer.ts` (orchestrator)
- `src/renderers/webgpu/parametric/SurfaceEvaluator.ts` (orphaned)
- `src/renderers/webgpu/parametric/CurvatureSampler.ts` (orphaned)

The orchestrator has 156 lines of inline `evaluatePoints()` (lines 212–368) and 138
lines of inline curvature sampling (lines 465–545) that are functionally identical to the
extracted modules. Neither module is imported.

**Approach A (recommended): Wire the orchestrator to use the extracted modules.**

1. Import `SurfaceEvaluator` and `CurvatureSampler` at the top of `ParametricExportComputer.ts`
2. Replace the inline `evaluatePoints()` with `SurfaceEvaluator.evaluateBatch()`
3. Replace the inline curvature sampling loop with `CurvatureSampler.sampleCurvature()`
4. Delete the orphaned inline blocks

**Approach B (simpler but worse): Delete the orphaned modules.**

If wiring is blocked by parameter shape mismatch, delete `SurfaceEvaluator.ts` and
`CurvatureSampler.ts` to prevent future confusion. Document that these remain inline.

Approach A is strongly preferred — two implementations of the same logic will inevitably
diverge and create silent bugs.

---

### Task 4.2 — Fix seam cluster bug in `buildUnionFeatureGrid`

**Issue:** I3 from code review.
**File:** `src/renderers/webgpu/parametric/GridBuilder.ts`, `buildUnionFeatureGrid`

The linear clustering sorts `allPeaks` in `[0, 1)`. A feature at U=0.998 and one at
U=0.003 are 0.005 apart circularly but land at opposite ends of the sorted array.
They get separate representative columns instead of merging to one.

This is currently routed around by `LOCAL_ONLY_OUTER_ADAPTATION = true`, but the flag
will be removed when the full adaptive path is enabled.

**Fix:** After the linear clustering pass, add a seam-wrap merge step:

```typescript
// After clustering:
// If first and last cluster are within FEATURE_CLUSTER_RADIUS when measured circularly,
// merge the tail cluster into the head cluster.
if (clusters.length > 1) {
    const headCenter = clusters[0].representative;
    const tailCenter = clusters[clusters.length - 1].representative;
    const circDist = Math.min(
        Math.abs(headCenter - tailCenter),
        1.0 - Math.abs(headCenter - tailCenter)
    );
    if (circDist < FEATURE_CLUSTER_RADIUS) {
        // Merge: keep head, drop tail
        clusters.pop();
    }
}
```

Write a test with two features at U=0.001 and U=0.999 (0.002 apart circularly)
and assert they produce one cluster, not two.

---

### Task 4.3 — Move global debug state into ParametricExportResult

**Issue:** M6 from code review.
**File:** `src/renderers/webgpu/ParametricExportComputer.ts`

```typescript
// Current: module-level mutable globals — concurrent exports corrupt each other's data
let LAST_CHAIN_DEBUG_DATA: ChainDebugData | null = null;
let LAST_PEAK_DEBUG_DATA: PeakDebugData | null = null;
```

**Fix:** Add optional debug fields to `ParametricExportResult` in `types.ts`:
```typescript
// In types.ts, extend ParametricExportResult:
chainDebugData?: ChainDebugData;
peakDebugData?: PeakDebugData;
```

Update the orchestrator to populate these fields on the result object instead of
storing in module globals. Update `useParametricExport.ts` to read from result.

---

### Task 4.4 — Minor cleanups (M1–M5)

Batch the minor issues into one commit:

- **M1**: Remove empty `if` block in `contracts.ts` lines 389–392
- **M2**: Remove duplicate comment in `ParametricExportComputer.ts` lines 91–93
- **M3**: Change `uL + EPSILON` to `uL - EPSILON` in `SeamTopology.ts` line 402–407
- **M4**: Recalibrate `ultraSeamThreshold` in `SeamTopology.ts` (0.02mm is impossible at 700 cols; should be ~0.5mm or measure actual 3D vertex gap)
- **M5**: Replace string key deduplication in `SurfaceMetric.edgeLengthStats` with BigInt keys (reuse fixed `edgeKey` from Task 1.3)

---

## Phase 5 — Open Pipeline Issues (Known Bugs from Journal/CLAUDE.md)

These are the structural pipeline problems that predate the modular refactor.
All Phase 1–4 tasks must complete before addressing these, as the fixes in Phases 1–2
may change the observable symptoms.

---

### Task 5.1 — Fix missing chain edges at seam (135 chains)

**Source:** CLAUDE.md "Known Issues", journal entry v16.x
**File:** `OuterWallTessellator.ts`, `applyUVSnapping`

The seam sits at U=0/U=1. A chain crossing this seam (e.g. a ridge that passes through
U=0.999 in one row and U=0.001 in the next row) is currently skipped because
`Math.abs(du) > SEAM_THRESHOLD` (cross-seam edge guard).

After Phase 1 (C1 fix), UV snapping is the only enforcement mechanism. For seam-crossing
chains, snapping cannot work because the chain jumps from U≈1 to U≈0 across rows.

**Investigation steps:**
1. Add logging to `applyUVSnapping` to count how many chain points have `|du| > SEAM_THRESHOLD` (skipped).
2. Confirm 135 is the correct count at a test case.
3. Design a seam-aware snapping strategy:
   - Option A: Snap both seam columns (col=0 at U=0 and col=numU-1 at U=1) to the seam-adjacent chain positions
   - Option B: Insert a dedicated U=0 column and snap it to the cross-seam chain position
   - Option C: Treat seam-crossing chains as two independent half-chains, each snapped on its own side

This is a design task before a code task. Investigate and document the approach before
writing code.

---

### Task 5.2 — Address low-valence vertices (53% < valence 5)

**Source:** CLAUDE.md "Known Issues"
**Context:** Chain-vertex topology was the source of the low-valence problem.

After Phase 1 (C1 fix, dead chain vertices removed), run the valence analysis again
to establish the new baseline. The percentage may change because the dead chain-vertex
infrastructure was not actually contributing extra vertices (it was cleared before use).

**If the 53% figure persists after C1 fix:**
- The root cause is the UV-snapping topology: every snapped column in a row creates a
  narrow strip where the diagonal is oriented toward the ridge, producing triangles that
  share few edges with their neighbours.
- The subdivision pass (MeshSubdivision) should address this by inserting midpoints along
  long edges adjacent to chain vertices.
- Investigate whether `identifyChainAdjacentVertices` (after C5 fix) correctly marks the
  chain-adjacent vertices for the subdivision pass.

**Acceptance criterion:** After subdivision, at least 80% of outer-wall vertices should
have valence ≥ 5.

---

### Task 5.3 — Eliminate tall cross-row triangles

**Source:** CLAUDE.md "Known Issues"
**File:** `src/renderers/webgpu/parametric/MeshSubdivision.ts`

Long-edge subdivision splits the longest edge in a triangle, but not specifically
cross-row triangles (triangles that span multiple T rows without a horizontal edge).
These appear as elongated triangles in the Z direction in the STL viewer.

**Investigation:**
1. Write a mesh quality check: for each triangle, compute the aspect ratio in UV space.
   Flag triangles where the T-span > 2 × U-span as "cross-row tall".
2. After computing the baseline, determine whether the issue is:
   - A. The subdivision threshold is too coarse (increase iterations)
   - B. The subdivision target is wrong (targeting length, not aspect ratio)
   - C. The grid itself has too few rows in the affected region

**Fix direction:** Add an aspect-ratio condition to the subdivision trigger:
```typescript
// In MeshSubdivision.ts, refinement trigger:
// Current: split if edge length > threshold
// Proposed: ALSO split if tri aspect ratio > maxAspectRatio from quality profile
const aspectRatio = computeAspectRatio(v0, v1, v2);
if (aspectRatio > profile.tolerances.maxAspectRatio) {
    // Split the longest edge
}
```

---

### Task 5.4 — Validate and close diagonal boundary crease investigation

**Source:** CLAUDE.md "Known Issues", v16.32–v16.34 journal entries
**Current state:** `CHAIN_LOCK_BAND_HALF_WIDTH = 1` (v16.32), boundary diagonal optimization (v16.34)
**Regression test:** `ParametricExportComputer.diagonalConsistency.test.ts` (exists)

The diagonal crease at the boundary between chain-locked and standard cells was the
subject of 4 revisions (v16.32–v16.34). v16.34 added boundary diagonal optimization.

**Validation task:**
1. Run `ParametricExportComputer.diagonalConsistency.test.ts` and confirm all tests pass.
2. Export a ridged-style pot (e.g. style ID 5 or 6) and inspect the STL in PrusaSlicer.
3. If the crease is gone, document it as closed in the journal.
4. If the crease persists, add a diagnostic: measure dihedral angle at the chain-strip
   boundary and compare with the interior. Any dihedral > 150° is a crease.

---

## Phase 6 — Pipeline Quality Goals

These tasks are not bug fixes — they are quality gates and validation passes that prove
the pipeline meets the stated goals across all 20 styles.

---

### Task 6.1 — Style coverage validation: all 20 styles produce correct geometry

**Goal:** Mathematical correctness for all 20 registered styles (IDs 0–19).
**Files:** `src/styles/registry.ts` (style list), `src/geometry/styles.ts` (CPU evaluation)

Write a parametric pipeline smoke test for each style:
1. Export at `draft` quality profile
2. Verify: vertex count > 0, triangle count > 0, no NaN/Inf positions
3. Verify: bounding box matches expected dimensions within 5% tolerance
4. Verify: `tolerancesPassed === true` (after C2 fix)

Run these as part of the standard test suite. Mark styles with known issues (seam-crossing
chains) as SKIP with a linked GitHub issue.

---

### Task 6.2 — Watertight verification in MeshValidator

**Goal:** SLA/Resin 3D print readiness — every exported mesh must be watertight.
**File:** `src/renderers/webgpu/parametric/MeshValidator.ts`

Add a `checkWatertight()` validation method:
```typescript
function checkWatertight(mesh: MeshData): ValidationResult {
    // Build edge-to-triangle map
    // Any edge with only 1 adjacent triangle is a boundary edge (open)
    // A watertight mesh has 0 open edges
    const openEdges = countOpenEdges(mesh);
    return {
        ok: openEdges === 0,
        detail: `${openEdges} open edges`
    };
}
```

Wire it into `validateMesh()` and expose in `ParametricExportResult`.

**Note:** This check is only meaningful after seam vertices are correctly welded.
Coordinate with the seam fix (Task 5.1) — the seam is the #1 source of false open edges.

---

### Task 6.3 — Normal quality gate

**Goal:** Surface smoothness — no oscillating normals at feature ridges.

The current pipeline produces positions only (no normals in the GPU buffer). STL normals
are computed per-face from the triangle geometry. For smooth slicer visualization,
adjacent triangle normals should not differ by more than 20° at interior edges.

Add to `MeshValidator`:
```typescript
function checkNormalSmoothness(mesh: MeshData): ValidationResult {
    const maxDeviation = maxAdjacentNormalDeviation(mesh);
    return {
        ok: maxDeviation < profile.tolerances.epsNormalDeg,
        detail: `max normal deviation: ${maxDeviation.toFixed(1)}°`
    };
}
```

**Acceptance criterion:** At `standard` profile, max adjacent normal deviation < 30°
everywhere except intentional feature edges (ridges/valleys). Feature edges are allowed
up to 60°.

---

### Task 6.4 — Performance baseline: export time targets by profile

**Goal:** Ensure the pipeline runs in reasonable time after Phase 3 fixes (especially
the O(n²) buildMetricField fix in Task 2.3).

Establish performance targets:
| Profile | Max export time |
|---|---|
| draft | < 500ms |
| standard | < 2s |
| high | < 8s |
| ultra | < 30s |

Write a benchmark test that times `ParametricExportComputer.compute()` for a
medium-complexity style (e.g. style 7) at each profile and fails if the target is exceeded.

---

### Task 6.5 — Seam quality end-to-end test

**Goal:** U=0/U=1 seam: no visible crease in slicer.

After the seam cluster fix (Task 4.2) and seam chain fix (Task 5.1), add an
end-to-end seam quality test:

1. Export style 0 (base style, no feature ridges) at `standard` profile
2. Find all triangles with one vertex at U≈0 and one at U≈1 (seam triangles)
3. Assert: no seam triangles exist (seam is closed by welded vertices, not bridged by triangles)
4. Find all pairs of vertices that should be welded at the seam (U=0 and U=1 at the same T)
5. Assert: 3D distance between seam-pair vertices < 0.01mm

---

## Summary and Sequencing

```
Phase 1 (P0 — Critical Bug Fixes)
  1.1 Remove dead chain-vertex infrastructure        ← 2h
  1.2 Fix percentile scale (0–100 → 0–1)            ← 1h
  1.3 Fix BigInt collision bound                     ← 30min
  1.4 Fix featureEdgesToLockedQuads stride           ← 1h
  1.5 Fix T normalization in MeshSubdivision         ← 1h

Phase 2 (P1 — Important Fixes)
  2.1 Fix position error units (mm²·rad → mm)        ← 1h
  2.2 Fix kind field dropped in resnapChain          ← 30min
  2.3 Fix O(n²) buildMetricField                    ← 1h
  2.4 Fix distortion gate omission in GPU path      ← 30min
  2.5 Remove console.log from library modules       ← 30min
  2.6 Deduplicate circularDistance                  ← 30min

Phase 3 (P1 — Test Coverage Gaps)
  3.1 Regression: chain snapping effectiveness      ← 1h
  3.2 Regression: percentile scale cross-module     ← 30min
  3.3 Regression: locked-quad stride compatibility  ← 1h
  3.4 Integration test with real chains             ← 2h
  3.5 Regression: kind preserved through resnap     ← 30min (in Task 2.2)
  3.6 Test: SurfaceEvaluator wiring                 ← 1h (after Task 4.1)

Phase 4 (P2 — Architecture Completion)
  4.1 Wire orphaned SurfaceEvaluator/CurvatureSampler  ← 3h
  4.2 Fix seam cluster in buildUnionFeatureGrid        ← 2h
  4.3 Move global debug state into result              ← 1h
  4.4 Minor cleanups M1–M5                            ← 1h

Phase 5 (P2 — Open Pipeline Issues)
  5.1 Fix missing chain edges at seam               ← Investigation + 4h
  5.2 Address low-valence vertices                  ← Investigation + 4h
  5.3 Eliminate tall cross-row triangles            ← 3h
  5.4 Validate diagonal boundary crease             ← 2h

Phase 6 (P3 — Quality Gates)
  6.1 Style coverage: all 20 styles validated       ← 3h
  6.2 Watertight verification in MeshValidator      ← 2h
  6.3 Normal quality gate                           ← 2h
  6.4 Performance baseline benchmarks               ← 1h
  6.5 Seam quality end-to-end test                  ← 2h
```

**Total estimated effort: ~50–60 hours across all phases.**

Phases 1–3 can and should be completed as a single focused sprint (approx. 12–15h).
Phases 4–5 can run in parallel with normal feature work.
Phase 6 represents the final acceptance criteria for "production ready for SLA printing".

---

## Architectural Decisions That Must Not Change

The following were hard-won decisions documented in the agents journal. Do not revert them
while executing this plan:

| Decision | Rationale |
|---|---|
| No `cdt2d` in parametric pipeline | O(n²) at production scale — 12+ minutes |
| No CDF-adaptive grid spacing | Caused visible "density band" artifacts |
| No stitch fan vertices | Created visible rings around feature edges |
| `CHAIN_LOCK_BAND_HALF_WIDTH = 1` | Lock=0 re-enables diagonal crease bug |
| UV snapping (v20.0) as enforcement mechanism | Avoids bridge-triangle topology |
| `LOCAL_ONLY_OUTER_ADAPTATION = true` | Full adaptive path is incomplete; seam cluster bug (I3) not yet fixed |
