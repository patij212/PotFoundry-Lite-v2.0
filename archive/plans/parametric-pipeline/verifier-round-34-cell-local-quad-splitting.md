# Verifier Round 34 — Cell-Local Quad Splitting Critique

Date: 2026-03-07

## Summary Verdict: ACCEPT WITH AMENDMENTS

The Generator's R34 proposal represents a fundamentally sound architectural pivot away from the failed CDT chain strip system. The core insight — that chain-affected cells should be triangulated locally rather than carved into 5–9 column wide CDT strips — is correct and well-motivated by three consecutive failed rounds. The `sweepQuad` + `constrainedSweepCell` partition approach is mathematically valid and will eliminate the root cause of slivers (CDT on point soup with 191K Steiner vertices).

However, the proposal has **4 critical issues** and **3 warnings** that must be addressed before implementation.

---

## Assumption Verification

### Assumption 1: Case E (multiple chain edges in same cell) — PARTIALLY CONFIRMED

**Generator's claim**: Case E is "extremely rare" because CDF-adaptive columns make cells near features narrow, and two features in the same narrow cell would have been merged during chain linking.

**Verification**: Two chains can occupy the same cell without being merged — `ChainLinker` links within a SINGLE feature kind. A ridge chain and a valley chain can pass through the same narrow cell. However:

1. `mergeFeaturePositions()` in [GridBuilder.ts](../../src/renderers/webgpu/parametric/GridBuilder.ts#L75) injects dedicated grid columns at EACH feature position with flanking companions. Two features close enough to share a cell would be at most `avgSpacing * 0.1` apart (the merge dedup threshold).
2. The flanking companion columns (at ±`FLANK_OFFSET * avgSpacing`) further narrow cells near features.

**Assessment**: Case E IS rare but not impossible. The fallback strategy (mini CDT of ~6-10 vertices or explicit sub-polygon enumeration) is sound because the per-cell vertex count is bounded. O(1) per cell.

**Status**: ✅ CONFIRMED — the fallback is adequate regardless of frequency.

---

### Assumption 2: `sweepQuad` partitioned by chain edges guarantees chain edge as triangle edge — CONFIRMED

**Generator's claim**: The left sub-quad `[..., CP_bot] × [..., CP_top]` and right sub-quad `[CP_bot, ...] × [CP_top, ...]` produce triangles containing edge CP_bot–CP_top.

**Verification**: I traced the sweepQuad algorithm for all possible ordering cases:

**Case 1** — `bot = [A, CP_bot]`, `top = [B, CP_top]`, `U(CP_bot) ≤ U(CP_top)`:
- Step 1: emit (A, CP_bot, B), advance bi
- Step 2: emit (B, CP_top, CP_bot), advance ti → **edge CP_bot–CP_top ✓**

**Case 2** — same vertices, `U(CP_top) < U(CP_bot)`:
- Step 1: emit (B, CP_top, A), advance ti
- Step 2: emit (A, CP_bot, CP_top), advance bi → **edge CP_bot–CP_top ✓**

**Case 3** — `bot = [A₁, A₂, CP_bot]`, `top = [B, CP_top]`:
- Final triangle always connects CP_bot and CP_top to the last vertex from the other edge → **edge CP_bot–CP_top ✓**

**Proof sketch**: CP_bot and CP_top are the LAST elements of their respective arrays. The sweep processes vertices left-to-right. When one cursor reaches its end, the other catches up. The final triangle always connects the last element of the slower edge to the last element of the faster edge plus the penultimate element. Either way, CP_bot and CP_top share a triangle edge.

**Status**: ✅ CONFIRMED — by construction, the partition guarantees the chain edge appears as a mesh edge.

---

### Assumption 3: sweepQuad termination — total triangles = (botLen−1) + (topLen−1) — CONFIRMED

**Verification**: The sweep starts at `bi=0, ti=0` and terminates at `bi=bLen-1, ti=tLen-1`. Each step advances exactly one cursor by 1 and emits exactly 1 triangle. Total advances needed: `(bLen-1) + (tLen-1)`.

The loop condition `while (bi < bLen-1 || ti < tLen-1)` correctly captures this. No early termination, no over-counting.

**Edge case**: `botLen=1, topLen=1` produces 0 triangles (degenerate cell — single vertex on each edge). This is correct; there's no triangle to emit.

**Edge case**: `botLen=1, topLen=3` produces 2 triangles (fan from the single bottom vertex). Correct: fan from BL to 2 top segments.

**Status**: ✅ CONFIRMED

---

### Assumption 4: Cross-column chain edges are rare (<5% of all edges) — PARTIALLY CONFIRMED

**Generator's claim**: Cross-column edges are rare because SG smoothing keeps adjacent chain points close in U.

**Verification against actual code**:

- `SMOOTH_HALFWIDTH` = 8 ([ChainLinker.ts line 482](../../src/renderers/webgpu/parametric/ChainLinker.ts#L482)), giving a 17-point SG window. This is aggressive smoothing that preserves slope but reduces noise.
- For near-vertical features, the U-change per row is small (fraction of grid spacing). Adjacent points stay in the same column → **rare cross-column edges**.
- For diagonal/spiral features, U changes by `~slope * ΔT` per row. With grid spacing ~0.00173 and ΔT ~0.00245, a chain with slope > 0.71 (45° in UV space) will cross a column every 1-2 rows.
- The existing code tracks `crossCellEdgeCount` ([OWT line ~1830](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1830)) — this is logged but I cannot verify the actual runtime value without running an export.

**Risk assessment**: For styles with spiral features (e.g., twisted gothic arches), cross-column edges could exceed 5%. The proposal's per-cell mini-triangulation handles these correctly regardless of frequency — the concern is performance, not correctness. For <100 cross-column edges, inline intersection vertex creation is fine. For >1000, batching would help but is not critical.

**Status**: ⚠️ PARTIALLY CONFIRMED — true for most styles, possibly violated for spiral features. Not a blocking issue since the algorithm handles them correctly regardless.

---

### Assumption 5: Chain edge is triangle edge via last-vertex partition — CONFIRMED

This is a restatement of Assumption 2 with more precision. See Assumption 2 verification above.

**Additional nuance**: The `constrainedSweepCell` function builds left sub-quad as `bot.slice(prevBotPos, part.botPos + 1)` — note the `+ 1`. This includes `CP_bot` as the LAST element. Similarly for top. This ensures the partition boundary is the chain edge.

**Status**: ✅ CONFIRMED

---

### Assumption 6: Min angle >15° claim with batch2Remap threshold — REFUTED

**Generator's claim**: "min angle >15° assumes that chain vertices are at least 1e-6 away from grid corners (batch2Remap handles closer cases)."

**Counterexample**:

Consider a chain vertex at `u = unionU[c] + 1.5e-4` (just beyond the proposed 1e-4 merge threshold), in a cell of width `W ≈ 0.00173` and height `H ≈ 0.00245`:

- Triangle: `BL(u_c, t_j)` — `CV(u_c + 1.5e-4, t_j)` — `TL(u_c, t_{j+1})`
- Angle at BL: `arctan(1.5e-4 / 0.00245)` ≈ **3.5°**

Even with the proposed Proposal 2 threshold of 1e-4:
- Vertex at `u = unionU[c] + 1.01e-4` creates angle at BL: `arctan(1.01e-4 / 0.00245)` ≈ **2.4°**

To guarantee min angle ≥15°, the merge threshold would need to be:
```
δ_min = H × tan(15°) = 0.00245 × 0.2679 ≈ 6.6e-4
```

That's ~38% of the cell width, which is far more aggressive than 1e-4.

**Reality check**: The sweep algorithm guaranteed no DEGENERATE triangles (0° angles), but thin triangles with angles of 2-5° will still exist wherever chain vertices sit in the "near-corner" zone between the merge threshold and ~6.6e-4 from a grid corner. This is still VASTLY better than the current 64.1% sliver rate and 24633:1 aspect ratio, but the specific ">15°" claim is false.

**Required fix**: See Amendment A2 below — either increase the merge threshold to ~5e-4, or accept that min angle will be ~2-5° for edge cases (still a massive improvement over 0.0° current baseline).

**Status**: ❌ REFUTED — >15° not achievable with 1e-4 threshold. The improvement is real but the specific claim is overstated.

---

### Assumption 7: 1e-4 merge threshold doesn't degrade feature sharpness — CONFIRMED WITH CAVEAT

**Generator's claim**: SG smoothing already moved chain vertices more than 1e-4 from their detected positions, so merging to the nearest grid column is within the error budget.

**Verification**: The SG filter with `SMOOTH_HALFWIDTH=8` applies a 17-point moving polynomial fit. For a feature originally detected at a grid-injected column (exact grid position), the SG filter smooths it based on 8 neighbors in each direction. If the chain's local curvature is low, the vertex stays near its original position. If the chain zigzags due to detection noise, the vertex moves by the noise amplitude.

A merge threshold of 1e-4 represents ~7% of average cell width (~0.00146). The 3D surface displacement at a 10mm pot is:
```
1e-4 × 2π × 10mm ≈ 0.006mm
```
This is below FDM print resolution (~0.2mm layer height, ~0.4mm nozzle width).

**Caveat**: For very high-resolution SLA/resin prints (25-50μm layer height), 6μm is noticeable but not visually significant. Feature sharpness is preserved for all practical purposes.

**Status**: ✅ CONFIRMED — 1e-4 is within the noise budget for all realistic print technologies.

---

### Assumption 8: SEAM_THRESHOLD=0.4 prevents all seam-crossing edges from entering cellChainMap — CONFIRMED

**Verification from code**:

The chain edge recording loop at [OWT line ~553](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L553):
```typescript
const du = Math.abs(p1.u - p0.u);
// Raw UV delta: seam-crossing edges have |Δu| ≈ 0.99
if (du > SEAM_THRESHOLD) continue;
```

Seam-crossing edges connect vertices at `u ≈ 0.001` to `u ≈ 0.999`, giving `|Δu| ≈ 0.998`, which is far above `SEAM_THRESHOLD = 0.4`. These edges are excluded from `chainEdges` before `cellChainMap` construction.

Additionally, the cell emission loop uses `SEAM_GUARD = 0.3` ([OWT line 122](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L122)) to skip cells at the seam boundary. Both filters are independently sufficient.

**Edge case**: A chain vertex at `u = 0.001` is assigned to cell 0 and appears in that cell's `botChainVerts` or `topChainVerts`. Without a chain edge, it creates a Case B split (extra vertex on edge, no constraint). This produces a valid triangulation — the vertex is just an extra mesh point. No issue.

**Status**: ✅ CONFIRMED

---

## Open Question Answers

### Q1: batch2Remap ordering consistency with sweepQuad

**Answer: There IS a sequencing issue the Generator must address.**

Currently, `batch2Remap` is populated INSIDE `buildMergedRow()` ([OWT lines 1045-1100](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1045)), which is called during strip assembly. The proposal removes `buildMergedRow()`. Therefore, `batch2Remap` must be pre-computed BEFORE `cellChainMap` construction.

**Required approach**: Scan all chain vertices against `unionU` with the threshold before building `cellChainMap`:

```typescript
for (const cv of chainVertices) {
    const col = bsearchFloor(unionU, cv.u);
    // Check against left column boundary
    if (col >= 0 && col < numU && Math.abs(cv.u - unionU[col]) <= MERGE_THRESHOLD) {
        batch2Remap.set(cv.vertexIdx, cv.rowIdx * numU + col);
    }
    // Check against right column boundary
    else if (col + 1 < numU && Math.abs(cv.u - unionU[col + 1]) <= MERGE_THRESHOLD) {
        batch2Remap.set(cv.vertexIdx, cv.rowIdx * numU + (col + 1));
    }
}
```

Then skip batch2Remap'd vertices in `cellChainMap` construction (as the Generator's pseudocode already shows) and remap chain edge endpoints.

**Impact on sweepQuad**: After batch2Remap, the `bot`/`top` arrays in `emitChainCell` use grid vertex U positions (from the vertex buffer) for remapped vertices. These are guaranteed to be exactly at `unionU[col]` — the grid column position. No ordering inconsistency.

### Q2: Chain vertex at cell corner — bsearchFloor behavior

**Answer: Correct by construction.**

`bsearchFloor` ([GridBuilder.ts line 42](../../src/renderers/webgpu/parametric/GridBuilder.ts#L42)) uses `arr[mid] <= value`, so for `value = unionU[c+1]`:
- `arr[c+1] <= unionU[c+1]` is true → `lo` advances to `c+1`
- Result: `c+1` — assigns vertex to cell `c+1` as its **left corner**

This is correct: the vertex sits on `unionU[c+1]`, which is the LEFT boundary of cell `c+1`. After batch2Remap (since the U distance is 0), it merges with grid vertex `row * numU + (c+1)`.

**Floating-point nuance**: If `cv.u = unionU[c+1] - ε` for tiny ε (say 5e-7), `bsearchFloor` returns `c` (assigns to cell `c` as a near-right-boundary vertex). With batch2Remap threshold 1e-4 (Proposal 2), the vertex is merged to column `c+1`. This is correct — the vertex is effectively AT the boundary and merges with the grid vertex there.

### Q3: emitTriCCW winding correctness

**Answer: Must use cross-product checking, not rely on sweep direction.**

The existing `emitStandardCell` at [OWT line ~1260](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1260) explicitly computes cross products and flips winding. The existing `sweepRegion` in [ChainStripTriangulator.ts line 621](../../src/renderers/webgpu/parametric/ChainStripTriangulator.ts#L621) uses a **fixed winding order** based on the assumption that bot is at lower T and top is at higher T, with U increasing left-to-right.

For the cell-local system, this assumption holds because:
- Bottom edge vertices have `T = activeTPositions[band]` (lower)
- Top edge vertices have `T = activeTPositions[band + 1]` (higher)
- Both edge arrays are sorted by U (left-to-right)

However, cross-column intersection vertices on vertical cell boundaries introduce intermediate T positions that could violate the monotonicity assumption. **Recommendation**: Use `emitTriCCW` with explicit cross-product checking (as the Generator proposes at ~15 lines) for safety. The performance cost is negligible (~1 cross product per triangle).

### Q4: Batch 6 global dedup interaction

**Answer: Batch 6 becomes nearly a no-op but should be retained as a safety net.**

In the cell-local system:
- Grid vertices are unique by construction (indexed as `row * numU + col`).
- Chain vertices have unique indices from `nextVertexIdx++`.
- Adjacent cells share grid vertices by using the same index (`BL`, `BR`, `TL`, `TR`).

The only vertices Batch 6 might merge are chain vertices that batch2Remap already handles. With a 1e-4 threshold for batch2Remap, Batch 6 (at 1e-5 quantization) should find zero duplicates.

**Recommendation**: Keep Batch 6 as-is for safety. Its cost is O(n) and it catches any edge cases that batch2Remap misses.

### Q5: FeatureEdgeGraph compatibility

**Answer: Compatible with minor simplifications.**

`buildFeatureEdgeGraphFromChainEdges` ([FeatureEdgeGraph.ts line 281](../../src/renderers/webgpu/parametric/FeatureEdgeGraph.ts#L281)) takes `chainEdges` and `chainVertexChainIds`. Both are built from the `chainVertices` array in Section 1 of OWT ([lines 446-560](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L446)), which is **unchanged** by the proposal.

Key changes:
- `allChainVertices` will equal `chainVertices` (no companions). Companion vertices had `pointIdx = -1` and were never chain edge endpoints, so this doesn't affect `chainEdges` or `chainVertexChainIds`.
- `topDupMap`/`topDupReverse` are eliminated. The current code adds duplicate vertex→chainId mappings for CDT duplicate indices. Without CDT duplicates, this is unnecessary.
- `batch6Remap` adjusts chain edge endpoints. This still works identically.

**Compatibility**: ✅ No changes needed to FeatureEdgeGraph.ts. The `OuterWallResult` interface delivers the same fields. The values of `chainEdges` and `chainVertexChainIds` are computed from `chainVertices` (Section 1, unchanged).

### Q6 (implicit): Cross-column edge count

For vertical features on a typical pot (~20 chains, ~300 rows each): cross-column edges are ~0-20 (near zero). For spiral features: potentially ~50-200 per chain. Total budget: inline creation is fine for <1000 intersection vertices (negligible vs 200K grid vertices).

---

## Additional Issues Found

### C1 [CRITICAL]: batch2Remap must be pre-computed before cellChainMap

**Problem**: The proposal skips `batch2Remap.has(cv.vertexIdx)` check in the cellChainMap builder, but `batch2Remap` is currently built inside `buildMergedRow()` which the proposal removes. Without pre-computing batch2Remap, ALL chain vertices enter cellChainMap — including those that should be merged with grid vertices.

**Evidence**: `buildMergedRow()` at [OWT line 1054](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1054):
```typescript
if (Math.abs(gridU - chainList[ci].u) <= 1e-6) {
    batch2Remap.set(chainList[ci].vertexIdx, gridIdx);
```

The Generator's pseudocode correctly shows `if (batch2Remap.has(cv.vertexIdx)) continue;` — but doesn't specify WHERE batch2Remap gets populated.

**Required fix**: Add an explicit batch2Remap pre-computation pass BEFORE cellChainMap construction. Scan each chain vertex against `unionU[col]` and `unionU[col+1]` within the merge threshold.

### C2 [CRITICAL]: Chain edge endpoints may reference batch2Remap'd vertices

**Problem**: The chain edge array `chainEdges` at [OWT line ~555](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L555) uses original chain vertex indices. If one endpoint is batch2Remap'd to a grid vertex, the edge `[chainVtxIdx, otherChainVtxIdx]` references an index that's been replaced. The cellChainMap must remap chain edge endpoints BEFORE registering them in cells.

**Evidence**: The current code applies batch2Remap to `allChainEdges` at [OWT line ~1835](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1835) — AFTER strip triangulation. In the new system, remapping must happen BEFORE cellChainMap construction so that edge endpoints match the vertex indices used in the cell's bot/top arrays.

**Required fix**: After pre-computing batch2Remap, iterate `chainEdges` and remap endpoints:
```typescript
for (let e = 0; e < chainEdges.length; e++) {
    const [v0, v1] = chainEdges[e];
    const m0 = batch2Remap.get(v0);
    const m1 = batch2Remap.get(v1);
    if (m0 !== undefined || m1 !== undefined) {
        chainEdges[e] = [m0 ?? v0, m1 ?? v1];
    }
}
```

After remapping, a chain edge like `[gridIdx, chainVtxIdx]` has its grid vertex endpoint AT a cell corner. The cellChainMap edge registration must handle this: the grid vertex is NOT on the bot/top chain vertex list — it's already a cell corner (BL, BR, TL, or TR). The `constrainedSweepCell` must recognize that a chain edge connecting a cell corner to a mid-edge chain vertex is a valid constraint that doesn't partition the cell but instead constrains the diagonal choice.

### C3 [CRITICAL]: quadMap maintenance for chain cells

**Problem**: The proposal doesn't mention `quadMap`. The current code sets `quadMap[band * cellsPerRow + col] = triBase` for standard cells and `quadMap[...] = -1` for chain strip cells. The `quadMap` is returned in `OuterWallResult` and used by `ParametricExportComputer.ts` for 3D position computation and the mesh optimizer.

**Evidence**: [OWT line 1280](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1280): `quadMap[quadIdx] = triBase;`

**Required fix**: In `emitChainCell()`, set `quadMap[band * cellsPerRow + col] = indexBuf.length` (position of first triangle) for the cell. This enables the mesh optimizer to locate chain-cell triangles. Alternatively, keep `-1` for chain cells (current CDT behavior) if the optimizer doesn't need to process them individually.

### C4 [CRITICAL]: Vertex buffer allocation — no companion slack but need intersection vertices

**Problem**: The current code allocates vertex buffer with generous slack for companions (191K+), shadow vertices, and boundary companions. The proposal eliminates all of these but needs buffer capacity for cross-column intersection vertices.

**Evidence**: Current allocation includes `boundaryCompanionSlack` and `totalShadowCount` at [OWT line ~930](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L930). With companions removed, the buffer is much smaller, but must still accommodate `crossCellEdgeCount` intersection vertices (one per column boundary crossed).

**Required fix**: Allocate `gridVertexCount + chainVertices.length + maxIntersectionVertices` where `maxIntersectionVertices` is a conservative upper bound (e.g., `chainEdges.length * 3`). Trim at the end as the current code does.

---

### W1 [WARNING]: Cross-column edge cell produces 5+ vertex polygon

**Problem**: When a chain edge enters a cell through its LEFT or RIGHT boundary (cross-column case), the cell has 5+ boundary vertices: the 4 grid corners plus the intersection point on the vertical edge. The Generator's Case D analysis gets confused in the document ("Hmm, this case is more complex") and ends with "use a mini ear-clipping or fan triangulation."

**Risk**: The 5-vertex polygon triangulation hasn't been fully specified. A fan from one corner can create slivers if the intersection point is near a corner.

**Mitigation**: For the cross-column case, treat the intersection point as a vertex on the left/right cell boundary, splitting that boundary edge into two segments. Then use `sweepQuad` with the boundary split as follows:

For a chain edge entering the LEFT boundary at `CROSS` and exiting at top-edge vertex `CP_top`:
- Left sub-quad: bot=[BL], top=[TL, CROSS_to_TL_part] — but this requires the left edge to be treated as a "tall edge" with CROSS splitting it.

Better approach: Insert CROSS as an intermediate vertex on the left boundary, making the cell a 5-sided polygon. Decompose into two sub-quads using the chain edge as partition:
- Upper-left: sweep `[CROSS]` × `[TL, CP_top]` (triangle: CROSS-TL-CP_top, or fan)
- Lower + right: sweep `[BL, BR]` × `[CROSS, ..., CP_top, TR]`? This doesn't map cleanly to a two-edge sweep.

**Recommendation**: For cross-column cells, use a general simple-polygon triangulator (ear clipping or a mini CDT of ≤8 vertices). The per-cell vertex count is bounded, so this is O(1) and avoids the complexity of adapting `sweepQuad` to non-quad shapes.

### W2 [WARNING]: The `constrainedSweepCell` sub-quad boundaries may not be clean

**Problem**: In `constrainedSweepCell`, when there's a chain edge from bot position `bIdx` to top position `tIdx`, the left sub-quad is `bot[0..bIdx]` × `top[0..tIdx]`. But what if `bIdx=0` (the chain vertex is at the leftmost position on the bottom edge, i.e., the chain vertex happened to be assigned to this cell and sits just right of BL)? Then the left sub-quad would be `bot[0..0]` = `[BL]` × `top[0..tIdx]` = `[TL, ..., CP_top]`. A sweep with `botLen=1` produces a fan from BL, which works but may create thin triangles.

**Risk**: Low — this is a valid degenerate case of sweepQuad and produces correct (if not optimal) results.

### W3 [WARNING]: Existing `ChainStripTriangulator.test.ts` tests must be replaced

**Problem**: The test file at [ChainStripTriangulator.test.ts line 76](../../src/renderers/webgpu/parametric/ChainStripTriangulator.test.ts#L76) contains ~15+ test cases covering CDT, sweep, sweep-repair modes. Deleting the file means losing test coverage for chain triangulation.

**Required fix**: Write replacement tests for the new cell-local system:
1. `sweepQuad` unit tests: standard cell, one chain vertex, two chain vertices, unequal edge lengths
2. `constrainedSweepCell` tests: one chain edge, two chain edges, edge at cell boundary
3. `emitChainCell` integration tests: cross-column edges, batch2Remap'd endpoints
4. Chain edge enforcement: verify all chain edges appear as mesh edges (critical regression test)

---

## Amendments Required

### A1 [MANDATORY]: Pre-compute batch2Remap before cellChainMap construction

Extract the merge-detection logic from `buildMergedRow()` into a standalone pass. Remap chain edge endpoints immediately after. See C1 and C2 above for details.

### A2 [MANDATORY]: Revise min-angle claim OR increase merge threshold

Either:
- **(Option A)**: Increase `batch2Remap` threshold to `5e-4` (guarantees min angle ≥ ~11° for typical cell dimensions). Requires re-validating Assumption 7 at the higher threshold — 5e-4 is ~34% of cell width, which is aggressive. 3D error: `5e-4 × 2π × 10mm ≈ 0.03mm` — still below FDM resolution.
- **(Option B)**: Keep threshold at `1e-4` and revise the expected min angle to ~2-5°. This is still a massive improvement over the current 0.0° and 64.1% sliver rate. Document the known thin-triangle zone honestly.

**Recommendation**: Option B. Increasing the threshold to 5e-4 merges too aggressively — ~34% of cell width starts to blur feature positions. Accept ~2-5° minimum angles as a vast improvement over the status quo, and pursue angle improvement in a future round via adaptive merge thresholds that consider local cell dimensions.

### A3 [MANDATORY]: Maintain quadMap for chain cells

Set `quadMap[band * cellsPerRow + col] = indexBuf.length` at the start of each chain cell emission, or set to `-1` consistently. The Executioner must decide based on whether the mesh optimizer needs chain-cell triangle offsets.

### A4 [MANDATORY]: Handle batch2Remap'd chain edge endpoints in constrainedSweepCell

When a chain edge has one endpoint that's a grid vertex (after batch2Remap), that endpoint is a cell CORNER (BL, BR, TL, or TR), not a mid-edge chain vertex. The `constrainedSweepCell` logic must handle this case:
- `bot.indexOf(v0)` will find the grid vertex at position 0 or `bot.length-1`
- The chain edge from corner to mid-edge chain vertex constrains the diagonal choice
- This is equivalent to Case C with the chain vertex at one corner — the partition produces one triangle on one side and a larger sub-quad on the other

### A5 [RECOMMENDED]: Specify cross-column intersection vertex handling precisely

The Generator acknowledges Case D is complex and waves hands ("use mini ear-clipping"). The Executioner needs a precise algorithm. Recommendation: for cells with a cross-column chain segment:

1. Add the intersection vertex to the left or right cell boundary
2. Sort boundary vertices by T position
3. Use a fan triangulation from the chain edge to fill each sub-region
4. This is at most ~6 triangles per cross-column cell

### A6 [RECOMMENDED]: Remove cdt2d dependency only after verifying no other consumers

Before removing the `cdt2d` npm package, verify no other file imports it:
```bash
grep -r "cdt2d" potfoundry-web/src/ --include="*.ts"
```
If only `ChainStripTriangulator.ts` uses it, safe to remove.

### A7 [RECOMMENDED]: Retain diagnostic logging parity

The current system logs extensive diagnostics: chain-strip quality metrics, companion counts, batch2Remap counts, etc. The new system should log equivalent metrics: `cellChainMap` size, cross-column edge count, chain cells emitted, batch2Remap count, and chain-edge enforcement rate. This is critical for debugging in production.

---

## Risk Assessment

### What Could Go Wrong

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Corner-case thin triangles (2-5° min angle) | Medium | Low | Massive improvement over 0.0°; can optimize later |
| Cross-column cell triangulation bugs | Low | Medium | <5% of cells; bounded vertex count; testable in isolation |
| batch2Remap sequencing bug | High if not addressed | Critical | Amendment A1 is mandatory |
| Missing chain edges after partition | Low | Critical | Amendment A4 + comprehensive chain-edge audit at end |
| quadMap regression breaks mesh optimizer | Medium if not addressed | Medium | Amendment A3 is mandatory |
| FeatureEdgeGraph incompatibility | Very Low | Medium | Verified compatible in Q5 |
| Spiral-feature styles with many cross-column edges | Medium | Low | Algorithm handles correctly; just more intersection vertices |

### Blast Radius

- **Files modified**: `OuterWallTessellator.ts` (major rewrite of emission loop), `ParametricExportComputer.ts` (remove `ChainStripConfig` from call site)
- **Files deleted**: `ChainStripTriangulator.ts` + `.test.ts`
- **Dependencies removed**: `cdt2d`
- **Total lines changed**: ~700 removed, ~250 added, net −450
- **Test impact**: All OWT tests that trigger chain strips will produce different (hopefully better) output. Any snapshot tests or exact triangle count assertions will need updating.

### Estimated Improvement (Revised)

| Metric | Current (R33) | Realistic R34 | Basis |
|--------|---------------|---------------|-------|
| Min angle (UV) | 0.0° | ~2-5° (worst case) | Merge threshold corner case |
| Max aspect ratio | 24633:1 | <50:1 | Cell aspect ratios bounded by grid geometry |
| Sliver rate | 64.1% | <5% | Cell-local triangles bounded by cell shape |
| Companion vertices | 191K | 0 | Eliminated by design |
| Missing chain edges | ~500+ | 0 | Guaranteed by construction (Assumption 2) |
| Inconsistent normals | 4571 | ~0 | `emitTriCCW` with cross-product check |
| Build time | ~300ms | <50ms | No CDT, no companion generation |

---

## Implementation Conditions (for Executioner)

If the Generator addresses the mandatory amendments (A1–A4), proceed with implementation in this order:

1. **Pre-compute batch2Remap** — extract from buildMergedRow, apply to chainEdges
2. **Build cellChainMap** — maps (band, col) → chain vertices + edges
3. **Implement `sweepQuad()`** — two-pointer sweep with `emitTriCCW`
4. **Implement `constrainedSweepCell()`** — partition + sweep
5. **Implement cross-column handling** — intersection vertices + per-cell mini-triangulator
6. **Replace main cell loop** — simple per-cell dispatch
7. **Delete companion system** — Sections 1.5, interiorByBand, shadows, etc.
8. **Delete strip detection** — colHasChain, rawColHasChain, expansion, buildMergedRow
9. **Delete ChainStripTriangulator.ts** + remove cdt2d dependency
10. **Update ParametricExportComputer.ts** — remove ChainStripConfig/Stats references
11. **Write replacement tests** — sweepQuad, constrainedSweepCell, chain edge enforcement
12. **Run full export** + compare quality metrics against R33 baseline

### Validation Protocol

1. **Chain edge enforcement rate**: Must be ≥ 99.5% (currently ~85%). Target: 100%.
2. **Sliver rate**: Must be < 10% (currently 64.1%). Target: < 5%.
3. **Max aspect ratio**: Must be < 100:1 (currently 24633:1). Target: < 50:1.
4. **Min angle**: Must be > 1° (currently 0.0°). Target: > 2°.
5. **No regression in standard cell count**: Standard cells should INCREASE (recovering cells from CDT strips).
6. **No new non-manifold edges**: Edge audit must report 0 non-manifold edges.
7. **All existing OWT tests pass** (with updated expected values where necessary).
8. **Visual comparison**: Export 3-4 styles (vertical ridges, diagonal, spiral) and compare mesh quality.
