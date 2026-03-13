# Verifier Round 44 — Critique of Chain Edge Subdivision Proposal

Date: 2026-03-08

## Summary Verdict

**Proposal 1 (Chain Edge Subdivision)**: ACCEPT WITH AMENDMENTS  
**Proposal 2 (Debug Vis Alignment)**: ACCEPT

The Generator's root cause analysis is correct and well-grounded. After 4 rounds of topology and smoothing fixes (R40–R43) with zero visual improvement, the proposal correctly identifies the **two independent mechanisms** that prevent chain edges from ever being subdivided. The proposed fix is minimal, targeted, and mathematically sound.

---

## Verification Results

### V1 [ACCEPT]: Chain edges in `subEdgeToTris`

**Generator's claim**: Chain edges appear in `subEdgeToTris` because their adjacent triangles are in `csTriSetNow`.

**Verification**: Read `identifyChainStripTriangles` at [MeshSubdivision.ts](../src/renderers/webgpu/parametric/MeshSubdivision.ts#L218-L249). The function identifies triangles by two criteria:
1. **Index-based**: Any vertex `>= outerGridVertexCount` (lines 237–240)
2. **UV-proximity**: Any vertex in `chainAdjacentVertices` (lines 243–246)

Chain edges connect consecutive chain vertices. For a chain edge (v0, v1), both are chain vertices (`>= outerGridVertexCount`) unless batch2Remap'd. Each adjacent triangle contains at least one of {v0, v1}, so at least one vertex `>= outerGridVertexCount` → triangle IS in `csTriSetNow`.

**Edge case — both endpoints batch2Remap'd**: If both v0 and v1 are remapped to grid indices (< outerGridVertexCount), index-based detection fails. UV-proximity detection becomes the fallback. The grid vertex's UV is at `unionU[col]`, while the chain point's WH-smoothed U may have drifted by up to ~0.005. With `proximityRadius = gridSpacing × 0.5 ≈ 0.0009` (for outerW=558), a drift of 0.005 exceeds the proximity radius, potentially missing the triangle. **However**: both-endpoint remapping is very rare (requires both chain vertices within 1e-4 of a grid column), and when it occurs, the edge IS effectively a grid edge — subdividing it would yield negligible ridge improvement. **Not blocking.**

**Verdict**: ACCEPT.

---

### V2 [ACCEPT]: Chain edges have exactly 2 adjacent triangles

**Generator's claim**: Chain edges should always have 2 adjacent triangles (manifold).

**Verification**: The CDT mesh is manifold for interior edges. Chain edges are interior edges because:
- **Seam boundary**: Chain edges crossing the seam are filtered at OWT line 798 (`if (du > SEAM_THRESHOLD) continue`) and never enter `outerChainEdges` or `constraintEdgeSet`.
- **Mesh boundary (top/bottom rows)**: Chain endpoints at the very first/last row might adjoin only 1 triangle, but these edges would have `tris.length === 1` and be filtered by the `tris.length !== 2` guard at [MeshSubdivision.ts line 371](../src/renderers/webgpu/parametric/MeshSubdivision.ts#L371). No crash — just no split.
- **Chain endpoints**: Even at chain endpoints, if the vertex is embedded in the CDT interior, it has 2 adjacent triangles on each edge.

**Verdict**: ACCEPT. The `tris.length !== 2` guard handles all degenerate cases safely.

---

### V3 [ACCEPT]: `constraintEdgeSet` not used after subdivision

**Generator's claim**: The constraint set's flip-protection role is fulfilled before subdivision runs.

**Verification**: Grep of `constraintEdgeSet` in ParametricExportComputer.ts shows 5 references:
1. Line 1555: Created via `buildConstraintEdgeSet(outerChainEdges)`
2. Line 1563: Passed to `optimizeChainStrips()` (flip protection)
3. Line 1616: Passed to `subdivideLongEdges()` (currently: skip; proposed: classify)

After subdivision (line 1636+), `constraintEdgeSet` is **never referenced again**. The subsequent pipeline stages (`computeBoundaryDiagnostic`, `computeMeshDiagnostics`, `computeChainStrip3DQuality`, STL assembly) do NOT take `constraintEdgeSet` as a parameter. Confirmed: the flip-protection consumers are all executed BEFORE subdivision.

Pipeline order verified:
```
Line 1555: buildConstraintEdgeSet
Line 1559: optimizeChainStrips (uses constraintEdgeSet for flip protection) ✓
Line 1582: optimizeBoundaryDiagonals (does NOT take constraintEdgeSet)
Line 1609: subdivideLongEdges (consumer #2 — LAST use) ✓
Line 1648+: diagnostics only — no constraintEdgeSet
```

**Verdict**: ACCEPT. No downstream consumer is affected.

---

### V4 [ACCEPT]: UV midpoint accuracy for chain vertices

**Generator's claim**: Chain vertices have valid UV entries in `combinedVerts`.

**Verification**: Confirmed chain vertex UV data is explicitly written at [OuterWallTessellator.ts lines 834–838](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L834-L838):
```typescript
// Append chain vertices after the grid
for (const cv of chainVertices) {
    vertices[vIdx++] = cv.u;                          // U
    vertices[vIdx++] = cv.t ?? activeTPositions[cv.rowIdx];  // T
    vertices[vIdx++] = surfaceId;                      // surfaceId
}
```

This `vertices` array is returned as `finalVertices` and becomes part of `combinedVerts` at [ParametricExportComputer.ts lines 1422–1425](../src/renderers/webgpu/ParametricExportComputer.ts#L1422-L1425):
```typescript
let combinedVerts = new Float32Array(totalVerts);
for (const v of allVertArrays) { combinedVerts.set(v, vOff); vOff += v.length; }
```

The outer wall is `allVertArrays[0]`, so its vertices (grid + chain + phantom) are packed first. Chain vertex indices (`>= outerGridVertexCount`) correctly index into `combinedVerts` with valid [u, t, surfaceId] triples.

The subdivision code at lines 440–442 reads:
```typescript
midUVBatch[i * 3] = midpointWrappedU(combinedVerts[se.v0 * 3], combinedVerts[se.v1 * 3]);
midUVBatch[i * 3 + 1] = (combinedVerts[se.v0 * 3 + 1] + combinedVerts[se.v1 * 3 + 1]) * 0.5;
midUVBatch[i * 3 + 2] = combinedVerts[se.v0 * 3 + 2];
```

All three reads are valid for chain vertex indices.

**Verdict**: ACCEPT.

---

### V5 [ACCEPT]: `midpointWrappedU` handles seam crossing

**Verification**: Function at [MeshSubdivision.ts lines 208–213](../src/renderers/webgpu/parametric/MeshSubdivision.ts#L208-L213):
```typescript
function midpointWrappedU(u0: number, u1: number): number {
    let du = u1 - u0;
    if (du > 0.5) du -= 1.0;
    if (du < -0.5) du += 1.0;
    const mid = u0 + du * 0.5;
    return ((mid % 1) + 1) % 1;
}
```

Correctly handles wrapping: for u0=0.95, u1=0.05 → du=-0.90, wrap → du=0.10, mid=1.00, wrap → 0.0. ✓

**Additionally moot**: OWT filters seam-crossing chain edges at line 798 (`if (du > SEAM_THRESHOLD) continue`), so no seam-crossing chain edge enters `outerChainEdges` or `constraintEdgeSet`. The wrapping handler is correct but will never be invoked for chain edges in practice.

**Verdict**: ACCEPT.

---

### V6 [ACCEPT]: `batch2Remap` interaction with constraint edge keys

**Generator's claim**: `constraintEdgeSet` tracks original edge topology regardless of remapping.

**Verification**: Actually, the Generator is subtly wrong here but reaches the correct conclusion. `constraintEdgeSet` tracks **remapped** edge keys, not original ones. At [OWT lines 875–883](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L875-L883):
```typescript
if (batch2Remap.size > 0) {
    for (let e = 0; e < chainEdges.length; e++) {
        const [v0, v1] = chainEdges[e];
        const m0 = batch2Remap.get(v0);
        const m1 = batch2Remap.get(v1);
        if (m0 !== undefined || m1 !== undefined) {
            chainEdges[e] = [m0 ?? v0, m1 ?? v1];
        }
    }
}
```

`chainEdges` is mutated to use remapped indices **before** `buildConstraintEdgeSet` is called at PEC line 1555. So `constraintEdgeSet` contains edge keys with remapped vertex indices.

This is actually **correct for the proposal**: when `subEdgeToTris` is built from `combinedIdxs`, the triangle indices already use remapped vertices. So `edgeKey(v0, v1)` for a remapped chain edge matches the key in `constraintEdgeSet`. The lookup `constraintEdgeSet.has(ek)` succeeds.

Three cases post-remap:
| Case | v0 | v1 | isCrossEdge | isChainEdge | isFeatureEdge | Behavior |
|------|----|----|-------------|-------------|---------------|----------|
| Neither remapped | ≥grid | ≥grid | false | true | **true (NEW)** | Subdivided if > feature threshold |
| One remapped | <grid | ≥grid | true | true | true (was already true via XOR) | No behavior change |
| Both remapped | <grid | <grid | false | true | **true (NEW)** | Rarely hit; acceptable |

**Verdict**: ACCEPT. The Generator's comment about "original edge topology" is imprecise (should say "remapped"), but the mechanism works correctly.

---

### V7 [ACCEPT]: `touchesProtectedPatch` for chain edges

**Generator's claim**: With `isFeatureEdge=true`, only opposite vertices are checked. Blocking is rare and correct.

**Verification**: `touchesProtectedPatch` at [MeshSubdivision.ts lines 397–407](../src/renderers/webgpu/parametric/MeshSubdivision.ts#L397-L407):
```typescript
if (isFeatureEdge) {
    return protectedVertices.has(opp0) || protectedVertices.has(opp1);
}
```

For a chain edge split, the two opposite vertices are typically:
- Grid vertices flanking the chain path
- Other chain vertices from adjacent chains
- Phantom vertices (near column-crossing anchors)

Both opposite vertices being phantom/protected requires the chain edge to be entirely within a protected corridor. This is geometrically correct — subdividing inside a phantom corridor could disrupt the band-splitting geometry. The `protectedRejects` counter tracks this.

**Counterexample attempted**: A chain edge where BOTH opposite vertices are protected phantom companions. This could happen when two phantom anchors on adjacent rows have companion vertices that bound the same two triangles adjacent to the chain edge. Rare but possible in dense crossing regions. Here, blocking the split is the RIGHT behavior: the phantom corridor needs topological stability more than ridge resolution.

**Verdict**: ACCEPT. Blocking is rare and desirable when it occurs.

---

### V8 [NOTE]: `modifiedTris` deconfliction bias

**Generator mentions**: Triangles shared between chain edges and cross-edges allow only one split per pass.

**Verification**: The sort is by `len2` descending (line 398: `edgesToSplit.sort((a, b) => b.len2 - a.len2)`). Longer edges are split first. Typical chain edge length (~0.77mm, len²≈0.59) vs typical cross-edge length (variable, often similar). If a cross-edge is longer and shares a triangle with a chain edge, the cross-edge wins.

**Assessment**: Theoretical bias exists but is marginal. Chain edges share triangles with at most 2 cross-edges (the grid-to-chain edges at each endpoint). Out of ~50–200 chain edges, perhaps 5–15% might lose a deconfliction lottery. This reduces the effective chain-edge split count by a small fraction.

**Verdict**: NOTE. Not blocking. Monitor chain-edge split percentage in diagnostics if needed.

---

### V9 [ACCEPT]: `meshChains` availability at line ~1251

**Generator's claim**: `meshChains` is in scope and valid at the debug line generation code.

**Verification**: `meshChains` is defined at approximately [PEC line 1113](../src/renderers/webgpu/ParametricExportComputer.ts#L1113):
```typescript
const meshChains = filterLowConfidenceChains(smoothedChains);
```

Both `meshChains` and the debug line generation (line ~1251) are within the same block scope (inside the `if (chains.length > 0)` chain processing block starting around line 1071). `meshChains` is a `const` — no reassignment possible. If `filterLowConfidenceChains` returns an empty array, the `for...of` loop produces 0 debug lines — correct behavior, no crash.

**Verdict**: ACCEPT.

---

### V10 [ACCEPT]: WH smoothing only modifies `.u`, not `.row`

**Generator's claim**: The `.row` field is preserved through WH smoothing, so `origToFinalRow` mapping works identically.

**Verification**: `whittakerSmooth` at [ChainLinker.ts lines 415–467](../src/renderers/webgpu/parametric/ChainLinker.ts#L415-L467):
```typescript
const newPoints: ChainPoint[] = chain.points.map((p, i) => ({
    row: p.row,                     // ← PRESERVED from input
    u: ((s[i] % 1) + 1) % 1,       // ← SMOOTHED
}));
```

Confirmed: `.row` is directly copied from the input chain. The debug line code uses `pt.row` for `origToFinalRow.get(pt.row)` → `finalT[fr]` to compute the T coordinate. Since `.row` is identical in `meshChains` and `preSmoothChains`, the T-coordinate lookup produces identical results. Only the U-coordinate differs (smoothed vs raw).

**Verdict**: ACCEPT.

---

## Additional Issues Discovered

### A1 [WARNING]: Scope of `constraintEdgeSet` is wider than described

**Generator's description**: Implies `constraintEdgeSet` contains only chain-to-chain edges (consecutive chain vertices along the ridge path).

**Actual behavior**: `outerChainEdges` — and hence `constraintEdgeSet` — includes:
1. **Chain-to-chain edges** (OWT line 802): Consecutive chain vertices along the chain path ✓
2. **Phantom vertex edges** (OWT lines 1000, 1015): Edges created during phantom vertex construction for column-crossing band splitting
3. **Seam repair edges** (OWT line 1391): Edges added during seam closure

With the proposed change, ALL of these become `isChainEdge = true → isFeatureEdge = true`, and are eligible for subdivision (subject to length threshold and `touchesProtectedPatch`).

**Risk assessment**: Low. Phantom edges are typically short (within a single cell) and may not exceed the feature threshold (0.579mm). Those that do are legitimate feature-boundary edges where subdivision improves mesh quality. The `touchesProtectedPatch` check blocks splits in protected corridors.

**Required action**: No code change needed, but the Generator's comment in Change 1 should be updated to acknowledge that `constraintEdgeSet` includes ALL chain-related constraint edges (chain-to-chain, phantom, and seam repair), not just "ridge path" edges.

### A2 [WARNING]: Test at line 194 will break

**Test**: `'never splits constraint edges'` at [MeshSubdivision.test.ts line 194](../src/renderers/webgpu/parametric/MeshSubdivision.test.ts#L194)

This test marks ALL edges as constraints and asserts `splitCount === 0`. Post-change, constraint edges are subdivision candidates, so this assertion will fail.

**Required action**: The Executioner MUST update this test. Two options:
1. **Rewrite the test**: Mark only non-chain interior edges as constraints, assert they're still skipped. Then add a NEW test verifying chain edges ARE split.
2. **Replace the assertion**: Change the test to verify that constraint edges receive the feature threshold (not interior threshold) and are split when exceeding it.

Option 1 is cleaner — it preserves the test's intent (constraints are respected) while adding coverage for the new behavior.

### A3 [NOTE]: Generator comment inaccuracy (Change 1)

**Generator's comment**: "constraintEdgeSet tracks the original edge topology"

**Actual**: `constraintEdgeSet` tracks **remapped** edge topology (after `batch2Remap` at OWT line 875–883). The comment in the proposed code should say "constraintEdgeSet tracks the remapped edge topology" or simply "constraintEdgeSet identifies chain edges regardless of batch2Remap index changes."

---

## Accepted Items

| Item | Evidence | Status |
|------|----------|--------|
| Block 1 (constraintEdgeSet skip) causes chain edge exclusion | MeshSubdivision.ts line 372: `if (constraintEdgeSet.has(ek)) continue;` | ✅ Confirmed |
| Block 2 (XOR-only classification) misses chain-to-chain edges | MeshSubdivision.ts line 383: XOR = false when both ≥ outerGridVertexCount | ✅ Confirmed |
| Metrics: chain edge len² ≈ 0.593, feature threshold² ≈ 0.335 | Formula verified: (0.772 × 0.75)² = 0.335 | ✅ Confirmed |
| Exactly 1 subdivision level per chain edge | After split: (0.77/2)² ≈ 0.148 < 0.335 | ✅ Confirmed |
| Pipeline order: CSO → subdivision (no post-subdivision constraint consumers) | PEC grep: constraintEdgeSet not referenced after subdivision | ✅ Confirmed |
| Chain vertex UV entries valid in combinedVerts | OWT lines 834–838: explicit UV write for chain vertices | ✅ Confirmed |
| `midpointWrappedU` handles seam correctly | MeshSubdivision.ts lines 208–213 | ✅ Confirmed |
| `batch2Remap` interaction is safe | OWT line 875–883: keys use remapped indices; subdivision uses same indices | ✅ Confirmed |
| `touchesProtectedPatch` correctly handles chain edges | Feature-edge branch checks only opposite vertices | ✅ Confirmed |
| `meshChains` in scope for debug vis | Defined at PEC ~1113, used at ~1251, same block | ✅ Confirmed |
| WH smoothing preserves `.row` | ChainLinker.ts line 460: `row: p.row` (direct copy) | ✅ Confirmed |

---

## Amendments Required for ACCEPT

### Amendment A1: Update comment in Change 1

The proposed comment says:
> "constraintEdgeSet tracks the original edge topology"

Replace with:
```typescript
// Remapped chain edges (batch2Remap moved endpoint to grid index) are
// also captured since constraintEdgeSet uses remapped indices from OWT.
// Note: the set includes ALL chain-related constraint edges (chain path,
// phantom vertices, seam repair) — not just chain-to-chain ridge edges.
```

### Amendment A2: Update test `'never splits constraint edges'`

The test at MeshSubdivision.test.ts line 194 MUST be rewritten. The Executioner should:
1. Modify the existing test: only mark edges that are NOT in the chain-strip region as constraints, then assert `splitCount === 0` for those.
2. Add a new test: create a mesh with chain edges in `constraintEdgeSet`, verify they ARE split when exceeding the feature threshold.

### Amendment A3: Verify phantom edge split counts in first export

After implementation, the Executioner should run a full export and verify:
- `splitCount` increases by approximately the chain edge count (50–200)
- `protectedRejects` does not dramatically spike (>2× pre-change baseline)
- Log the breakdown: how many of the new splits came from chain-to-chain edges vs phantom edges vs seam repair edges (may require a temporary diagnostic counter)

---

## Risk Assessment (Updated)

### Low Risk (Confirmed)
1. **Winding order**: Existing Phase C split code handles arbitrary orientations. No special chain-edge logic needed.
2. **Constraint set integrity**: Consumed before subdivision, not referenced after.
3. **Single-pass safety**: No UV growth needed; new midpoints only used in final STL.
4. **Debug vis correctness**: `meshChains` has valid `.row`, valid `.u`, and is in scope.

### Medium Risk (Downgraded from Generator)
4. **Edge adjacency completeness**: The both-endpoints-batch2Remap'd case (V1 edge case) could miss a small number of chain edges. Acceptable — these edges are effectively grid edges after remapping.

### Low Risk (New)
5. **Phantom edge subdivision**: `constraintEdgeSet` includes phantom edges (A1). Most are short enough to be below threshold. Those that split improve phantom corridor resolution. `touchesProtectedPatch` provides a safety net.

---

## Implementation Conditions for Executioner

1. Apply Change 1 and Change 2 from the Generator proposal exactly as specified, with comment fix from Amendment A1.
2. Apply Proposal 2 (debug vis) exactly as specified.
3. Update the test at MeshSubdivision.test.ts line 194 per Amendment A2.
4. Run full export, verify split count increase and no `protectedRejects` spike.
5. Run `npm run typecheck`, `npm run lint`, `npm test` — all must pass.
6. Visual inspection: ridge teeth should show finer resolution (2× expected).
