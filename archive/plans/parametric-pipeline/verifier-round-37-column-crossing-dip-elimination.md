# Verifier Round 37 — Critique of Generator's Column-Crossing Dip Elimination Proposals

Date: 2026-03-08

## Summary Verdict: ACCEPT WITH AMENDMENTS (Proposal 2 only)

Proposals 1, 3, 4: REJECT (3 salvageable as follow-up, 1 and 4 not recommended).  
Proposal 2 (Per-Super-Cell Band Splitting): **ACCEPT WITH 7 MANDATORY AMENDMENTS**.

The root cause analysis is excellent — the Generator correctly identifies that the dip is a vertex-absence problem, not a triangulation problem. However, the implementation plan has 3 CRITICAL issues that must be resolved before the Executioner touches code.

---

## Critique of Generator Assumptions

### A1 [CONFIRMED]: "The chain edge is approximately linear between consecutive points"

**Generator's claim**: The chain edge between adjacent-row chain vertices is approximately linear in UV space.

**Actual behavior**: CONFIRMED. The gap-fill interpolation at [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L725-L744) uses pure linear interpolation:

```typescript
const frac = s / steps;
let interpU = p0.u + du * frac;
```

Between original chain points on adjacent rows (`rowGap === 1`), there are NO intermediate vertices — the chain edge IS the direct line segment between the two endpoints (line 720: `if (rowGap <= 1 && rowGap >= -1) continue;`). CatRom subdivision was removed in v27 (line 750 comment). The chain is piecewise-linear by construction.

The `tCross` formula α = (U_c − u_A) / (u_B − u_A) is exact for a linear segment, not an approximation.

**Verdict**: No issue here.

---

### A2 [PARTIALLY CONFIRMED]: "V_cross at (U_c, tCross) will be at ridge elevation"

**Generator's claim**: The phantom vertex V_cross at (U_c, tCross) lies on the chain edge, and since the chain tracks the ridge, V_cross is at ridge elevation.

**Verification**: The math is correct that V_cross lies on the chain edge *in UV space*:

$$\alpha = \frac{U_c - u_A}{u_B - u_A}, \quad u_{cross} = u_A + \alpha(u_B - u_A) = U_c \quad \checkmark$$

However, "at ridge elevation" requires that the parametric surface R(U_c, tCross) is at the feature peak. The vertex buffer stores `(u, t, surfaceId)` per [line 791-799](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L791-L799) — the parametric evaluator converts to 3D later. The actual elevation depends on whether the ridge line curves between rows in UV space.

**Counterexample**: If the ridge in UV space follows a curve (not a straight line) between row j and row j+1, then the straight-line interpolation (U_c, tCross) may miss the actual ridge peak by some Δu. The deviation is bounded by the ridge curvature × (row spacing)². With typical values (column spacing ~0.0018, row spacing ~0.0024, ridge U-drift per row ~0.0003), the curvature-induced deviation is O(10⁻⁷) — negligible.

**However**: The Generator's claim has a subtle conflation. V_cross is at (U_c, tCross) — this is the point where the chain edge crosses the column boundary. The chain vertex at row j is at u_bot (near-peak, not exactly at peak — feature detection has ±0.00006 sampling jitter). So V_cross is on the line between two *near*-peak points. It will be within the feature detection accuracy of the true ridge, which is sufficient.

**Verdict**: Essentially correct. The elevation will be within feature-detection jitter (~0.00006 U) of true ridge. No amendment needed, but the Executioner should not claim "exact ridge elevation" — it's "near-ridge elevation consistent with feature detection accuracy."

---

### A3 [REFUTED]: "The vertex buffer can be expanded dynamically within emitSuperCell"

**Generator's claim**: Phantom vertices can be added within `emitSuperCell` by expanding the vertex buffer.

**Actual code** at [lines 784-785](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L784-L785):

```typescript
const totalVertexCount = gridVertexCount + chainVertices.length;
const vertices = new Float32Array(totalVertexCount * 3);
```

This is a **FIXED-SIZE Float32Array** allocated BEFORE the emission loop (which starts at [line 1232](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1232)). `Float32Array` cannot be resized. Writing to indices beyond `totalVertexCount * 3` would be out-of-bounds (silent in JS — writes to nothing, reads return undefined).

The Generator acknowledges this in Phase 1 ("Pre-Allocation") and proposes counting crossings before allocation. But the pseudocode in Phase 2 blithely uses `nextPhantomIdx++` to write into the buffer as if it's growable:

```typescript
const vL = nextPhantomIdx++;
vertices[vL * 3] = unionU[colStart]; // OUT OF BOUNDS if buffer wasn't enlarged
```

**Required fix**: Pre-count phantom vertices from `superCellMap` AFTER the super-cell merge (section 3.8, [lines 987-1030](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L987-L1030)) but BEFORE buffer allocation (line 784). This requires reordering the code:

1. Build chainVertices (existing section 1)
2. Build cellChainMap + fusionRequests + superCellMap (existing sections 3.7-3.8)
3. **NEW: Count phantom vertices from superCellMap** ← requires reading chain edges from superCellMap cells
4. Allocate `vertices = new Float32Array((totalVertexCount + phantomCount) * 3)`
5. Fill grid + chain vertices (existing section 2)
6. Emit cells with `nextPhantomIdx = totalVertexCount`

This is a **significant reordering** of the existing pipeline. Currently, vertex buffer allocation (section 2, line 784) happens BEFORE cellChainMap construction (section 3.7, line 853). The chain edge assignment at section 3.7 references `vertices[]` for position lookups ([line 858](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L858): `const isChainV0 = v0 >= gridVertexCount && v0 < totalVertexCount`). These checks use `totalVertexCount` — if we expand it to include phantoms, the bounds check still works (phantoms are > totalVertexCount and < expanded bound).

**Severity**: CRITICAL — without this fix, the implementation writes out-of-bounds.

**Amendment A3**: Reorder pipeline to: (a) collect chain vertices, (b) build edges + super-cells, (c) count phantom vertices from super-cells, (d) allocate expanded buffer, (e) fill buffer, (f) emit. Document the dependency chain explicitly.

---

### A4 [REFUTED]: "Splitting the chain edge at V_cross won't break edge enforcement"

**Generator's claim**: Chain edge splitting is manageable.

**Actual verification code** at [lines 1337-1400](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1337-L1400):

```typescript
for (const [v0, v1] of chainEdges) {
    if (v0 === v1) continue;
    // ... (looks up in meshEdgeSet) ...
    const key = v0 < v1 ? `${v0}-${v1}` : `${v1}-${v0}`;
    if (meshEdgeSet.has(key)) { enforced++; }
    else { missing++; }
}
```

The verification iterates over the **master `chainEdges` array** and checks each against `meshEdgeSet` (built from the index buffer). If the original edge A→B is in `chainEdges` but was locally split inside `emitSuperCell` into A→V_cross and V_cross→B, then:

- The index buffer contains triangles with edges A→V_cross and V_cross→B ✓
- `meshEdgeSet` contains A→V_cross and V_cross→B ✓
- `chainEdges` still contains the ORIGINAL A→B ✗
- Verification looks for A→B in meshEdgeSet → NOT FOUND → **false "missing edge" report**

The Generator's Phase 3 proposes updating `chainEdges` after the fact, but the sequencing is confused. The pseudocode in Phase 3 runs chain splitting **inside** `emitSuperCell` (which is called from the emission loop at line 1232), but the verification runs AFTER the emission loop (line 1337). So the timeline is:

1. `chainEdges` built (line 770)
2. **Emission loop** (line 1232) — emitSuperCell splits edges locally
3. batch6 dedup remaps chainEdges (line 1315)
4. Verification loop (line 1337) — still has original unsplit edges

**Required fix**: The master `chainEdges` array must be updated with the split edges BEFORE verification. Two clean approaches:

**(a) Global pre-split**: Before emission, iterate over superCellMap, compute crossings, split chainEdges in-place. This is cleanest but requires computing crossings twice (once for counting, once for splitting).

**(b) Local split with accumulator**: Give `emitSuperCell` a reference to a `splitEdges` accumulator. After emission, replace entries in `chainEdges` that were split. More complex but avoids double computation.

Also: the batch6 dedup at [line 1315](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1315-L1322) remaps `chainEdges` endpoints. If chain edges were added/split, the new sub-edges must also be present in `chainEdges` before batch6 runs, or they'll be missed by the remap.

**Severity**: CRITICAL — false failure reports at minimum; potentially masks real enforcement failures.

**Amendment A4**: Mandate global pre-split of chainEdges before the emission loop. The split computation is cheap (iterate superCellMap, compute α for each crossing). This also provides the phantom vertex positions needed for pre-allocation (Amendment A3). Single pass: iterate superCellMap → compute crossings → split chainEdges → count phantom vertices → allocate buffer.

---

### A5 [PARTIALLY CONFIRMED]: "2-column super-cells with 2 crossing points generalize cleanly"

**Generator's claim**: Multi-column super-cells with multiple crossings produce multiple sub-bands; the mechanism generalizes.

**Actual code** — fusion merge at [lines 987-1010](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L987-L1010):

```typescript
for (let i = 1; i < reqs.length; i++) {
    if (reqs[i].colStart <= cur.colEnd + 1) {
        cur.colEnd = Math.max(cur.colEnd, reqs[i].colEnd);
    } else { merged.push(cur); cur = { ...reqs[i] }; }
}
```

Fusion requests merge when they overlap or are adjacent (`colStart <= cur.colEnd + 1`). Two 1-column crossings in the same band at columns c and c+1 produce fusion requests `{c, c+1}` and `{c+1, c+2}` — these merge into a single super-cell spanning columns c to c+2 (3 columns, 2 intermediate boundaries).

For a 3-column super-cell, the phantom row at each crossing T has 4 vertices (left, two intermediates, right). If the two crossings have **different T values**, we get two phantom rows and 3 sub-bands — this generalizes correctly.

If the two crossings have **nearly identical T** (within DEDUP_T = 1e-6), they're deduped into one phantom row. This is safe — one phantom row with both intermediate vertices handles both crossings.

**Counterexample for concern**: A super-cell with, say, 4 column crossings from 4 different chains, each at a different T. This produces 4 phantom rows and 5 sub-bands. The sub-band emission loop in the Generator's Phase 2 handles this correctly (it's a simple sorted loop). However, the edge-to-sub-band assignment (the `filter` at the end of Phase 2) uses T-range containment — if a chain edge spans from below tCross1 to above tCross2, it won't fit in ANY single sub-band. This is a real issue.

**Scenario**: Chain edge spans from (u_A, tBot+ε) to (u_B, tTop-ε), crossing column boundaries at tCross1 and tCross2. After splitting at both crossings, the sub-edges are:
- A → V_cross1 (in sub-band 1)
- V_cross1 → V_cross2 (in sub-band 2)
- V_cross2 → B (in sub-band 3)

This works IF chain edges are pre-split (Amendment A4). Without pre-splitting, the original edge A→B doesn't fit in any sub-band → dropped from constraint set → enforcement failure.

**Verdict**: Generalizes correctly ONLY with Amendment A4 (global pre-split). The Generator's pseudocode with per-sub-band edge filtering would silently drop multi-crossing edges.

**Amendment A5**: The edge-to-sub-band assignment MUST use pre-split sub-edges, not filter original edges by T-range. This is automatically satisfied if Amendment A4 is implemented (global pre-split produces sub-edges that each fit in exactly one sub-band).

---

### A6 [PARTIALLY CONFIRMED]: "VL_cross and VR_cross will be at reasonable elevations"

**Generator's claim**: Left/right wall phantom vertices are at "reasonable" elevations — grid-like interpolated points.

**Verification**: VL_cross at `(unionU[colStart], tCross)` and VR_cross at `(unionU[colEnd+1], tCross)` are parametric surface points at column boundaries with intermediate T positions. Their 3D positions are determined by the parametric evaluator.

These vertices are NOT on any grid row, so their elevation depends on the surface between rows. For a smooth parametric surface, this is simply bilinear (or higher-order) interpolation between the four surrounding grid vertices — perfectly reasonable.

**Edge case**: If `tCross` is within ε of `tBot` or `tTop`, the phantom row nearly coincides with an existing row. The sub-band height approaches zero, creating degenerate near-zero-area triangles. The Generator's pseudocode has a guard:

```typescript
if (t <= tBot + 1e-9 || t >= tTop - 1e-9) continue;
```

This ε = 1e-9 is too tight. At typical T-spacing (~0.0024), a phantom row at tBot + 1e-9 creates a sub-band of height 1e-9, producing triangles with aspect ratio ~10⁶. This will cause numerical issues in sweepQuad (cross products near zero, winding detection failures).

**Required fix**: Use ε = 1e-4 (or even 0.05 × band_height) as the degenerate guard. If tCross is within this ε of tBot or tTop, skip the split — the dip will be minimal because the chain vertex is already near the grid row.

**Severity**: WARNING — degenerate triangles won't crash but will produce mesh artifacts.

**Amendment A6**: Change the degenerate guard from `1e-9` to `max(1e-4, 0.05 * (tTop - tBot))`. When a crossing is skipped, emit the super-cell without splitting (existing behavior, producing the original dip which is small because the crossing is near a row boundary).

---

## Critique of Additional Attack Vectors

### C7 [CRITICAL]: constrainedSweepCell partition requires chain endpoints on bot/top edges

**The issue**: `constrainedSweepCell` at [lines 303-312](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L303-L312) uses `bot.indexOf(v0)` and `top.indexOf(v1)` to find chain edge endpoints:

```typescript
let bIdx = bot.indexOf(v0);
let tIdx = top.indexOf(v1);
if (bIdx < 0 || tIdx < 0) {
    bIdx = bot.indexOf(v1);
    tIdx = top.indexOf(v0);
}
```

For a sub-band, consider the lower sub-band:
- bot = original botEdge (contains chainV_bot)
- top = phantom row [VL_cross, V_cross, VR_cross]
- Chain sub-edge: chainV_bot → V_cross

`bot.indexOf(chainV_bot)` → found ✓  
`top.indexOf(V_cross)` → V_cross is in the phantom row ✓

This works. For the upper sub-band:
- bot = phantom row [VL_cross, V_cross, VR_cross]
- top = original topEdge (contains chainV_top)
- Chain sub-edge: V_cross → chainV_top

`bot.indexOf(V_cross)` → found ✓  
`top.indexOf(chainV_top)` → found in original topEdge ✓

**Verdict**: This works correctly IF chain edges are pre-split (Amendment A4). Without pre-splitting, the original edge chainV_bot → chainV_top would fail: `top.indexOf(chainV_top)` fails in the lower sub-band because the phantom row doesn't contain chainV_top.

**Severity**: Covered by Amendment A4. No additional amendment needed.

---

### C8 [CONFIRMED]: sweepQuad monotone edges are valid

The phantom row `[VL_cross, V_cross, VR_cross]` is sorted by U because column boundaries are monotonically increasing (`unionU[colStart] < unionU[c] < unionU[colEnd+1]`). Original bot/top edges are already sorted by U (see [line 1170](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1170): `botEdge.sort((a, b) => vertices[a * 3] - vertices[b * 3])`).

Each sub-band is a valid monotone polygon: U-sorted bot edge, U-sorted top edge, chain sub-edge as a partition line connecting one bot vertex to one top vertex. `constrainedSweepCell` and `sweepQuad` handle this correctly.

**Verdict**: No issue.

---

### C9 [CONFIRMED WITH NOTE]: emitSuperCell pre-emission work remains correct

The pre-emission steps in `emitSuperCell` ([lines 1119-1195](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1119-L1195)):

1. **quadMap marking** (line 1127): Marks all constituent cells as `-1`. Still correct — the super-cell covers the same columns regardless of sub-band splitting.
2. **Edge construction** (lines 1133-1170): Builds botEdge/topEdge from grid + chain vertices. Still needed — these become the bottom of the first sub-band and top of the last sub-band.
3. **Dedup** (lines 1172-1175): Removes duplicate vertices from batch2Remap. Still correct.
4. **Chain-adjacent marking** (lines 1178-1181): Marks intermediate column grid vertices. Still correct.
5. **Degenerate check** (lines 1184-1189): Checks `finalBot.length < 2`. Needs amendment for sub-bands: each sub-band's edges should be checked. But phantom rows always have ≥ 3 vertices, so this check would only fail for the original bot/top, which is already handled.

**Verdict**: No additional amendment needed, but the Executioner should add sub-band degenerate checks defensively.

---

### C10 [WARNING]: Phantom vertices escape batch6 dedup

**Actual code** at [line 1269](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1269):

```typescript
const totalVerts = totalVertexCount; // Exclude topRow duplicate indices from dedup
```

The batch6 loop runs `for (let v = 0; v < totalVerts; v++)`. If the vertex buffer is expanded to accommodate phantom vertices beyond `totalVertexCount`, they won't be scanned.

**Impact analysis**: 
- Phantom vertices at `(U_c, tCross)` have unique UV coordinates — no collision risk with grid/chain vertices (different T from any grid row).
- Two super-cells in the same band with the same crossing T would produce phantom vertices at the same T but different U (different column boundaries) — no collision.
- The only realistic collision: two chains crossing the SAME column boundary at the SAME T in the SAME band. This would be caught by the pre-split dedup (Amendment A4's single-pass computation deduplicates crossings by T).

**Required fix**: Update `totalVerts` to include phantom vertices:

```typescript
const totalVerts = totalVertexCount + phantomVertexCount;
```

**Severity**: WARNING — phantom vertex duplicates are theoretically possible but extremely rare in practice.

**Amendment C10**: Update `totalVerts` in batch6 to `totalVertexCount + phantomVertexCount`. Minimal code change with no performance impact (~7.5k additional vertices in the dedup scan).

---

### C11 [CRITICAL]: Original chain edges become orphaned after local splitting

**The issue**: This is the flip side of A4. The `chainEdges` array at [line 665](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L665) contains the ORIGINAL unsplit edges. If `emitSuperCell` locally splits edges but doesn't update `chainEdges`, the verification at [line 1354](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1354) produces false "missing edge" reports.

Additionally, batch6 dedup at [line 1315](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1315) remaps `chainEdges` endpoints. If split sub-edges aren't in `chainEdges`, their endpoints won't be remapped → verification uses un-remapped indices → misses real enforcement even when edges exist.

**Severity**: CRITICAL — covered by Amendment A4 (global pre-split). No additional amendment needed beyond A4.

---

## Proposal-Level Verdicts

### Proposal 1: Targeted Micro-Rows at Exact Crossing T — REJECT

**Reason**: The cost analysis is prohibitive. 150-250 micro-rows × 1,370 tris = 205k-342k additional tris, potentially exceeding the 1M limit. And micro-rows don't eliminate dips — they only halve the band height, reducing dip magnitude by ~50%. The Generator's own analysis shows this could exceed budget.

Additionally, the `colGap > 1` threshold at [line 393](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L393) means 1-column crossings (the dominant case: 2,529 of 2,529) are NEVER caught by the micro-row system. Changing to `colGap >= 1` would trigger for ALL 1-column crossings, inserting a micro-row for each — this is exactly the budget-busting scenario.

### Proposal 2: Per-Super-Cell Band Splitting — ACCEPT WITH AMENDMENTS

**Reason**: Correct root cause analysis, minimal vertex cost (~7.5k vertices), architecturally clean (sub-bands are valid monotone polygons), self-contained change scope. The 7 amendments below resolve all critical issues.

### Proposal 3: Abolish Super-Cells — REJECT (salvageable as future work)

**Reason**: This is architecturally the cleanest long-term solution, but it requires fundamental changes to chain vertex collection ([line 680](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L680)), edge recording, and cellChainMap construction. The risk of regression is high for a first attempt. Recommend implementing Proposal 2 first, then evaluating Proposal 3 as a follow-up if super-cells continue to cause issues.

### Proposal 4: Hybrid with Companion Fan — REJECT

**Reason**: Premature optimization. Implement Proposal 2 first, measure triangle quality, then add companion fans only if needed. The Generator correctly notes this in the proposal text.

---

## Mandatory Amendments for Proposal 2 ACCEPTANCE

### Amendment A3: Pipeline reordering for vertex buffer pre-allocation
**Severity**: CRITICAL  
**What**: The vertex buffer must be sized to include phantom vertices. This requires knowing the phantom count before allocation, which requires knowing super-cell crossings, which requires having chainEdges and superCellMap.  
**How**: Reorder the pipeline:
1. Sections 0-1: Chain vertex collection (existing)
2. Section 2: Grid + chain vertex buffer allocation → **DEFER**
3. Sections 3.5-3.8: batch2Remap, chainEdges, cellChainMap, superCellMap (existing)
4. **NEW Section 3.9**: Compute crossings from superCellMap → count phantom vertices → split chainEdges
5. Section 2 (deferred): Allocate `Float32Array((gridVertexCount + chainVertices.length + phantomCount) * 3)`
6. Fill grid + chain vertices
7. Section 4: Cell emission with phantom vertex writes starting at `totalVertexCount`

### Amendment A4: Global pre-split of chain edges
**Severity**: CRITICAL  
**What**: Chain edges that cross column boundaries within super-cells must be split in the master `chainEdges` array BEFORE the emission loop and BEFORE batch6 dedup.  
**How**: In new Section 3.9, for each super-cell, iterate its chain edges, compute crossing points, replace the original edge with sub-edges. Update the edge entries in cellChainMap too (each sub-edge should only appear in the cells/sub-bands it spans).

### Amendment A5: Sub-band edge assignment must use pre-split edges
**Severity**: CRITICAL  
**What**: The Generator's Phase 2 pseudocode uses T-range filtering on ORIGINAL edges to assign edges to sub-bands. This drops edges that span multiple sub-bands.  
**How**: After global pre-split (A4), each sub-edge spans exactly one sub-band (by construction — they're split at phantom row T values). The T-range filter then works correctly. This is automatically satisfied by A4.

### Amendment A6: Degenerate guard epsilon
**Severity**: WARNING  
**What**: The `1e-9` guard for tCross near band boundaries produces near-zero-area triangles.  
**How**: Use `max(1e-4, 0.05 * (tTop - tBot))` as the skip threshold. When skipped, fall through to existing un-split emission.

### Amendment C10: Include phantom vertices in batch6 dedup
**Severity**: WARNING  
**What**: Batch6 dedup loop bound excludes phantom vertices.  
**How**: Change `const totalVerts = totalVertexCount` to `const totalVerts = totalVertexCount + phantomVertexCount` (or use `vertices.length / 3`).

### Amendment A7 (NEW): Update `isChainV` bounds checks
**Severity**: WARNING  
**What**: Multiple places in the code check `v0 >= gridVertexCount && v0 < totalVertexCount` to determine if a vertex is a chain vertex (e.g., [lines 858-859](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L858-L859), [lines 922-923](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L922-L923)). Phantom vertices at indices ≥ `totalVertexCount` would fail this check and be treated as neither grid nor chain.  
**How**: Either (a) define a `phantomVertexStart` constant and add phantom-aware checks, or (b) use a Set of phantom vertex indices, or (c) extend `totalVertexCount` to include phantoms and distinguish phantom from chain by index range. The Executioner should choose the approach that introduces the fewest changes to existing logic.

### Amendment A8 (NEW): Phantom vertex chainEdges registration
**Severity**: WARNING  
**What**: Split sub-edges (e.g., A→V_cross, V_cross→B) must be registered in cellChainMap for the cells they belong to, so that `emitSuperCell` includes them in `uniqueEdges` and passes them to `constrainedSweepCell`. Currently, cellChainMap is populated from chainEdges at [lines 850-950](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L850-L950). After pre-splitting, the new sub-edges must propagate into cellChainMap entries.  
**How**: Run the cellChainMap population AFTER chain edge pre-splitting (A4). Since we're reordering anyway (A3), this fits naturally.

---

## Open Questions for Generator

1. **Do phantom vertices need to participate in FeatureEdgeGraph?** The return value at [line 1418](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1418) includes `chainVertexChainIds` built from `chainVertices`. Phantom vertices at crossing points ARE on chain edges — should they be tagged with a chainId for edge graph construction? If not, the edge graph may have discontinuities at crossing points.

2. **What about the `chainAdjacentGridVerts` set?** Phantom vertices at column boundaries are adjacent to chain edges. Should VL_cross and VR_cross be added to this set? Currently only grid vertices at intermediate columns are added ([line 1178](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1178-L1181)). This affects the optimizer visibility pass downstream.

3. **Super-cell count metric**: The Generator claims the super-cell count should "drop to near 0." This is incorrect — Band splitting doesn't eliminate super-cells; it splits them into sub-bands. The super-cell count remains the same. What changes is the dip depth. Propose a new metric: "crossing dip depth" as defined in the validation criteria.

---

## Implementation Conditions for Executioner

If all 7 amendments are accepted, the Executioner should implement in this order:

1. **Phase 0: Pipeline reordering** (A3) — Move vertex buffer allocation after super-cell construction. This is the riskiest change (most code motion). Verify all existing tests pass after this refactor with NO behavior changes.

2. **Phase 1: Crossing computation + chain edge pre-split** (A4, A5, A8) — Add Section 3.9 to compute crossings, split chainEdges, and recompute cellChainMap sub-edge assignments. Add unit test: verify that after splitting, every sub-edge has both endpoints within a single sub-band's T range.

3. **Phase 2: Phantom vertex allocation + emitSuperCell band splitting** (A3 completion, A6) — Allocate expanded buffer, implement the band splitting logic in emitSuperCell. Add guard for degenerate crossings near band boundaries.

4. **Phase 3: Fixups** (C10, A7) — Update batch6 dedup bound, update isChainV bounds checks.

5. **Phase 4: Validation** — Run full Gyroid export at 512 resolution. Check:
   - [ ] Chain edge enforcement: 100% (no regressions)
   - [ ] Triangle count delta: < 30k additional
   - [ ] No new degenerate triangles (area > 1e-10 for all)
   - [ ] Console log: phantom vertex count matches expectation (~7.5k for 2,529 crossings)
   - [ ] Visual: ridge line smooth at column crossings in mesh viewer

---

## Summary

The Generator's root cause analysis is **excellent** — the dip IS a vertex-absence problem, and the per-super-cell band splitting IS the right approach. But the implementation plan has 3 critical gaps (buffer allocation, chain edge splitting lifecycle, sub-band edge assignment) that would cause out-of-bounds writes, false verification failures, and enforcement drops. With the 7 amendments above, Proposal 2 is sound and ready for implementation.

**Priority ordering of proposals**: 2 > 3 >> 1 > 4

Proposal 2 first (immediate value, bounded risk). Proposal 3 as architectural follow-up (eliminates super-cells entirely). Proposals 1 and 4 are unnecessary if Proposal 2 succeeds.
