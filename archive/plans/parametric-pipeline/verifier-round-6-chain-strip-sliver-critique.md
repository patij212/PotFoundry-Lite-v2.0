# Verifier Round 6 — Critique of Generator Chain-Strip Sliver Root Cause & Fix Proposal
Date: 2026-03-10

## Summary Verdict: ACCEPT WITH AMENDMENTS

The root cause analysis is **sound and well-evidenced**. All three mechanistic claims are verified against the actual source code. The causal chain (CDF clustering → near-coincident pairs → R52 blocks merging → sweepQuad emits slivers) is correct.

However, the proposed fix (Proposal 1: edge-local vertex coalescing) has **two critical gaps**:
1. The T-junction risk is incorrectly dismissed as "below printer resolution" — the issue is topological, not geometric
2. The proposal only targets outer boundary edges of super-cells, ignoring slivers within R37 phantom row sub-bands

The 80% reduction estimate is ungrounded speculation. Proposal 2 (horizontal BPP) must be **mandatory**, not optional.

---

## Claim Verification

### C1 [VERIFIED]: CDF density clustering creates near-coincident grid/chain vertex pairs

**Generator's claim**: "`buildDensityProfile` (GridBuilder.ts L242-L265) creates a Gaussian density peak at each chain vertex U-position"

**Actual code**: `buildDensityProfile` starts at [GridBuilder.ts L235](../../src/renderers/webgpu/parametric/GridBuilder.ts#L235), with the Gaussian loop at L252-260:
```typescript
for (const cu of chainVertexUs) {
    const centerIdx = Math.round(cu * N) % N;
    const spreadSamples = Math.ceil(featureRadius * N * 3); // 3σ cutoff
    for (let off = -spreadSamples; off <= spreadSamples; off++) {
        const idx = ((centerIdx + off) % N + N) % N;
        const du = off / (featureRadius * N);
        const contribution = featureFloor * Math.exp(-0.5 * du * du);
        density[idx] = Math.max(density[idx], contribution);
    }
}
```

`generateCDFAdaptivePositions` at [GridBuilder.ts L153](../../src/renderers/webgpu/parametric/GridBuilder.ts#L153) inverts the CDF to place columns proportionally to density, confirmed by the call at [PEC L1421-1422](../../src/renderers/webgpu/ParametricExportComputer.ts#L1421):
```typescript
const densityProfile = buildDensityProfile(uCurvature, chainVertexUs, 0.6, 0.004);
const unionU = generateCDFAdaptivePositions(densityProfile, maxOuterColumns, 0.3, true);
```

**Minor error**: Generator cites "L242-L265" — actual Gaussian loop is L252-260. The function starts at L235. Functionally correct, line numbers off by 10-15.

**Verdict**: ✅ VERIFIED. The mechanism is exactly as described.

---

### C2 [VERIFIED]: R52 Precision Lock prevents all 3 merging mechanisms

**batch2Remap (DISABLED)**: Confirmed at [OWT L823-833](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L823):
```typescript
// ╔══════════════════════════════════════════════════════════════════════╗
// ║ 🔒 R52 PRECISION LOCK — batch2Remap DISABLED                        ║
// ...
const batch2Remap = new Map<number, number>(); // always empty
```

**Batch 6 dedup (GUARDED)**: Confirmed at [OWT L2048-2080](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L2048). Cross-type guard at L2079-2082:
```typescript
const vIsChain = v >= gridVertexCount;
const existIsChain = existing >= gridVertexCount;
if (vIsChain !== existIsChain) {
    continue; // Both vertices survive
}
```

**upsertPhantomRowVertex (GUARDED)**: Confirmed at [OWT L1169-1210](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1169). `phantomChainAnchorSet` tracking at L1176-1210 ensures chain anchors skip grid column vertices and vice versa.

**Distilled context** at [AGENT_CONTEXT_DISTILLED.md L203-212](../../docs/AGENT_CONTEXT_DISTILLED.md#L203) confirms all three plus the invariant: *"Chain vertices and grid vertices NEVER merge, average, snap, or move toward each other."*

**Verdict**: ✅ VERIFIED. All three mechanisms are disabled/guarded exactly as claimed.

---

### C3 [PARTIALLY VERIFIED]: Pin triangles as primary source of 47.7% violations

**Generator's claim**: Near-coincident grid+chain vertex pairs on super-cell edges, swept by `sweepQuad`, create the majority of the 47.7% aspect ratio violations (>4:1).

**What IS verified**:
- The sweep mechanism at [OWT L252-310](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L252) advances through sorted edge vertices. Near-coincident pairs in sorted order will produce needle triangles from the advance step. ✅
- Super-cell edge construction at [OWT L1876-1906](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1876) includes both intermediate grid columns AND chain vertices, then sorts by U. ✅
- R54 skips that are already R35 super-cells at [OWT L1007-1009](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1007). ✅

**What is NOT verified — CRITICAL GAPS**:

**Gap 3a**: The claim that super-cells contain "most bad triangles" is an **inference**, not a measurement. The Generator states "57.5% of chain cells are super-cells" but provides **zero evidence** that these super-cells contain a proportional or disproportionate share of the 47.7% violations. The `computeChainStrip3DQuality` function at [ChainStripOptimizer.ts L1218-1270](../../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L1218) counts violations across ALL chain-strip triangles — there is no per-cell-type breakdown.

**Gap 3b**: Non-super-cell chain cells (42.5% of chain cells) also create near-coincident situations. `emitChainCell` at [OWT L1651-1684](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1651) builds edges `[BL, ...info.botChainVerts, BR]`. When a chain vertex is near corner BL or BR, the same pin-triangle mechanism occurs. Proposal 1 targets super-cells only — what about these?

**Gap 3c**: R37 phantom row sub-bands within super-cells. When `emitSuperCell` processes R37 bands at [OWT L1930-1960](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1930), it uses `boundaries[sb]` arrays that include phantom row vertex indices. These phantom rows contain BOTH chain anchor vertices AND grid column boundary vertices (created by `upsertPhantomRowVertex`). Near-coincident pairs **also exist on phantom row boundaries**, not just the outer bot/top edges. Proposal 1 only coalesces `finalBot`/`finalTop` — it misses phantom row boundaries entirely.

**Gap 3d**: R38 companion vertices at [OWT L1344-1363](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1344) are placed at `R38_COMPANION_FRACTION = 0.5` of the distance between chain anchor and adjacent phantom row vertex. These companions create additional vertices on phantom row edges that could contribute to slivers if near a grid column boundary vertex.

**Verdict**: ⚠️ PARTIALLY VERIFIED. The geometric mechanism is correct. The quantitative claim (primary source, 80% reduction from fixing) is unsubstantiated. Multiple additional sliver sources are ignored.

---

### C4 [WARNING]: `applyChainDeadZones` disabled

**Generator's claim**: "PEC L1416-1421 comment" explains dead zones not applied.

**Actual location**: [PEC L1415-1420](../../src/renderers/webgpu/ParametricExportComputer.ts#L1415):
```typescript
// v21.0 CAG: Build curvature-adaptive U grid with Gaussian feature floor.
// Dead zones are NOT applied: with drifting chains (U-drift ~0.094 per chain
// over 313 rows) and shared columns, global dead zones destroy the CDF
// structure — chain points spaced ~0.0004 apart create continuous exclusion
// bands that tile ~100% of U-space. The CDT + vertex dedup handles
// near-coincident grid/chain vertices naturally.
```

**Critical observation**: The comment says *"CDT + vertex dedup handles near-coincident grid/chain vertices naturally"* — but CDT was removed (R34) and vertex dedup was guarded (R52). The comment's stated fallback mechanism **no longer exists**. This is exactly what the Generator identifies, and it's verified.

**Verdict**: ✅ VERIFIED. The orphaned comment accurately reflects the safety net gap.

---

## Critique of Proposal 1: Edge-Local Vertex Coalescing

### C5 [CRITICAL]: T-junction risk is topological, not geometric

**Generator's claim**: Micro-T-junctions from coalescing are "≤0.001 U ≈ 0.25mm — below 3D printer resolution" and can be dismissed.

**Counterexample**: Consider super-cell at band B spanning columns [3, 7]. Intermediate grid vertex at (B, col=5) = vertex index `B * numU + 5`. The standard cell at (B-1, col=5) uses this same vertex as its TL corner:

- Standard cell (B-1, 5): TL = `B * numU + 5`, TR = `B * numU + 6`
- Super-cell (B, 3..7): botEdge includes `B * numU + 5` alongside chain vertices

If coalescing drops gridV = `B * numU + 5` from the super-cell's bot edge because a chain vertex at U=0.0835 is within 0.001 of gridV at U=0.0836:

- Standard cell (B-1, 5) still references vertex `B * numU + 5` on its top edge
- Super-cell (B, 3..7) no longer references this vertex on its bot edge
- The vertex sits ON the super-cell's boundary but is NOT part of any super-cell triangle

**Result**: A gap in the mesh. The boundary edge from the standard cell (involving gridV) has only 1 adjacent face. The super-cell's spanning edge has only 1 adjacent face. This is a **boundary edge pair** creating a hole — detectable by `checkManifold` at [MeshValidator.ts L248-278](../../src/renderers/webgpu/parametric/MeshValidator.ts#L248) as increased `boundaryEdges`.

**This is not about geometric SIZE — it's about TOPOLOGICAL CORRECTNESS.** A mesh with T-junctions is not watertight. STL slicers (PrusaSlicer, Cura) will flag or attempt repair. For 3D printing export — PotFoundry's primary output — non-watertight meshes are a critical defect.

**Required fix**: Proposal 2 (horizontal BPP) must be **mandatory**, not optional. When a grid vertex is coalesced from a super-cell boundary, the adjacent cell sharing that boundary must be notified to also drop (or replace) the vertex. This is a hard requirement.

### C6 [CRITICAL]: Phantom row sub-band boundaries are not addressed

**Generator's claim**: Proposal 1 adds coalescing "after `const finalBot = dedupEdge(botEdge)`" in `emitSuperCell`.

**Problem**: When `emitSuperCell` processes R37 phantom rows at [OWT L1930-1960](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1930), it builds sub-band boundaries from `[finalBot, phantomRow1, ..., phantomRow_n, finalTop]`. Each phantom row's `vertexIndices` array contains both:
- Chain anchor vertices (via `phantomChainAnchorSet`)
- Grid column boundary vertices (from `upsertPhantomRowVertex` non-anchor path)

These intermediate boundaries also have near-coincident grid+chain pairs. `sweepQuad` or `constrainedSweepCell` is called for EACH sub-band, and each sub-band's bot/top edges can contain pin-triangle-causing pairs.

**Scope of the gap**: R37 phantom rows exist for every super-cell with chain crossings. The Generator correctly identifies that phantom row interaction is "an open question" (Question 3) but fails to recognize it's not optional — it's a **first-class source of the same problem**.

Coalescing must be applied to ALL edge arrays passed to `sweepQuad`/`constrainedSweepCell`, not just `finalBot`/`finalTop`.

**Required fix**: The coalescing function must be applied to every `subBot`/`subTop` array in the R37 loop, and to `botEdge`/`topEdge` in `emitChainCell` as well.

### C7 [WARNING]: 80% reduction estimate is fabricated

**Generator's claim**: "Eliminates ~80% of super-cell slivers" → "total violation rate should drop from 47.7% to ~10-15%"

**Evidence**: None. This is a back-of-envelope guess with no diagnostic data behind it. The 80% assumes:
1. Super-cells contain 80% of bad triangles (unproven — see Gap 3a)
2. All bad triangles in super-cells are caused by near-coincident pairs on outer edges (unproven — phantom row boundaries, fan triangles at chain edges, and constrainedSweepCell partitioning also contribute)
3. COALESCE_RADIUS of 0.001 catches all near-coincident pairs (unproven — the actual ΔU distribution is not measured)

**Required**: Before implementing, add a **diagnostic pass** to `emitSuperCell` that counts: for each chain-strip triangle with aspect > 4:1, does it contain a near-coincident grid+chain vertex pair (ΔU < 0.001)? Report this count separately for super-cells vs chain-cells vs phantom-row-split cells. This gives a ground-truth upper bound for the coalescing fix.

### C8 [WARNING]: COALESCE_RADIUS sensitivity

**Generator proposes**: `GRID_CHAIN_COALESCE_RADIUS = max(0.5 * avgColumnSpacing, 0.0005)`

**Analysis**: Average column spacing ≈ 1/577 ≈ 0.00173. So 0.5 × 0.00173 = 0.000865, clamped up to 0.001. This means any grid vertex within 0.001 U of a chain vertex gets dropped.

- **Too aggressive?** At 577 columns, there are ~20 chains with ~243 points each. If each chain point can coalesce a grid vertex within 0.001 U, and column spacing is 0.00173 U, roughly ~58% of intermediate grid columns near chains could be dropped (0.001/0.00173). This is a LOT of removed vertices.

- **Too conservative?** The Generator's own math shows violations (>4:1) occur when ΔU < 0.0006 (for edge length 0.6mm, circumference 251mm). Setting COALESCE_RADIUS = 0.001 is 67% ABOVE this threshold. Why not use 0.0006 directly? More conservative, fewer T-junctions, still catches all true violations.

**Recommendation**: Start with `COALESCE_RADIUS = 0.0006` (the exact violation threshold) rather than 0.001. If results are insufficient, increase incrementally with diagnostic tracking of the T-junction count increase.

### C9 [NOTE]: R52 compatibility is acceptable

**Generator's claim**: Dropping grid vertices doesn't violate R52 because chain vertices are never moved, merged, averaged, or snapped.

**Analysis**: Correct. The R52 invariant at [AGENT_CONTEXT_DISTILLED.md L210](../../docs/AGENT_CONTEXT_DISTILLED.md#L210) states: *"Chain vertices and grid vertices NEVER merge, average, snap, or move toward each other."* Dropping a grid vertex from an edge array without moving the chain vertex satisfies this invariant.

The three bugs R52 prevented:
1. Chain vertices replaced by grid vertices → chain vertex survives here ✅
2. Chain vertices snapped to grid quantization → chain vertex untouched ✅
3. Chain anchors merged with grid boundary phantoms → no phantom merging here ✅

**However**: The SPIRIT of R52 is that both vertex types coexist at their exact positions, with triangulation handling the near-coincidence. Proposal 1 abandons this principle by saying "triangulation CAN'T handle near-coincidence, so we suppress one vertex." This is a **pragmatic retreat**, not a violation. Document it clearly at the insertion point with an R55/R56 comment block explaining the relationship to R52.

**Verdict**: ✅ ACCEPTABLE. No R52 invariant broken. Add documentation.

### C10 [NOTE]: `emitChainCell` also has near-coincident pairs at corners

**Generator's claim**: Proposal 1 targets `emitSuperCell` primarily.

**Observation**: `emitChainCell` at [OWT L1663-1672](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1663) builds:
```typescript
const botEdge: number[] = [BL];
for (const cvIdx of info.botChainVerts) {
    botEdge.push(cvIdx);
}
botEdge.push(BR);
```

When a chain vertex has U ≈ U_BL (grid corner), another pin triangle is created. These are less frequent (only at corners, not intermediate columns) but still contribute to the violation count.

Proposal 1 should also apply coalescing in `emitChainCell`, not just `emitSuperCell`. The Generator mentions this in passing ("optional, lower priority") but it should be standard scope.

---

## Accepted Items

1. **The 5-link causal chain is correct**: CDF clustering → near-coincident pairs → R52 blocks merging → dead zones disabled → sweepQuad emits slivers. ✅
2. **R54 plateau diagnosis is correct**: R54 treats cell boundaries, not cell interiors; it skips 57.5% of chain cells; fusion creates MORE near-coincident pairs, not fewer. ✅
3. **Edge flips can't fix needle triangles**: When both vertices of a degenerate base are in the quad, neither diagonal helps. ✅
4. **Proposal 3 (density moat) rejection is correct**: Same tiling pathology as dead zones. ✅
5. **Proposal 4 (3D-aware sweep) as complementary**: Correct that it's insufficient alone but helpful after vertex coalescing. ✅
6. **R52 compatibility of Proposal 1**: Grid vertex dropping doesn't violate R52. ✅

---

## Open Questions for Generator

1. **Quantitative validation**: Can you add a diagnostic to the export pipeline that counts, for each chain-strip triangle with aspect > 4:1, whether it contains a near-coincident grid+chain vertex pair (ΔU < threshold)? Partition this count by cell type (super-cell outer edge, super-cell phantom sub-band, chain-cell corner, chain-split-cell). This would ground-truth the 80% estimate.

2. **Phantom row coalescing**: Do you agree that coalescing must also apply to R37 phantom row boundary arrays? If so, does this change the LOC estimate?

3. **emitChainCell scope**: Do you agree that coalescing at chain-cell corners (BL/BR near chain vertex) should be in-scope for the initial implementation?

4. **COALESCE_RADIUS justification**: Why 0.001 instead of the mathematically-derived 0.0006? The extra 67% margin means ~58% more T-junctions. What's the benefit?

---

## Implementation Conditions (for Executioner, if ACCEPT after Generator response)

### Mandatory before implementation:
1. Generator must acknowledge C5 (T-junction topological risk) and agree to make Proposal 2 mandatory
2. Generator must address C6 (phantom row coalescing scope)
3. A diagnostic pass must be added FIRST to validate the causal claim quantitatively (Question 1 above)

### Implementation order:
1. **Diagnostic**: Add per-cell-type aspect ratio breakdown to export logs
2. **Coalescing function**: `coalesceNearGridChain(edge, vertices, gridVertexCount, radius)` — drops grid vertices within radius of any chain vertex in sorted edge
3. **Apply to ALL sweep inputs**: `emitSuperCell` finalBot/finalTop, R37 subBot/subTop, `emitChainCell` botEdge/topEdge, `emitChainSplitCell` edges
4. **Horizontal BPP integration**: When a grid vertex is coalesced, record (band, colIndex, chainVertexIdx). Adjacent cells at (band-1, colIndex) and (band+1, colIndex adjusted) must either also drop the vertex or insert the chain vertex.
5. **COALESCE_RADIUS**: Start at 0.0006, measure, increase if needed
6. **Documentation**: Add R55 comment block at each insertion point documenting relationship to R52

### Validation protocol:
- `computeChainStrip3DQuality` violation rate must decrease from 47.7% (measure actual delta)
- `checkManifold` boundary edge count must NOT increase (proves T-junctions handled)
- `val3Interior` count must NOT increase (proves no new interior T-junctions)
- Edge flip count should decrease (fewer degenerate inputs to flip system)
- All existing tests must pass; ESLint clean; typecheck clean
