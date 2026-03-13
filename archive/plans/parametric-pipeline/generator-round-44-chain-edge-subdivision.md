# Generator Round 44 — Chain Edge Subdivision

Date: 2026-03-08

## Problem Statement

Chain edges — the edges connecting consecutive chain vertices along the ridge path — are **completely excluded from GPU subdivision** in `MeshSubdivision.ts`. Two independent mechanisms block them:

1. **Block 1** (line 372): `constraintEdgeSet.has(ek) → continue` unconditionally skips all chain edges.
2. **Block 2** (line 383): `isFeatureEdge = (v0 < outerGridVertexCount) !== (v1 < outerGridVertexCount)` — the XOR catch is for cross-edges only. Chain-to-chain edges have BOTH vertices ≥ `outerGridVertexCount`, so XOR = false. Even if Block 1 didn't exist, chain-to-chain edges wouldn't be classified as feature edges.

**Consequence**: Ridge resolution is locked at row-spacing (~0.77mm). Each edge has ~0.9mm of lateral (U) shift between consecutive rows. This creates visible ~45° zigzag teeth at every row boundary. Rounds 40–43 (topology fixes, smoothing) had zero visual impact because the chain edges themselves were frozen.

**Secondary issue**: Debug visualization builds polylines from `preSmoothChains` (line ~1251 of ParametricExportComputer.ts) while the mesh uses `meshChains` (WH-smoothed). The debug overlay doesn't match the actual mesh.

---

## Root Cause Analysis

### The constraintEdgeSet Path

`outerChainEdges` are produced by `OuterWallTessellator.ts` at line 802:
```typescript
chainEdges.push([p0.vertexIdx, p1.vertexIdx]);
```
These are consecutive chain vertex connections (same chain, adjacent rows).

At `ParametricExportComputer.ts:1555`:
```typescript
const constraintEdgeSet = buildConstraintEdgeSet(outerChainEdges);
```

`buildConstraintEdgeSet` (`ChainStripOptimizer.ts:321–327`) inserts every chain edge as a BigInt key:
```typescript
export function buildConstraintEdgeSet(outerChainEdges: [number, number][]): Set<bigint> {
  const set = new Set<bigint>();
  for (const [v0, v1] of outerChainEdges) {
    set.add(edgeKey(v0, v1));
  }
  return set;
}
```

This set is passed to `subdivideLongEdges` specifically to protect chain edges from edge flips in `ChainStripOptimizer`. Its reuse in subdivision as an unconditional skip was an overly aggressive guard — it correctly prevents flips but incorrectly prevents subdivision.

### The Feature Edge Classification Path

At `MeshSubdivision.ts:383`:
```typescript
const isFeatureEdge = (v0 < outerGridVertexCount) !== (v1 < outerGridVertexCount);
```

This catches cross-edges (one grid vertex, one chain vertex). For these edges, the feature threshold (0.579mm) applies instead of the interior threshold (1.389mm). But chain-to-chain edges have both vertices ≥ `outerGridVertexCount`, so XOR = false → classified as interior → gets the interior threshold (1.389mm) which is above their length (0.77mm). Even without Block 1, they'd never be subdivided.

**Note**: `batch2Remap` in the tessellator (line 876–881) can remap chain vertex indices to grid vertex indices. After remapping, a "chain edge" might have one or both endpoints < `outerGridVertexCount`. The `constraintEdgeSet` membership is the reliable identifier — it captures ALL chain edges regardless of index remapping.

### Metrics

| Metric | Value | Formula |
|--------|-------|---------|
| avgGridEdge | ~0.772mm | sampled from grid |
| Interior threshold² | (0.772 × 1.8)² = 1.930 | `subdivThreshold2` |
| Feature threshold² | (0.772 × 0.75)² = 0.335 | `featureSubdivThreshold2` |
| Boundary threshold² | (0.772 × 1.2)² = 0.858 | `boundarySubdivThreshold2` |
| Chain edge length | ~0.77mm → len² ≈ 0.593 | measured |
| Chain edge vs feature threshold | 0.593 > 0.335 | **ELIGIBLE for split** |
| After 1 split | ~0.385mm → len² ≈ 0.148 | half length |
| Half-edge vs feature threshold | 0.148 < 0.335 | **won't split again** |

**Result**: Each chain edge gets exactly one level of subdivision → 2× ridge resolution.

---

## Proposals

### Proposal 1: Chain Edge Subdivision (PRIMARY)

**Idea**: Remove the unconditional constraint-edge skip and add chain-to-chain classification as feature edges.

**Mechanism**: The `constraintEdgeSet.has(ek)` check, which currently causes an unconditional `continue`, is repurposed as a *positive* identifier: edges in this set are chain edges and should be classified as feature edges (eligible for the tighter subdivision threshold).

**Mathematical basis**: Chain edges at ~0.77mm exceed the feature threshold at 0.579mm. After one midpoint split, each half is ~0.385mm < 0.579mm, so no further splitting occurs. The midpoint UV is GPU-evaluated to an on-surface 3D position, giving exact parametric surface resolution at the ridge midpoint between rows. This halves the zigzag amplitude by interpolating the true ridge trajectory between row boundaries.

**Files affected**: `potfoundry-web/src/renderers/webgpu/parametric/MeshSubdivision.ts`

#### Exact Code Changes

**Change 1: Remove unconditional constraint-edge skip, add chain-chain feature classification**

Location: `subdivideLongEdges()`, lines 370–390 (the edge collection loop body)

```typescript
// ──────────────────────────────────────────────────────────────────
// BEFORE (lines 370–390):
// ──────────────────────────────────────────────────────────────────

    for (const [ek, tris] of subEdgeToTris) {
        if (tris.length !== 2) continue;
        if (constraintEdgeSet.has(ek)) continue;

        const v0 = Number(ek / BigInt(0x200000));
        const v1 = Number(ek % BigInt(0x200000));

        const dx = resultData[v0 * 3] - resultData[v1 * 3];
        const dy = resultData[v0 * 3 + 1] - resultData[v1 * 3 + 1];
        const dz = resultData[v0 * 3 + 2] - resultData[v1 * 3 + 2];
        const len2 = dx * dx + dy * dy + dz * dz;

        const isFeatureEdge = (v0 < outerGridVertexCount) !== (v1 < outerGridVertexCount);
        const isBoundaryEdge = (csTriSetNow.has(tris[0]) !== csTriSetNow.has(tris[1]));
        const threshold = isFeatureEdge
            ? featureSubdivThreshold2
            : (isBoundaryEdge ? boundarySubdivThreshold2 : subdivThreshold2);

        if (len2 > threshold) {
            edgesToSplit.push({ ek, v0, v1, len2, tris: [tris[0], tris[1]] });
        }
    }

// ──────────────────────────────────────────────────────────────────
// AFTER:
// ──────────────────────────────────────────────────────────────────

    for (const [ek, tris] of subEdgeToTris) {
        if (tris.length !== 2) continue;

        // R44: Chain-to-chain edges (in constraintEdgeSet) are subdivision
        // candidates — they define the ridge path and need higher resolution.
        // The set was built for flip-protection in ChainStripOptimizer;
        // reusing it as a subdivision skip locked ridge resolution at row spacing.
        const isChainEdge = constraintEdgeSet.has(ek);

        const v0 = Number(ek / BigInt(0x200000));
        const v1 = Number(ek % BigInt(0x200000));

        const dx = resultData[v0 * 3] - resultData[v1 * 3];
        const dy = resultData[v0 * 3 + 1] - resultData[v1 * 3 + 1];
        const dz = resultData[v0 * 3 + 2] - resultData[v1 * 3 + 2];
        const len2 = dx * dx + dy * dy + dz * dz;

        // R44: Chain edges are feature edges — they trace the ridge path.
        // Cross-edges (one grid, one chain vertex) were already caught by XOR.
        // Chain-to-chain edges (both ≥ outerGridVertexCount) need explicit inclusion.
        // Remapped chain edges (batch2Remap moved endpoint to grid index) are
        // also captured since constraintEdgeSet tracks the original edge topology.
        const isCrossEdge = (v0 < outerGridVertexCount) !== (v1 < outerGridVertexCount);
        const isFeatureEdge = isCrossEdge || isChainEdge;
        const isBoundaryEdge = (csTriSetNow.has(tris[0]) !== csTriSetNow.has(tris[1]));
        const threshold = isFeatureEdge
            ? featureSubdivThreshold2
            : (isBoundaryEdge ? boundarySubdivThreshold2 : subdivThreshold2);

        if (len2 > threshold) {
            edgesToSplit.push({ ek, v0, v1, len2, tris: [tris[0], tris[1]] });
        }
    }
```

**Change 2: Update the `isFeatureEdge` recomputation in the split-application loop**

Location: `subdivideLongEdges()`, line 399 (inside the Phase A dry-run loop)

The `isFeatureEdge` is recomputed to pass to `touchesProtectedPatch`. It must use the same logic:

```typescript
// ──────────────────────────────────────────────────────────────────
// BEFORE (line 399):
// ──────────────────────────────────────────────────────────────────

        const isFeatureEdge = (se.v0 < outerGridVertexCount) !== (se.v1 < outerGridVertexCount);

// ──────────────────────────────────────────────────────────────────
// AFTER:
// ──────────────────────────────────────────────────────────────────

        const isCrossEdge = (se.v0 < outerGridVertexCount) !== (se.v1 < outerGridVertexCount);
        const isFeatureEdge = isCrossEdge || constraintEdgeSet.has(se.ek);
```

**Effect on `touchesProtectedPatch`**: With `isFeatureEdge = true` for chain edges, the R42 protection logic only checks opposite vertices (not the edge endpoints themselves):
```typescript
// From touchesProtectedPatch (lines 391-398):
if (isFeatureEdge) {
    return protectedVertices.has(opp0) || protectedVertices.has(opp1);
}
```
This is correct: chain edge subdivision is topology-preserving (adds midpoint on the ridge path). It should only be blocked if the *opposite* vertices are in the phantom corridor, indicating the split triangle is fully inside a protected patch.

#### Trade-offs

| Pro | Con |
|-----|-----|
| 2× ridge resolution per chain edge | Increases triangle count by ~2× chain edges |
| GPU-evaluated midpoints are exact on-surface | One-time GPU dispatch for midpoint batch |
| No changes to CDT or chain linking | New midpoint vertices lack UV entries in `combinedVerts` (OK — subdivision is last step) |
| Preserves existing flip-protection semantics | If chain edges happen to be very short (< threshold), no improvement |

#### Assumptions (for Verifier to attack)

1. **Chain edges in `subEdgeToTris`**: Chain edges only appear in `subEdgeToTris` if at least one adjacent triangle is in `csTriSetNow` (chain-strip or boundary). This should always be true since chain edges by definition border chain-strip triangles.

2. **Chain edges have exactly 2 adjacent triangles**: The `tris.length !== 2` check at line 370 filters manifold edges. Chain edges should always be shared by exactly 2 triangles in the CDT output. If a chain edge is on the mesh boundary (only 1 adjacent tri), it won't be split — but this should only happen at the seam, and seam-crossing edges are already excluded from `outerChainEdges` by the tessellator.

3. **UV midpoint accuracy**: Both chain vertex endpoints have valid UV entries in `combinedVerts` (they are first-class vertices appended after grid vertices). The midpoint UV (wrapped-U average, T average) is evaluated by GPU to get the exact 3D surface position. This position lies ON the parametric surface, not on the chord between the two chain vertices.

4. **No second subdivision pass**: The code runs a single pass. New midpoint vertices don't get UV entries in `combinedVerts`. If a future change adds multi-pass subdivision, the UV array must be grown alongside the 3D array. Current single-pass architecture makes this safe.

5. **`maxSplits` budget is sufficient**: `maxSplits = floor((csTriCount + boundaryTris) × 0.5)`. With typical exports having 50–200 chain edges, and chain-strip regions having hundreds of triangles, the budget should accommodate the additional chain-edge splits.

6. **`constraintEdgeSet` membership is stable**: The set is built once from `outerChainEdges` before subdivision. No edges are added or removed during subdivision. Splitting a chain edge creates two new half-edges not in the set — they won't be re-split (single pass), and won't be misidentified as chain edges in any later logic.

---

### Proposal 2: Debug Visualization Alignment (SECONDARY)

**Idea**: Switch debug polyline generation from `preSmoothChains` to `meshChains` so the overlay matches the actual mesh edge positions.

**Mechanism**: The debug lines are purely visual — they show UV-space polylines on the preview surface. Currently they show raw (pre-smooth) chain positions while the mesh uses WH-smoothed chain positions. The user sees the polyline at one position and the mesh ridge at a different position.

**Files affected**: `potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts`

#### Exact Code Change

Location: line ~1251 (inside the debug line generation block)

```typescript
// ──────────────────────────────────────────────────────────────────
// BEFORE (line ~1251):
// ──────────────────────────────────────────────────────────────────

            for (const chain of preSmoothChains) {

// ──────────────────────────────────────────────────────────────────
// AFTER:
// ──────────────────────────────────────────────────────────────────

            // R44: Use meshChains (WH-smoothed) for debug lines so the overlay
            // matches actual mesh edge positions. The previous use of preSmoothChains
            // (v26) was motivated by matching debug dots, but the primary purpose of
            // debug lines is to verify where the mesh places ridge edges.
            for (const chain of meshChains) {
```

**Note on the v26 comment** (lines 1089–1092): The existing comment explains the intentional choice to use `preSmoothChains` so debug lines pass through debug dots (raw feature detections). This was reasonable when smoothing shifts were negligible, but R43's switch to full WH smoothing creates a visible mismatch. The user needs to see where the mesh actually puts ridge edges, not where the raw detections were. Debug dots already serve the raw-detection role independently.

#### Assumption (for Verifier to attack)

7. **`meshChains` and `preSmoothChains` use the same `.row` field**: WH smoothing only modifies `.u`, not `.row`. The `origToFinalRow` mapping uses `.row` to look up the final T position. This remains valid with `meshChains`.

---

## Expected Metrics Impact

### Subdivision Counts
- **Before R44**: Chain edges contribute 0 splits (fully blocked). Typical split counts come only from cross-edges (grid↔chain) and stretched interior edges.
- **After R44**: Each chain edge (~0.77mm) exceeding feature threshold (~0.579mm) adds 1 split. With ~50–200 chain edges per export, expect **+50–200 additional splits**, each adding 1 midpoint vertex and 2 new triangles (net +2 tris per split, replacing 2 with 4).

### Ridge Quality
- **Zigzag amplitude**: Currently ~0.45mm per tooth (half of 0.9mm lateral shift per edge). After subdivision, each chain edge is split into two half-edges, each with ~0.45mm lateral shift. The midpoint is GPU-evaluated to the true ridge position at the inter-row UV midpoint. Effective zigzag amplitude drops to ~0.22mm — a **~2× reduction**.
- **Visual smoothness**: The ridge path gains an intermediate point between every pair of row-boundary chain vertices. Instead of straight line segments cutting across ~45° angles, the path follows a piecewise-linear approximation with ~22° half-angles.

### Performance
- GPU midpoint evaluation: +50–200 points in the existing batch dispatch. Negligible cost (~0.1ms).
- Triangle count increase: ~2–4% of total mesh. Negligible STL size impact.

---

## Risk Assessment

### Low Risk
1. **Winding order**: The existing split code (Phase C, lines 460–520) already handles winding preservation for arbitrary triangle orientations. Chain-edge splits use the same codepath. No special logic needed.

2. **Constraint set integrity**: The `constraintEdgeSet` is consumed by `ChainStripOptimizer` (for flip protection) BEFORE `subdivideLongEdges` runs. Subdivision does not modify the set. The flip optimizer already completed its work with the constraint set intact.

3. **Single-pass safety**: No UV growth needed because subdivision runs once. New midpoint vertices are only used in the final STL output, which needs only 3D positions.

### Medium Risk
4. **Edge adjacency in `subEdgeToTris`**: Chain edges must appear in the `subEdgeToTris` map to be split candidates. They will only appear if their adjacent triangles are indexed (chain-strip or boundary pass). If a chain edge borders two non-chain-strip triangles (unlikely but possible with edge flips), it won't appear in the map and won't be split. **Mitigation**: The chain-strip detection (hybrid index + UV-proximity) should catch these triangles. Verify in logs that chain-edge split count matches expected chain edge count.

5. **Phantom corridor interaction**: Chain edges near phantom crossings may have protected opposite vertices. The `touchesProtectedPatch` check with `isFeatureEdge=true` correctly blocks these. **Mitigation**: Monitor `protectedRejects` count in subdivision stats. A large increase suggests phantom corridor geometry is blocking useful splits.

### Negligible Risk
6. **`maxSplits` overflow**: Extremely unlikely given the budget formula and typical chain-edge counts. Would silently cap at the limit — no crash or corruption.

---

## Test Implications

### Existing Tests
- `MeshSubdivision.test.ts`: Tests that use a `constraintEdgeSet` with chain edges should now see those edges being split instead of skipped. If any test ASSERTS that constraint edges are not split, it will need updating.
- `ChainStripOptimizer.test.ts`: Unchanged — the optimizer uses the constraint set for flip protection, which is a separate codepath.

### Recommended New Test
- A unit test for `subdivideLongEdges` that provides a `constraintEdgeSet` with chain-to-chain edges and verifies they ARE split when exceeding the feature threshold.

### Integration Verification
- After implementation, run a full export and check:
  - `[ParametricExport] Subdivision: N splits` — N should increase by ~chain-edge count
  - `protectedRejects` should not dramatically increase
  - Visual inspection: ridge teeth should be visibly finer (2× resolution)

---

## Open Questions

1. **Should the `constraintEdgeSet` JSDoc be updated?** The interface comment currently says "never split" (`SubdivisionParams.constraintEdgeSet` at line 82). After R44, it's "used for flip protection + feature classification in subdivision." The Verifier should verify this doesn't mislead future agents.

2. **Should `SubdivisionStats` gain a `chainEdgeSplits` counter?** A dedicated metric would help distinguish chain-edge splits from cross-edge splits in diagnostic output. Low priority but useful for debugging.

3. **Multi-pass subdivision future**: If someone adds a second pass, they'll need to grow `combinedVerts` alongside `resultData`. Should we leave a TODO comment about this at the end of Phase C? (Currently no iteration exists, so it's not a bug — just a footgun for future work.)

---

## Recommended Approach

**Implement Proposal 1 + Proposal 2 together.** Proposal 1 is the primary fix, Proposal 2 is a quality-of-life improvement that ensures the debug overlay reflects reality during development. Both are low-risk, precisely scoped, and independent of each other.

The total code delta is 6 changed lines in `MeshSubdivision.ts` (remove 1 line, modify 2 lines, add 3 comment lines) and 1 changed line in `ParametricExportComputer.ts`.
