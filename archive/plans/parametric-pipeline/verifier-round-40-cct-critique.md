# Verifier Round 40 — Critique of Chain-Coherent Tessellation (CCT)
Date: 2026-03-08

## Summary Verdict: ACCEPT WITH AMENDMENTS (Proposal 1) / REJECT (Proposal 2)

Proposal 1 (Chain-Fan Diagonal Forcing) targets a real, verified root cause and has a sound 2×2 mechanism. Accept with minor amendments.

Proposal 2 (Pre-Tessellation Bridge Support Vertices) has a CRITICAL T-junction flaw that the Generator's proposed mitigation does not solve. Reject until the T-junction problem is addressed with a concrete implementation path.

---

## 1. Root Cause Validation

### CONFIRMED: sweepQuad diagonal alternation is real

Evidence from [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L226-L254):

```typescript
// Line 231-235: The primary comparison
if (botNextU < topNextU - SWEEP_EPS) {
    emitTriCCW(buf, bot[bi], bot[bi + 1], top[ti], verts);  // advance bot
    bi++;
} else if (topNextU < botNextU - SWEEP_EPS) {
    emitTriCCW(buf, top[ti], top[ti + 1], bot[bi], verts);  // advance top
    ti++;
}
```

`SWEEP_EPS = 1e-8` (line 230). When chain U oscillates by even 0.001 between rows, the comparison is decisive (not in the tie-break zone). The diagonal direction reverses when `chain_bot.u` vs `chain_top.u` changes sign of their difference.

**Concrete worked example:**

Left sub-quad of a chain cell at row j:
- `bot = [BL_j, chain_j]`, `top = [TL_{j+1}, chain_{j+1}]`
- `chain_j.u = 0.500`, `chain_{j+1}.u = 0.510`
- `botNextU = 0.500 < topNextU = 0.510` → advance bot → diagonal: BL→chain_{j+1}

Same sub-quad at row j+1:
- `bot = [BL_{j+1}, chain_{j+1}]`, `top = [TL_{j+2}, chain_{j+2}]`
- `chain_{j+1}.u = 0.510`, `chain_{j+2}.u = 0.490`
- `topNextU = 0.490 < botNextU = 0.510` → advance top → diagonal: chain_{j+1}→TL

The diagonal direction REVERSES. This produces the visible sawtooth.

### CONFIRMED: No downstream pass corrects chain cells

Chain cells are marked `quadMap[quadIdx] = -1` at [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1436). Every downstream topology pass skips them:

| Pass | Skip mechanism | File:Line |
|------|----------------|-----------|
| `chainDirectedFlip` | `if (triBase < 0) return;` in flipToAD/flipToBC | [MeshOptimizer.ts](../../src/renderers/webgpu/parametric/MeshOptimizer.ts#L120), [L144](../../src/renderers/webgpu/parametric/MeshOptimizer.ts#L144) |
| `flipEdges3D` | `if (triBase < 0) continue;` | [MeshOptimizer.ts](../../src/renderers/webgpu/parametric/MeshOptimizer.ts#L340) |
| `optimizeBoundaryDiagonals` | `if (triBase < 0) continue;` | [ChainStripOptimizer.ts](../../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L846) |

The one exception is `optimizeChainStrips` (Phase A/B/C), which operates via edge-adjacency on chain-strip triangles and CAN affect chain cell triangles. See C3 below.

### NOTE: The R36 min-angle tie-breaker is NOT the issue

The R36 tie-breaker (lines 236-254) only activates when `|botNextU - topNextU| <= 1e-8`. Chain U oscillations of 0.001+ are well outside this zone. The alternation is caused by the primary comparison (lines 231-235), not the tie-breaker.

---

## 2. Critique of Proposal 1: Chain-Fan Diagonal Forcing

### C1 [NOTE]: 2×2 chainFanQuad — mechanism is correct

**Generator's claim**: "Always emit triangles fanning FROM the chain edge toward the opposite grid vertex."

**Verification**: For a 2×2 sub-quad with vertices [grid_L, chain_bot] (bottom) and [grid_L_top, chain_top] (top), the fan produces:
- tri(chain_bot, chain_top, grid_L)
- tri(chain_bot, chain_top, grid_L_top)

This is deterministic regardless of whether chain_bot.u < chain_top.u or vice versa. **Confirmed: eliminates alternation.**

**CCW winding**: Handled by `emitTriCCW` at [L181-L196](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L181-L196) — explicit cross-product check. No issue.

**Near-vertical chains (du ≈ 0)**: Both fan triangles span from the chain edge to grid corners at different T-positions. They have non-zero area as long as the chain edge isn't collinear with one of the grid edges. Since chain vertices are interior to grid cells (not on grid edges — those would be batch2Remap'd), this is geometrically safe.

**Chain at grid corner**: batch2Remap merges the chain vertex with the grid vertex (MERGE_THRESHOLD = 1e-4, [L827](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L827)). The sub-quad degenerates to 3 vertices. sweepQuad handles this correctly (single triangle emission via the exhaustion branches at lines 219-224). chainFanQuad must also handle this: **if bot or top has only 1 vertex, skip the fan and fall through to sweepQuad**.

### C2 [WARNING]: chainBiasedSweep for N×M sub-quads — underspecified

**Generator's claim**: "Replace the tie-breaking in sweepQuad with chain-tangent-aware bias."

**Issue**: The proposal doesn't define:
1. Which chain's tangent is used when a sub-quad has no chain edge (e.g., the leftmost/rightmost sub-quads from `constrainedSweepCell` which have only grid vertices)?
2. What happens when two chains cross the same cell and their tangents point in opposite directions?
3. Is the tangent computed from the current row pair only, or from multiple rows of the chain?

**Impact**: N×M sub-quads only occur when there are ≥3 vertices on an edge (rare — typically only in multi-chain cells or super-cells). The 2×2 case covers the vast majority of chain-adjacent triangles. The N×M case can be deferred.

**Required to ACCEPT**: Either (a) restrict Proposal 1 to 2×2 sub-quads only and leave N×M to sweepQuad's current logic, or (b) provide a concrete specification for the N×M tangent selection.

### C3 [WARNING]: ChainStripOptimizer can undo fan diagonals

**Mechanism**: `optimizeChainStrips` operates via edge-adjacency on chain-strip triangles (identified by vertex index ≥ `outerGridVertexCount` or UV-proximity). Chain cell triangles ARE chain-strip triangles. Phase A of the CSO ([ChainStripOptimizer.ts](../../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L580)) flips edges between adjacent chain-strip triangles to maximize minimum angle.

If the CSO finds that the non-fan diagonal has a better min-angle in 3D, it will undo the fan. The CSO only respects `protectedVertices` (R38 corridor), and standard chain cell vertices are NOT in that set.

**Likelihood**: Low. The fan diagonal IS the geometrically superior choice near features (it follows the high-curvature direction). The CSO's 3D min-angle criterion should agree with the fan in most cases. But edge cases exist where the 3D surface curvature near a shallow ridge could make the non-fan diagonal locally optimal.

**Mitigation**: Either (a) add chain cell vertices to the protected set (simple but broad) or (b) add an edge constraint for the chain edge itself (already done — constraint edges are skipped by CSO). Since the chain edge IS a constraint edge, the CSO can only flip the OTHER diagonal in the sub-quad. For a 2×2 fan with only 2 triangles sharing the chain edge, flipping the chain edge is the only option, and that's blocked. **Actually, this means the CSO cannot undo the fan for 2×2 sub-quads.** The shared edge between the two fan triangles IS the chain edge, which is in `constraintEdgeSet`. CSO skips constraint edges at [ChainStripOptimizer.ts](../../src/renderers/webgpu/parametric/ChainStripOptimizer.ts#L581): `if (constraintEdgeSet.has(ek)) continue;`.

**Revised severity**: RESOLVED for 2×2 sub-quads. The constraint edge protection already prevents the CSO from undoing the fan. No additional mitigation needed.

### C4 [NOTE]: Interaction with chainDirectedFlip — no conflict

`chainDirectedFlip` skips all chain cells (quadMap = -1). It only operates on standard cells near chains. The fan diagonal and chainDirectedFlip operate on completely disjoint sets of cells. **No conflict.**

### C5 [NOTE]: Interaction with GPU subdivision — no conflict

`subdivideLongEdges` already respects `protectedVertices` ([MeshSubdivision.ts](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L394-L398)). Even for unprotected chain cell triangles, subdivision only splits long edges — it doesn't change diagonal direction. **No conflict.**

---

## 3. Critique of Proposal 2: Pre-Tessellation Bridge Support Vertices

### C6 [CRITICAL]: T-junction on standard/chain cell boundary

**Generator's claim**: "Register phantom in rowChainVerts so both adjacent cells see it."

**Actual behavior**: `emitStandardCell` at [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1387-L1427) uses ONLY grid vertex indices:

```typescript
const emitStandardCell = (b: number, c: number): void => {
    const bl = b * numU + c;
    const br = b * numU + (c + 1);
    const tl = (b + 1) * numU + c;
    const tr = (b + 1) * numU + (c + 1);
    // ... emits two triangles using only bl, br, tl, tr
```

It does NOT consult `rowChainVerts`, `cellChainMap`, or any phantom vertex list. A bridge support vertex placed on the shared edge between a chain cell and a standard cell would be:
- Visible to the chain cell (included in botEdge/topEdge arrays)
- Invisible to the standard cell (emitStandardCell doesn't know about it)

**Result: T-junction.** The shared edge has 3 vertices (grid corner, bridge support, chain vertex) on the chain cell side and only 2 vertices (grid corners) on the standard cell side. The bridge support is uncovered on the standard cell's triangle face. This creates a gap/seam in the mesh.

**Counterexample**: Chain at column 5 with bridge support at U = 0.4 (between chain at U = 0.5 and grid at U = 0.3). The standard cell at column 4 emits triangle (BL_4, BR_4, TL_4) whose edge BR_4–TR_4 has no intermediate vertex. The chain cell's left sub-quad has vertex at U = 0.4 on the same edge. T-junction.

**To fix**: The adjacent standard cell must be converted to a chain cell, with the bridge support added to its botChainVerts/topChainVerts and the cell added to `cellChainMap`. This is significantly more complex than "~50 lines." It requires:
1. Detecting which standard cells border chain cells with bridge supports
2. Promoting those standard cells to chain cells in `cellChainMap`
3. Setting their `quadMap` entries to -1 (so downstream passes treat them correctly)
4. Building proper bot/top edge arrays with the bridge support vertex

**Estimated complexity**: 150-200 lines, not 50. And it expands the chain cell footprint, which has cascade effects on `chainDirectedFlip` (fewer cells to operate on) and `chainAdjacentVertices` tracking.

### C7 [WARNING]: Phantom buffer registration mismatch

The existing R37 phantom infrastructure ([OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L1052-L1120)) creates PhantomRow objects organized by super-cell band. Bridge supports are conceptually different: they're on the SAME row as the chain vertex, not on phantom rows. They would need a separate registration mechanism.

The phantom vertex buffer has space (`maxPhantomSlots = chainEdges.length * 12` at [L790](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L790)), so buffer overflow is unlikely. But the infrastructure for organizing these vertices into cell edge arrays is different from the PhantomRow system.

### C8 [WARNING]: Scale of bridge support insertion

For ~20 chains × ~243 rows × 2 sides (left/right of chain) = ~9,720 potential bridge support vertices. Each one requires:
- Buffer space (covered by existing overallocation)
- Cell conversion on the adjacent side (per C6)
- Registration in rowChainVerts and cellChainMap

This is significant but not catastrophic. However, it approaches the scale problem that killed the "buffer zones" approach — expanding the chain cell footprint to cover large swaths of the mesh.

### C9 [WARNING]: Close-chain vertex collision

When two chains are separated by 2-3 grid cells, their bridge supports (placed at midpoints between chain and grid) could land in the same cell. This creates a cell with multiple non-chain-edge phantom vertices, potentially producing tiny or degenerate triangles. The proposal doesn't address this case.

### C10 [NOTE]: "~4× curvature error reduction" is optimistic

**Generator's claim**: "Adding midpoint vertices reduces curvature error ~4×."

**Mathematical verification**: For a circular arc with curvature κ, chord error (sagitta) at distance d is:
$$s = \frac{\kappa d^2}{2}$$

Halving d gives $s' = \kappa (d/2)^2 / 2 = s/4$. So 4× is correct for circular profiles.

But superformula ridges are NOT circular. They have curvature that increases near the peak:
$$\kappa(x) = \kappa_0 + \kappa_0'' x^2/2 + \ldots$$

At distance d/2 from the ridge, the local curvature is higher than at distance d, so:
$$s'_{\text{actual}} > \frac{\kappa_0 d^2}{8}$$

**Realistic improvement: 2-3× for superformula ridges**, not 4×. The 4× claim is an upper bound valid only for constant-curvature profiles.

---

## 4. What the Generator Got Right

### R40 Subdivision Protection — ALREADY IMPLEMENTED

The on-disk document (`generator-round-40-protected-subdivision-corridor.md`) proposes threading `protectedVertices` into `subdivideLongEdges`. This is **already fully implemented**:

- `SubdivisionParams.protectedVertices` exists at [MeshSubdivision.ts:L82](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L82)
- `touchesProtectedPatch` guard at [MeshSubdivision.ts:L393-L399](../../src/renderers/webgpu/parametric/MeshSubdivision.ts#L393)
- `outerProtectedStripVertices` threaded at [ParametricExportComputer.ts:L1614](../../src/renderers/webgpu/ParametricExportComputer.ts#L1614)

The Generator's analysis of the subdivision pass as the last unprotected topology mutation was correct, and the fix is already live in the codebase. This is not a critiqueable claim — it's done.

---

## 5. Historical Pattern Analysis

### #1 Most Likely Failure Mode: Bridge support T-junctions

The historical pattern in this project is clear: proposals that create new vertices at cell boundaries fail because the tessellator's cell-based architecture assumes complete vertex knowledge per cell. Bridge supports violate this by placing vertices on boundaries that adjacent cells don't know about.

| Failed proposal | Boundary mechanism | Similarity |
|---|---|---|
| v20 UV snapping | Seam unzip at U=0/1 boundary | Vertex placement at cell boundary |
| Buffer zones | Covered entire surface | Expanding chain cell footprint |
| **Bridge supports** | **T-junction at standard/chain boundary** | **Vertex placement at cell boundary** |

The Chain-Fan Diagonal Forcing (Proposal 1) avoids this trap because it changes NO vertices — only the DIAGONAL CHOICE within existing cells. No new vertices, no cell boundary interactions, no footprint expansion.

---

## 6. Accepted Items

1. **Root cause of sawtooth**: sweepQuad U-comparison alternation when chain U oscillates. VERIFIED with code evidence.
2. **Chain cells are invisible to downstream passes**: quadMap=-1 means chainDirectedFlip, flipEdges3D, and boundaryDiag all skip them. VERIFIED.
3. **chainFanQuad 2×2 mechanism**: Deterministic fan from chain edge eliminates alternation. Geometrically sound. CCW winding handled by emitTriCCW. VERIFIED.
4. **Constraint edge protection**: Chain edges in constraintEdgeSet prevent CSO from undoing the fan for 2×2 sub-quads. VERIFIED.
5. **No downstream conflicts**: Fan diagonals are compatible with all 5 downstream passes. VERIFIED.

---

## 7. Open Questions for Generator

1. **N×M tangent specification**: Which chain's tangent breaks the tie in chainBiasedSweep? What if sub-quad has no chain endpoint? Defer or specify.
2. **Bridge support T-junction fix**: How do you plan to convert adjacent standard cells to chain cells without expanding the chain footprint so broadly that downstream passes lose coverage?
3. **Bridge support threshold**: "> 2× average grid cell width" — is this in UV space or 3D space? UV-space thresholds are unreliable due to circumferential stretch variation (see `estimateCircumferentialStretch` at [L135](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L135)).

---

## 8. Final Verdict

### Proposal 1 (Chain-Fan Diagonal Forcing): ACCEPT WITH AMENDMENTS

**Amendments**:
- **A1**: Restrict to 2×2 sub-quads only. Defer the N×M chainBiasedSweep until a concrete tangent-selection spec is provided. The 2×2 case covers the vast majority of chain-adjacent triangles.
- **A2**: Add a guard: if the sub-quad has < 2 vertices on bottom or top (degenerate from batch2Remap), skip the fan and fall through to sweepQuad.
- **A3**: No additional CSO protection needed — constraint edge set already blocks chain-edge flips.

**Implementation scope**: ~60 lines in `constrainedSweepCell` (not sweepQuad itself). Add a pre-check before each `sweepQuad` call: if the sub-quad is 2×2 and has exactly one chain edge, emit the fan directly instead of calling sweepQuad.

### Proposal 2 (Bridge Support Vertices): REJECT

**Primary reason**: CRITICAL T-junction flaw (C6) with no concrete mitigation.

**Path to ACCEPT**: Provide a complete implementation plan that:
1. Converts adjacent standard cells to chain cells when bridge supports are added
2. Updates cellChainMap, quadMap, and rowChainVerts for converted cells
3. Addresses close-chain collision (C9)
4. Provides realistic line count estimate (150-200, not 50)
5. Addresses the footprint expansion risk with a hard cap on bridge support insertion density

### Proposal 3 (Combined): REJECT as stated

Accept Proposal 1 (with amendments) as a standalone change. Defer Proposal 2 until the T-junction issue is resolved. Do NOT combine them in a single implementation — the fan diagonal forcing is safe and independently valuable.

---

## 9. Implementation Conditions for Executioner (Proposal 1 only)

1. **Location**: Modify `constrainedSweepCell` in [OuterWallTessellator.ts](../../src/renderers/webgpu/parametric/OuterWallTessellator.ts#L290-L360)
2. **Mechanism**: Before each `sweepQuad(buf, subBot, subTop, verts)` call (lines 321, 340, 350), check if `subBot.length === 2 && subTop.length === 2` and exactly one chain edge connects `subBot[i]` to `subTop[j]`. If so, emit the fan directly: `emitTriCCW(buf, chain_bot, chain_top, grid_opposite_1, verts)` + `emitTriCCW(buf, chain_bot, chain_top, grid_opposite_2, verts)`.
3. **Degenerate guard**: If subBot or subTop has length < 2 after dedup/remap, skip the fan.
4. **Chain vertex detection**: Use the existing `chainEdges` parameter to identify which vertices in the sub-quad are chain endpoints. A vertex is a chain endpoint if it appears in any edge tuple.
5. **Test**: Add a test case with a zigzagging chain (U oscillates ±0.02) across 10 rows. Verify that the diagonal direction is consistent (always fans from chain edge) across all rows.

### Validation Protocol

| Metric | Expected | How to verify |
|---|---|---|
| Diagonal consistency | 100% fan direction in chain cells | New unit test with oscillating chain |
| Zero regressions | All existing OWT tests pass | `npm test` |
| No T-junctions | Mesh manifold check passes | Existing manifold validation in export |
| No degenerate triangles | 0 degenerate tris in chain cells | Export log inspection |
| No CSO undoing | CSO flip count near chain cells ≈ unchanged | Compare export log before/after |
