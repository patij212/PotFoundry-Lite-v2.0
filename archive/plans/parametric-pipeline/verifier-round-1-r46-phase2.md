# Verifier Round 1 — Critique of Generator R46 Phase 2+3 Proposal
Date: 2026-03-08

## Summary Verdict: ACCEPT WITH AMENDMENTS

P2 (interpolated re-snap) has one CRITICAL mathematical flaw that must be corrected before implementation. P3B is ACCEPTED for the N×M fallthrough case but the Generator's analysis of the both-sides 2×2 case is incorrect — it's not a source of chain-grid dips and the proposed fix is unnecessary. P3C is viable as quick validation but must not ship as the permanent solution.

---

## Critique

### C1 [CRITICAL]: P2 Re-snap Window Is ~10× Too Narrow for Interpolated Vertices

**Generator's claim**: Reuse Step 3.5 re-snap infrastructure with `RESNAP_HALFWIDTH = 2.0 / ROW_PROBE_SAMPLES` (= 0.000244 in U-space).

**Actual behavior**: Step 3.5 re-snap at [ParametricExportComputer.ts](../src/renderers/webgpu/ParametricExportComputer.ts#L948) uses this window for DETECTED peaks that are already within ±1 sample of the true peak (±0.000061 in U). The window of ±0.000244 = ±2 sample widths comfortably covers this.

**Mathematical counterexample**: The Generator's own data states the interpolation error is ~0.71mm. For typical pot radius R≈50mm, circumference ≈ 314mm, so 0.71mm ≈ 0.00226 in U-space. The re-snap window extends only ±0.000244. The true feature peak is **9.3× outside the window**. The 32 candidates are all clustered in a tiny region centered on the wrong position — the re-snap will find the best candidate within ±0.000244 of the interpolated U, which is still ~0.002 away from the true peak.
 
```
  Interpolated U ────────────────[window]──────────────── True peak
                  |<--- 0.000244 --->|<---- 0.00182 ---->|
                                     ^
                             window ends here; peak is out of reach
```

With maxConsecDelta = 0.008727 (from the log), a 3-row gap has total U-drift ~0.026. Even assuming roughly linear drift, the midpoint interpolation error for a quadratic feature path is O(gap² × d²U/drow²). For modest curvature, this easily reaches 0.001–0.003 in U.

The Generator acknowledges this in Open Question 1 ("this window might be tight") but then proceeds to USE the narrow window in the code anyway.

**Required fix**: Use an adaptive window width proportional to the interpolation gap:

```typescript
// Window width scales with interpolation gap to cover quadratic error
// For a gap of N rows, worst-case linear interp error on a quadratic
// path is ~ N² * curvature / 8. Empirically, 4× the per-row delta covers this.
// Minimum: 2 sample widths (same as step 3.5). Maximum: 0.01 U (~3mm).
const gapRows = /* number of rows in the interpolation gap for this vertex */;
const SAMPLE_WIDTH = 1.0 / ROW_PROBE_SAMPLES;   // 0.000122
const BASE_WIDTH = 2.0 * SAMPLE_WIDTH;           // 0.000244 (step 3.5 default)
const GAP_ADAPTIVE_WIDTH = gapRows * gapRows * 0.001; // quadratic scaling
const INTERP_HALFWIDTH = Math.min(0.01, Math.max(BASE_WIDTH, GAP_ADAPTIVE_WIDTH));
```

This requires exposing the gap size (number of interpolated steps) in the `interpolatedChainVertices` data. Add a `gapSize` field:

```typescript
interpolatedChainVertices: Array<{ vertexIdx: number; chainId: number; rowIdx: number; gapSize: number }>;
```

Additionally, with a wider window, 32 candidates may be too sparse. The step size = 2×HALFWIDTH/(CANDIDATES-1). For HALFWIDTH=0.005 (a 3-row gap), step = 0.000323, giving ~20× coarser sampling than step 3.5. Double to 64 candidates to maintain sub-sample precision after parabolic refinement.

**Severity**: CRITICAL — without this fix, P2 will refine <5% of interpolated vertices (only those with tiny errors that happen to fall inside ±0.000244). The 95% with errors >0.000244 will get no improvement.

---

### C2 [CRITICAL]: P2 batch2Remap'd Vertices Must Be SKIPPED, Not Re-snapped

**Generator's claim**: "Use `batch2Remap.get(cv.vertexIdx) ?? cv.vertexIdx`" and re-snap the post-remap vertex.

**Actual behavior**: When batch2Remap fires ([OuterWallTessellator.ts](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L866-L878)), the interpolated chain vertex index is mapped to a GRID vertex index (`row * numU + col`). The grid vertex position in `combinedVerts` has U = `unionU[col]`, a grid column position — NOT the interpolated chain U.

**Two problems**:

1. **Shared vertex corruption**: Grid vertex `row * numU + col` is shared by ALL cells touching that column at that row (up to 4 cells: left/right × above/below). Re-snapping it moves a structural grid vertex, breaking grid regularity for non-chain cells. Those cells' triangles could become poorly shaped or even inverted.

2. **Near-zero benefit**: batch2Remap only fires when `|cv.u - unionU[col]| <= MERGE_THRESHOLD` (1e-4). If the chain vertex was within 0.0001 of a grid column, it's already well-positioned. The interpolation error for this vertex is at most 0.0001 in U — well within step 3.5's window anyway, and barely visible at 0.03mm. There's nothing meaningful to fix.

**Required fix**: Filter out batch2Remap'd vertices entirely:

```typescript
const interpolatedChainVertices = chainVertices
    .filter(cv => cv.pointIdx === -1 && !batch2Remap.has(cv.vertexIdx))
    .map(cv => ({
        vertexIdx: cv.vertexIdx,
        chainId: cv.chainId,
        rowIdx: cv.rowIdx,
        gapSize: /* ... */,
    }));
```

This is simpler and safer than the Generator's approach.

**Severity**: CRITICAL — re-snapping shared grid vertices is an architectural violation that risks cascading mesh quality degradation.

---

### C3 [WARNING]: P2 `combinedVerts[iv.vertexIdx * 3]` Offset Is Correct BUT With a Timing Caveat

**Generator's claim**: Access `combinedVerts[iv.vertexIdx * 3]` to get the current U.

**Verification**: The outer wall is the FIRST surface in `allVertArrays` ([ParametricExportComputer.ts](../src/renderers/webgpu/ParametricExportComputer.ts#L1374)), and `vertexOffset` starts at 0 ([L1327](../src/renderers/webgpu/ParametricExportComputer.ts#L1327)). Outer wall vertex N maps to `combinedVerts[N * 3]`. The OWT `vertexIdx` is local to the outer wall (chain vertices start at `gridVertexCount`). So **the offset is correct** — no inter-surface interference.

**Caveat**: The Generator places the re-snap "after cdtResult extraction and before Phase 3 GPU evaluation" (~L1395). At that point, `combinedVerts` has been assembled at [L1427-L1430](../src/renderers/webgpu/ParametricExportComputer.ts#L1427-L1430). The interpolated vertices' positions ARE in `combinedVerts` with their interpolated U values. The re-snap would update these values in-place before Phase 3 — this is the correct timing.

However, the Generator's code references:
```typescript
const combinedVerts = ...;  // already assembled
// ...later...
combinedVerts[iv.vertexIdx * 3] = finalU;  // update in place
```

This works because `combinedVerts` is `let` (reassignable, [L1427](../src/renderers/webgpu/ParametricExportComputer.ts#L1427)) and the `Float32Array` is mutable. ✓

**Severity**: WARNING — the approach is correct but fragile. If any future change reorders surfaces or adds vertex offsets, this breaks silently. Consider adding an assertion: `assert(iv.vertexIdx < outerVertexCount)`.

---

### C4 [WARNING]: P3B Both-Sides 2×2 Analysis Is Incorrect — Not a Source of chainGridFlips

**Generator's claim**: "When BOTH sides have chains... Which vertex gets the fan diagonal?" and proposes `chainFanQuad` for both-sides 2×2.

**Actual behavior**: I traced the code through `emitChainCell` ([OWT L1462-L1497](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1462-L1497)). For a cell with 2 chain edges, `bot = [BL, chain1, chain2, BR]` where BL/BR are grid vertices. Partitions split this into:

| Sub-quad | bot slice | top slice | prevIsChainEdge | Path | Vertex types |
|----------|-----------|-----------|-----------------|------|--------------|
| 0 (left to chain1) | [BL, chain1] | [TL, chain1] | false | chainFanQuad | 2 grid + 2 chain |
| 1 (chain1 to chain2) | [chain1, chain2] | [chain1, chain2] | true | sweepQuad | **4 chain** |
| 2 (chain2 to right) | [chain2, BR] | [chain2, TR] | true | chainFanQuad (final) | 2 chain + 2 grid |

Sub-quad 1 has **all 4 corners as chain vertices**. The diagonal created by sweepQuad connects chain↔chain. `isChainGridEdge(shLo, shHi)` returns `false` because BOTH endpoints are ≥ `outerGridVertexCount`. **These diagonals are NOT counted in the 1170 chainGridFlips.**

**Implication**: The Generator's proposed `chainFanQuad` for both-sides 2×2 is solving a non-problem. The clock cycles spent implementing it would address zero of the 1170 chain-grid flips.

**The real source**: The 1170 flips come from **N×M sub-quads** (N≥3 or M≥3) where companion/phantom vertices create mixed chain+grid vertex populations in the sweep. These are the sub-quads at L358 and L387 where the code falls through to `sweepQuad`.

**Required fix for P3B**: Drop the both-sides 2×2 `chainFanQuad` proposal. Focus `sweepQuadTracked` exclusively on the N×M fallthrough cases where chain-grid diagonals actually originate.

**Severity**: WARNING — not harmful to implement, but a waste of effort addressing zero dips. The Generator should redirect this effort to understanding the N×M case better.

---

### C5 [NOTE]: P2 Chain Kind Determination Is Correct

**Generator's claim**: Use `meshChains[iv.chainId]` to determine peak vs valley.

**Verification**: 
- `meshChains` is the result of `filterLowConfidenceChains(preSmoothChains)` at [PEC L1111](../src/renderers/webgpu/ParametricExportComputer.ts#L1111)
- `filterLowConfidenceChains` ([ChainLinker.ts L573-606](../src/renderers/webgpu/parametric/ChainLinker.ts#L573-L606)) filters but doesn't reorder — it pushes matching chains to `result[]` in order
- OWT receives `meshChains` as its `chains` parameter at [PEC L1346](../src/renderers/webgpu/ParametricExportComputer.ts#L1346)
- Inside OWT, `chainId: cIdx` is the loop index over `chains` ([OWT L714](../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L714))
- So `meshChains[iv.chainId]` correctly retrieves the parent chain ✓

However, the Generator uses `!parentChain?.kind || parentChain.kind === 'peak'` as the isMax test. This safely defaults to `isMax = true` if `kind` is undefined. For interpolated vertices at valleys, isMax must be false — verify that all chains from `linkFeatureChainsByKind` have a defined `kind` property. If any chain has `kind === undefined`, the re-snap will seek maxima at valleys → wrong direction.

**Severity**: NOTE — the index mapping is correct. The `kind` fallback is a minor concern; add a defensive log: `if (!parentChain?.kind) console.warn(...)`.

---

### C6 [NOTE]: chainGridFlips Counts Only Non-Protected Edges — Confirmed

**Generator asks**: Does `chainGridFlips` include flips on fan diagonal edges (already in constraintEdgeSet)?

**Verification**: In all three CSO phases:
- Phase A ([CSO L587](../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L587)): `if (constraintEdgeSet.has(ek)) continue;` — BEFORE the flip
- Phase B ([CSO L661](../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L661)): `if (constraintEdgeSet.has(ek)) continue;` — BEFORE the flip  
- Phase C ([CSO L714](../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L714)): `if (constraintEdgeSet.has(ek)) continue;` — BEFORE the flip

The `chainGridFlips++` at L643, L699, and L765 execute AFTER `applyFlip`, which is AFTER the constraintEdgeSet check. **The 1170 are exclusively non-protected chain-grid edges.** Fan diagonals in constraintEdgeSet are skipped and never counted.

One subtlety: `isChainGridEdge(shLo, shHi)` tests the EXISTING shared edge (the one being REMOVED by the flip). The new edge `(opp0, opp1)` replaces it. Whether the new edge is also chain-grid is not tracked. This counter tells us how many chain-grid edges were DISRUPTED, not created.

**Severity**: NOTE — the diagnostic interpretation is correct.

---

### C7 [WARNING]: P3C Quality Cost Is Underestimated

**Generator's claim**: P3C (prevent ALL chain-grid edge flips) is "a quick validation step."

**Risk analysis**: The 1170 chain-grid flips ALL passed CSO's rigorous quality criteria:
1. Convexity check (isConvexQuad3D)
2. Min-angle improvement > threshold (~0.001 rad for Phase A, valence-based for Phase B)
3. Aspect ratio guard (newAspect ≤ 12.0 or ≤ curAspect)
4. Normal consistency check (tryFlipWinding)
5. Row-span and edge-length guards

These are NOT random flips — they are geometrically justified quality improvements. Blocking 1170 quality-improving flips means 1170 sub-optimal diagonal choices locked in. The total CSO flip count is 1849, so blocking 63.3% of ALL flips is extremely aggressive.

**However**: The dip artifact is a visual consistency problem, not a triangle quality problem. A mesh with consistently suboptimal diagonals looks smoother than one with row-varying optimal diagonals. The Generator's argument that "consistency > individual quality" is valid for the specific dip failure mode.

**Gate condition for P3C**: P3C is acceptable ONLY as a diagnostic validation step (confirm root cause, then remove). It must NOT ship as permanent code. If it eliminates dips, replace it promptly with P3B's targeted approach.

**Severity**: WARNING — P3C is too blunt for production but viable for diagnosis.

---

### C8 [NOTE]: P2 Tolerance Bound (MAX_INTERP_DELTA = 0.08) Is Reasonable

**Generator's claim**: tolerance of 0.08 in U-space catches runaway re-snaps.

**Verification**: 0.08 U = ~25mm at a 314mm circumference. No feature chain should have 25mm of interpolation error — that would require an absurd ~100-row gap with extreme curvature. The maximum observed gap in regular operation is ~3-5 rows.

With the corrected adaptive window (C1 amendment), the maximum re-snap movement is bounded by the window width (≤0.01 U per C1's proposed clamping), which is well below 0.08. The tolerance bound serves as a safety net against pathological cases.

**Severity**: NOTE — acceptable as-is.

---

### C9 [WARNING]: P2 Should Run Before Phase 4 (Chain-Directed Flip), Not Just Before Phase 3

**Generator places P2**: "After `buildCDTOuterWall` returns and before Phase 3 GPU evaluation."

**Subtle issue**: Phase 3 runs `evaluatePoints(combinedVerts, ...)` to compute 3D positions. After Phase 3, Phase 4 runs `chainDirectedFlip` and `flipEdges3D` using the 3D positions. Then the CSO runs.

The re-snap updates UV positions in `combinedVerts`. Phase 3 evaluates these into 3D positions. But `chainDirectedFlip` ([PEC L1516-L1530](../src/renderers/webgpu/ParametricExportComputer.ts#L1516-L1530)) uses `meshChains` (the pre-OWT chain array) to determine diagonal directions and `outerOrigToFinal` for row mapping. It does NOT directly use the interpolated vertex positions. So `chainDirectedFlip` is not affected by the re-snap — it operates on chain topology, not vertex positions.

`flipEdges3D` uses the 3D positions from Phase 3, which will correctly reflect the re-snapped UVs. ✓

The CSO also uses 3D positions from Phase 3. ✓

**Conclusion**: The Generator's placement is correct. No amendment needed.

**Severity**: WARNING — verified safe, but worth documenting the reasoning.

---

## Accepted Items

1. **P2 pipeline placement** (after OWT, before Phase 3 GPU eval) — verified correct, Phase 3 will use updated UVs
2. **P2 tolerance bound** (MAX_INTERP_DELTA = 0.08) — reasonable safety net
3. **P2 vertex offset** (`combinedVerts[iv.vertexIdx * 3]`) — verified correct when outer wall is first surface
4. **P2 chain kind via `meshChains[iv.chainId]`** — index mapping is correct
5. **P3B for N×M sub-quads** (tracked sweep diagonals) — architecturally sound
6. **`chainGridFlips` diagnostic** — confirmed: counts only non-protected edges
7. **P3C as temporary diagnostic** — viable for root cause confirmation
8. **Option B for triangle inversion** (tolerance bound alone, no geometric check) — acceptable given the corrected adaptive window

## Open Questions for Generator

1. **How is `gapSize` computed for each interpolated vertex?** The multi-row gap interpolation loop at OWT L762-783 creates vertices with index `s` in a gap of `steps` total. The gap size is `steps`. But should the re-snap window scale with the TOTAL gap size or with the vertex's POSITION within the gap? Midpoint vertices (s ≈ steps/2) have maximum quadratic error; edge vertices (s=1 or s=steps-1) have less. Should the window be adaptive per-vertex within a gap?

2. **What is the observed distribution of gap sizes?** If 90% of interpolated vertices have gap=2, a fixed window of ±4 sample widths might suffice. If gaps routinely reach 5-10 rows, the full adaptive formula is needed. Can you extract gap size statistics from a diagnostic run?

3. **For P3B, how many N×M sub-quads actually exist?** If the 1170 chain-grid flips come from only a few hundred N×M sub-quads, the `sweepQuadTracked` approach makes sense. If they come from thousands, the overhead of tracking diagonals in a hot path needs benchmarking. Can you add a diagnostic counter for N×M fallthrough cases?

## Implementation Conditions (if ACCEPT)

### Phase ordering:
1. **P3C diagnostic** (10 min) — add chain-grid constraint to CSO, export, verify dip elimination. Remove before P3B.
2. **P2 with C1+C2 amendments** (~60 lines) — adaptive window, skip batch2Remap'd verts, expose gapSize
3. **P3B for N×M only** (~40 lines) — `sweepQuadTracked` for N×M fallthrough, skip both-sides 2×2 (it's not the source)

### Gate conditions per proposal:

**P2 gates:**
- [ ] Window width MUST be adaptive to gap size (C1). Fixed 2-sample window is REJECTED.
- [ ] batch2Remap'd vertices MUST be filtered out (C2). Re-snapping grid vertices is REJECTED.
- [ ] `interpolatedChainVertices` MUST include `gapSize` field for adaptive window calculation
- [ ] Candidate count should be 64 when HALFWIDTH > 4× SAMPLE_WIDTH (to maintain precision)
- [ ] Diagnostic log MUST include: count refined, count skipped (batch2Remap), avg/max window width used

**P3 gates:**
- [ ] P3C MUST be removed after P3B is implemented — it is not a permanent solution
- [ ] P3B should target N×M sweepQuad fallthroughs ONLY — skip both-sides 2×2 (chain↔chain diagonals)
- [ ] `sweepQuadTracked` must be validated: each tracked edge must have EXACTLY 2 incident triangles in the output (unit test)
- [ ] After P3B: log `chainGridFlips` — expect ~0 (down from 1170), confirming the tracked diagonals are protected

### Validation protocol:
1. Export with P3C only → verify dips disappear → confirms root cause C
2. Remove P3C, add P2 → export → check re-snap log shows meaningful refinement (>50% of interpolated verts)
3. Add P3B → export → check `chainGridFlips ≈ 0`
4. Visual comparison: same style, before vs after, ridge quality at chain-adjacent cells
5. `npm test` — all 1881 tests pass
6. `npm run typecheck && npm run lint` — clean

---

## Severity Summary

| ID | Severity | Status | Who must fix |
|----|----------|--------|-------------|
| C1 | CRITICAL | Blocks P2 | Generator must redesign window width |
| C2 | CRITICAL | Blocks P2 | Generator must filter batch2Remap'd verts |
| C3 | WARNING | Accepted with note | Executioner adds assertion |
| C4 | WARNING | Redirects P3B focus | Generator revises P3B scope |
| C5 | NOTE | Accepted | No action needed |
| C6 | NOTE | Accepted | No action needed |
| C7 | WARNING | Conditionally accepted | P3C for diagnosis only |
| C8 | NOTE | Accepted | No action needed |
| C9 | WARNING | Verified safe | Document reasoning |
