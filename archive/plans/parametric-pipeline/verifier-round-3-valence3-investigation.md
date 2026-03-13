# Verifier Round 3 — Critique of Generator Round 3 Valence-3 Investigation

Date: 2026-03-10

## Summary Verdict: ACCEPT WITH AMENDMENTS

The Generator's core thesis — that all ~2,127 remaining valence-3 vertices are legitimate mesh boundary vertices, not T-junctions — is **well-supported by evidence**. Proposal 1 (boundary/interior/chain classification) is sound and should be implemented. However, three specific claims require correction, and one formula bug should be documented.

---

## Critique

### C1 [NOTE]: Batch 6 Dedup Remapping — No Misclassification Risk

**Generator's claim**: "Verifier should confirm Batch 6 remap index preservation."

**Actual behavior**: Batch 6 dedup at [OuterWallTessellator.ts](../../../potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1962-L2010) implements two protections:

1. **R52 cross-type guard** (L1985-1988): `if (vIsChain !== existIsChain) continue;` — chain↔grid merging is categorically blocked. A boundary grid vertex can NEVER be remapped to a chain vertex or vice versa.

2. **Quantization separation**: Grid vertices are at positions `(unionU[col], activeTPositions[row])`. Grid U-spacing is ~0.00173, which is 173× larger than the 1e-5 quantization precision. Grid T-spacing is ~0.00244 (1/409), which is 244× larger. Two distinct grid vertices will NEVER collide in the quantization hash.

**Evidence**: At L1976, `const QUANT = 1e5;` and at L1978-1979:
```typescript
const qu = Math.round(vertices[v * 3] * QUANT);
const qt = Math.round(vertices[v * 3 + 1] * QUANT);
```
For two grid vertices to collide, they'd need `|u1 - u2| < 5e-6` AND `|t1 - t2| < 5e-6`. Grid spacing guarantees this never happens.

**Conclusion**: Batch 6 dedup only affects same-type vertices, and grid↔grid dedup is physically impossible given grid spacing. The `finalIndices` passed to `computeMeshDiagnostics` preserve the original grid vertex indices [0, gridVertexCount) without distortion.

**Verdict: ACCEPT** — No misclassification risk from Batch 6.

---

### C2 [NOTE]: gridVertexCount = numU × numT Is an Exact Invariant

**Generator's claim**: "`gridVertexCount = numU × numT` — true by construction."

**Verification**: At [OuterWallTessellator.ts L754](../../../potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L754):
```typescript
const gridVertexCount = numU * numT;
```
This is a simple integer multiplication, set once and never modified. The vertex buffer at L783-789 confirms the exact layout:
```typescript
for (let j = 0; j < numT; j++) {
    for (let i = 0; i < numU; i++) {
        vertices[vIdx++] = unionU[i];     // U
        vertices[vIdx++] = activeTPositions[j]; // T
        vertices[vIdx++] = surfaceId;
    }
}
```
Grid vertices occupy indices [0, gridVertexCount) in strict row-major order. Chain vertices start at index gridVertexCount (L790-793). Phantom vertices start at `totalVertexCount = gridVertexCount + chainVertices.length`.

**Note on micro-rows**: `numT = activeTPositions.length` where `activeTPositions` includes any micro-rows inserted by `insertMicroRowsForSteepCrossings` (L747-751). In PEC, `outerH = Math.round(outerGridVertexCount / outerW)` (L1744) = `Math.round(numU * numT / numU)` = `numT` (exact integer division). So `outerH` correctly reflects the actual row count including micro-rows.

**Verdict: ACCEPT** — The invariant holds unconditionally.

---

### C3 [WARNING]: outerIdxCountAfterSubdiv Formula Bug — Benign for Proposal 1

**Generator's claim**: "`outerIdxCountAfterSubdiv` correctly separates outer wall tris from cap/inner wall tris."

**Actual behavior**: At [ParametricExportComputer.ts L2149](../../../potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts#L2149):
```typescript
outerIdxCountAfterSubdiv: allIdxArrays[0].length + (finalCombinedIdxs.length - combinedIdxs.length),
```

The combined index buffer layout is:
```
combinedIdxs:      [outer wall | inner wall | rim | base]
finalCombinedIdxs: [outer wall (modified in-place) | inner | rim | base | NEW subdivision tris]
```

When subdivision is active, `finalCombinedIdxs.length - combinedIdxs.length = newTrisCount` (appended at END). So:
```
outerIdxCountAfterSubdiv = outerIdxCount + newTrisCount
```

The diagnostic loop `if (t >= outerIdxCountAfterSubdiv) continue` then treats the range [0, outerIdxCount + newTrisCount) as outer wall. But positions [outerIdxCount, outerIdxCount + min(newTrisCount, K)) where K = inner+rim+base index count are actually **non-outer tris**. Meanwhile, the actual new subdivision tris at positions [combinedIdxs.length, finalCombinedIdxs.length) may be **excluded** if `newTrisCount ≤ K`.

**Why this is benign for Proposal 1**: Non-outer surface tris reference vertices at `vertexOffset + local_index` (PEC L1487-1491) — well above `outerGridVertexCount`. These would be classified as "chain" by Proposal 1's logic (`vertIdx >= gridVertexCount`). New subdivision midpoints also have indices above `origVertCount > gridVertexCount`. Neither error affects the boundary vs. interior grid vertex classification.

**Counterexample where it matters (not for Proposal 1)**: If subdivision splits 100 edges (200 new tris = 600 new indices) but there are 2,000 inner/rim/base indices, then `outerIdxCountAfterSubdiv` includes 600 inner/rim/base tris (false positives) and misses all 200 new outer wall tris (false negatives). The overall val-3 count could be slightly wrong, but val3Interior remains unaffected.

**Verdict: ACCEPT WITH AMENDMENT** — The formula is buggy but benign for Proposal 1's purpose. File a NOTE in the implementation comments for future correctness. The correct formula would be:
```typescript
outerIdxCountAfterSubdiv: allIdxArrays[0].length  // original outer wall
    // + new tris are at [combinedIdxs.length, finalCombinedIdxs.length)
    // Need separate tracking or a two-range approach
```

---

### C4 [WARNING]: sweepQuad/emitSplitCell Valence Direction Is Bidirectional, Not Uniformly Upward

**Generator's claim**: "BPP split cells: The sweep fan produces MORE triangles per corner → boundary vertices in split cells have valence > 3 (bumped to val-4+)."

**Actual behavior**: Tracing `emitSplitCell` at [OuterWallTessellator.ts L1539-1557](../../../potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1539-L1557):
```typescript
const leftEdge: number[] = [BL, ...bppInfo.leftPhantoms, TL];
const rightEdge: number[] = [BR, ...bppInfo.rightPhantoms, TR];
sweepQuad(indexBuf, leftEdge, rightEdge, vertices);
```

In `sweepQuad`, the first element of `bot` (= BL = leftEdge[0]) participates in the FIRST triangle only, then the sweep advances past it. Concrete trace with leftEdge=[BL, P1, TL], rightEdge=[BR, Q1, TR]:

| Vertex | Standard cell touches | Split cell touches | Direction |
|--------|----------------------|-------------------|-----------|
| BL (bot[0]) | 2 (in both tris) | 1 (first tri only) | **DOWN** ↓ |
| BR (top[0]) | 1 | 1 | Same |
| TL (bot[-1]) | 1 | 2 (last tri + penultimate) | **UP** ↑ |
| TR (top[-1]) | 2 | 1 | **DOWN** ↓ |

For a **bottom-row** boundary vertex at BL of split cell (0, c):
- Standard cell (0, c-1) gives 1 touch (as BR)
- Split cell (0, c) gives **1** touch (down from 2)
- Total: **2** (down from 3)

For a **top-row** boundary vertex at TL of split cell (numT-2, c):
- Standard cell above: none (top row)
- Split cell gives **2** touches (up from 1)
- Standard cell to left: 2 touches (as TR of cell(numT-2, c-1))
- Total: **4** (up from 3)

**Counterexample**: A bottom-row boundary vertex adjacent to a split cell has valence **2**, not val-4+. The Generator's claim that ALL non-standard cells "bump boundary vertices to val-4+" is wrong. The effect is **bidirectional**: bottom corners go DOWN, top corners go UP.

**Impact on deficit**: The deficit explanation still holds qualitatively — non-standard cells remove vertices from the val-3 count — but by BOTH mechanisms (bumping up AND dropping down), not only by bumping up. The net count of 75 is plausible regardless.

**Required fix**: Correct the narrative in the proposal. The deficit exists because non-standard cells redistribute valence, not because they uniformly increase it.

**Verdict: ACCEPT WITH AMENDMENT** — The deficit conclusion is correct but the mechanism description is wrong. Fix the narrative.

---

### C5 [NOTE]: constrainedSweepCell Cannot Create Interior Val-3

**Generator's claim**: Interior vertices always get valence 6 from standard cells, and constrainedSweepCell doesn't create interior val-3.

**Verification**: In `constrainedSweepCell` ([OuterWallTessellator.ts L324-460](../../../potfoundry-web/src/renderers/webgpu/parametric/OuterWallTessellator.ts#L324-L460)), the cell is partitioned into sub-quads along chain edges. Each sub-quad is then triangulated by either:
- `sweepQuad` (for N×M sub-quads or chain-on-both-sides)
- 2-triangle fan (for 2×2 sub-quads with chain on one side only)

An interior grid vertex participates in cells on all 4 sides (above, below, left, right). Even if one of those cells is a constrained cell, the vertex appears in both the constrained cell AND the adjacent standard cells. The constrained cell gives it at least 1 touch (from the sweep), and adjacent standard cells give it 4-5 more touches. Total: ≥5, never 3.

The only way to get val-3 is if a vertex appears in FEWER than 4 adjacent cells, which only happens at mesh boundaries. Interior vertices always have 4 adjacent cells.

**Verdict: ACCEPT** — No mechanism for interior val-3 from constrainedSweepCell.

---

### C6 [NOTE]: Chain Vertex Val-3 Classification Is Correct

**Generator's claim**: Chain vertices with val-3 are "boundary-like artifacts" and should be classified as "chain."

**Verification**: Chain vertices have indices in range [gridVertexCount, gridVertexCount + chainVertices.length). They sit on row boundaries between grid rows. A chain vertex at border row 0 or numT-1 would have cells on only ONE side, potentially yielding val-3 or lower.

The key insight: even if a chain vertex has val-3 and happens to be in the geometric interior of the mesh, it is NOT a T-junction. T-junctions are grid topology defects where a grid vertex on one row's edge doesn't appear in the adjacent row's triangulation. Chain vertices are ADDITIONAL vertices inserted at known positions on shared edges — they are shared between both adjacent cells by construction (via `cellChainMap` at L897-910).

Classifying them as "chain" (not boundary, not interior) is the correct taxonomy.

**Verdict: ACCEPT** — Classification is correct.

---

### C7 [NOTE]: Boundary Vertex Count Math Is Plausible

**Generator's claim**: 2,202 expected, 2,127 observed, 75 deficit explained by non-standard cells.

**Verification**: With numU = 685, numT = 420 (from Grid layout 685×420 in the logs):
- Bottom row interior: numU - 2 = 683
- Top row interior: numU - 2 = 683
- Left col interior: numT - 2 = 418
- Right col interior: numT - 2 = 418
- Total: 2 × 683 + 2 × 418 = 2,202 ✓

Deficit = 75. Given 5,091 BPP split cells and 2,548 super-cells, ~75 boundary vertices affected = ~1.5% of split cells touching boundaries. This is within plausible range for a mesh where super-cells cluster around feature chains, which may or may not cross boundary bands.

Per C4 analysis, the 75 deficit includes BOTH:
- Vertices bumped UP from val-3 to val-4+ (top-boundary vertices of split cells)
- Vertices bumped DOWN from val-3 to val-2 or val-1 (bottom-boundary vertices of split cells)

Both remove vertices from the val-3 count, so the deficit direction is consistent.

**Verdict: ACCEPT WITH AMENDMENT** — Numbers check out; mechanism description needs correction per C4.

---

## Accepted Items

1. ✅ **Grid vertex layout**: Row-major at [0, numU×numT), verified at OWT L783-789
2. ✅ **gridVertexCount invariant**: `numU * numT` set at L754, never modified
3. ✅ **Batch 6 safety**: R52 cross-type guard + quantization separation prevent misclassification
4. ✅ **No interior val-3 mechanism**: All val-3 vertices are boundary or chain
5. ✅ **Proposal 1 classification logic**: `row = floor(v/numU), col = v%numU` is correct given row-major layout
6. ✅ **outerH = Math.round(gridVertexCount/outerW)** is exact (integer division)
7. ✅ **Chain vertex classification**: Correct to treat all v ≥ gridVertexCount as "chain"

## Amendments Required

### A1: Fix Deficit Mechanism Narrative
In the Generator proposal, section 6 "Explaining the Deficit":
- **Change**: Replace "The sweep fan produces MORE triangles per corner → boundary vertices in split cells have valence > 3 (bumped to val-4+)" with "The sweep fan REDISTRIBUTES triangle touches among corner vertices. Bottom corners lose a touch (val-3 → val-2), top corners gain a touch (val-3 → val-4). Both effects remove vertices from the val-3 count."

### A2: Document outerIdxCountAfterSubdiv Formula Limitation
In the Proposal 1 implementation, add a comment at the call site:
```typescript
// NOTE: outerIdxCountAfterSubdiv is approximate when subdivision is active.
// It over-includes some inner/rim/base tris and under-includes some new
// outer wall subdivision tris. This is benign for boundary/interior/chain
// classification because non-outer tris reference vertices above
// gridVertexCount. A correct implementation would track the outer wall
// index range as a disjoint set: [0, outerIdxCount) ∪ [combinedIdxs.length, finalCombinedIdxs.length).
```

### A3: No Code Changes Required to Proposal 1 Logic
The classification logic itself is correct:
```typescript
if (vertIdx < gridVertexCount) {
    const row = Math.floor(vertIdx / numU);
    const col = vertIdx % numU;
    const isBoundary = row === 0 || row === numT - 1 || col === 0 || col === numU - 1;
}
```
No amendments to the actual implementation code.

---

## Implementation Conditions (for Executioner)

### What to implement:
1. Add `numU`, `numT`, `gridVertexCount` to `MeshDiagnosticParams` interface in ChainStripOptimizer.ts
2. Add `val3Boundary`, `val3Interior`, `val3Chain` to `MeshDiagnosticResult` interface
3. Add classification loop in `computeMeshDiagnostics` (Generator's code is correct)
4. Update call site in ParametricExportComputer.ts (~L2149) to pass `numU: outerW`, `numT: outerH`, `gridVertexCount: outerGridVertexCount`
5. Update log line to show breakdown
6. Add the A2 comment about `outerIdxCountAfterSubdiv` limitations

### Validation protocol:
1. **Typecheck**: `npm run typecheck` must pass
2. **Lint**: `npm run lint` must pass with 0 warnings
3. **Test**: `npm test` must pass
4. **Runtime**: Export the default style and verify log output shows:
   ```
   low valence: val=3: 2127 (boundary=N, interior=0, chain=M)
   ```
   Where N + M = 2127 and **interior = 0** (the key assertion).
5. If interior > 0, the fix has exposed a real T-junction. Do NOT ship — escalate to Generator.

### Estimated scope:
- ChainStripOptimizer.ts: ~15 lines (interface + classification logic)
- ParametricExportComputer.ts: ~8 lines (call site + log + comment)
- Total: ~23 lines changed, 0 new files, pure diagnostic addition

---

## Open Questions for Generator

1. **Proposal 2 auto-trigger**: Should the Executioner implement Proposal 2 (interior val-3 dump) as a permanent feature, or gate it behind `process.env.NODE_ENV === 'development'`? I recommend permanent — it's zero-cost when interior = 0.

2. **Phantom vertex classification**: Phantom vertices (from R37 band splitting) have indices ≥ gridVertexCount + chainVertices.length. The current proposal classifies them alongside chain vertices. Should they be a separate category? I say no — they're functionally equivalent to chain vertices for T-junction detection purposes.
